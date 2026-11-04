package nl.pandaos.launcher

import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.Base64
import org.json.JSONObject
import java.io.ByteArrayOutputStream

// Volgt wat er speelt in andere apps (Spotify, YouTube, radio-apps ...) via hun mediasessie en geeft dat door
// aan de webapp (window.PandaOS.setNowPlaying / setNowPlayingCover). Bedienen gaat via command().
// Werkt pas als de meldingen-toegang voor PandaOS aan staat (zie MediaListenerService).
class MediaWatcher(private val context: Context, private val send: (String) -> Unit) {

    private val sessionManager = context.getSystemService(MediaSessionManager::class.java)
    private val listener = ComponentName(context, MediaListenerService::class.java)
    private val handler = Handler(Looper.getMainLooper())
    private var controller: MediaController? = null
    private var started = false
    private var lastCoverKey: String? = null
    private var lastSent: String? = null

    private val sessionsListener = MediaSessionManager.OnActiveSessionsChangedListener { sessions ->
        pickController(sessions ?: emptyList())
    }

    private val callback = object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?) = push()
        override fun onPlaybackStateChanged(state: PlaybackState?) {
            // Een andere app kan intussen zijn begonnen met spelen
            refreshSessions()
            push()
        }
        override fun onSessionDestroyed() = refreshSessions()
    }

    // Elke seconde de positie bijwerken zolang er iets speelt (voortgangsbalk in de mediakaart)
    private val ticker = object : Runnable {
        override fun run() {
            push()
            handler.postDelayed(this, 1000)
        }
    }

    fun hasAccess(): Boolean {
        val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
        return enabled.split(':').any { ComponentName.unflattenFromString(it) == listener }
    }

    // Aanroepen bij onResume: na het geven van toegang begint het volgen meteen
    fun start() {
        if (started || !hasAccess()) return
        try {
            sessionManager.addOnActiveSessionsChangedListener(sessionsListener, listener, handler)
            started = true
            refreshSessions()
            handler.post(ticker)
        } catch (_: SecurityException) {
            // toegang (nog) niet gegeven
        }
    }

    fun stop() {
        if (!started) return
        sessionManager.removeOnActiveSessionsChangedListener(sessionsListener)
        handler.removeCallbacks(ticker)
        controller?.unregisterCallback(callback)
        controller = null
        started = false
    }

    // play, pause, next, prev (vanuit de PandaOS-mediakaart en de stuurknoppen)
    fun command(cmd: String) {
        val controls = controller?.transportControls ?: return
        when (cmd) {
            "play" -> controls.play()
            "pause" -> controls.pause()
            "next" -> controls.skipToNext()
            "prev" -> controls.skipToPrevious()
        }
    }

    private fun refreshSessions() {
        try {
            pickController(sessionManager.getActiveSessions(listener))
        } catch (_: SecurityException) {
            stop()
        }
    }

    // Voorkeur voor de app die nu speelt; anders de bovenste (laatst gebruikte). Eigen app overslaan.
    private fun pickController(sessions: List<MediaController>) {
        val others = sessions.filter { it.packageName != context.packageName }
        val chosen = others.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING } ?: others.firstOrNull()
        if (chosen?.sessionToken == controller?.sessionToken) return
        controller?.unregisterCallback(callback)
        controller = chosen
        chosen?.registerCallback(callback, handler)
        push()
    }

    private fun push() {
        val c = controller
        val metadata = c?.metadata
        val title = metadata?.getString(MediaMetadata.METADATA_KEY_TITLE)
            ?: metadata?.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)
        if (c == null || metadata == null || title.isNullOrEmpty()) {
            sendOnce("setNowPlaying(null)")
            lastCoverKey = null
            return
        }
        val artist = metadata.getString(MediaMetadata.METADATA_KEY_ARTIST)
            ?: metadata.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
            ?: metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE) ?: ""
        val state = c.playbackState
        val playing = state?.state == PlaybackState.STATE_PLAYING
        val json = JSONObject()
            .put("title", title)
            .put("artist", artist)
            .put("app", c.packageName)
            .put("isPlaying", playing)
            .put("position", currentPosition(state) / 1000)
            .put("duration", (metadata.getLong(MediaMetadata.METADATA_KEY_DURATION).coerceAtLeast(0)) / 1000)
        sendOnce("setNowPlaying($json)")
        pushCover(metadata, "${c.packageName}|$title|$artist")
    }

    // Positie in ms, doorgerekend sinds de laatste melding van de app
    private fun currentPosition(state: PlaybackState?): Long {
        if (state == null || state.position < 0) return 0
        if (state.state != PlaybackState.STATE_PLAYING) return state.position
        val elapsed = SystemClock.elapsedRealtime() - state.lastPositionUpdateTime
        return state.position + (elapsed * state.playbackSpeed).toLong()
    }

    // Hoes alleen opnieuw versturen als het nummer verandert (verkleind, als data-URL)
    private fun pushCover(metadata: MediaMetadata, key: String) {
        if (key == lastCoverKey) return
        val bitmap = metadata.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART)
            ?: metadata.getBitmap(MediaMetadata.METADATA_KEY_ART)
            ?: metadata.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON)
        if (bitmap == null && metadata.getString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI) == null) {
            lastCoverKey = key
            send("setNowPlayingCover(null)")
            return
        }
        if (bitmap == null) {
            // Hoes als internetadres: de webapp kan die zelf laden
            lastCoverKey = key
            send("setNowPlayingCover(${JSONObject.quote(metadata.getString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI))})")
            return
        }
        lastCoverKey = key
        val size = 300
        val scaled = if (bitmap.width > size || bitmap.height > size) {
            val ratio = size.toFloat() / maxOf(bitmap.width, bitmap.height)
            Bitmap.createScaledBitmap(bitmap, (bitmap.width * ratio).toInt(), (bitmap.height * ratio).toInt(), true)
        } else bitmap
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 85, out)
        val dataUrl = "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        send("setNowPlayingCover(${JSONObject.quote(dataUrl)})")
    }

    // Na het (her)laden van de webapp alles opnieuw sturen
    fun resend() {
        lastSent = null
        lastCoverKey = null
        if (started) push()
    }

    // Niet elke seconde hetzelfde versturen als er niets veranderd is (bijv. gepauzeerd)
    private fun sendOnce(call: String) {
        if (call == lastSent) return
        lastSent = call
        send(call)
    }
}
