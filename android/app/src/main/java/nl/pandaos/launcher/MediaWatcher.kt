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

    // Muziek zonder mediasessie: veel (radio-)apps, ook Bluetooth-muziek van de fabrikant, sturen het nummer als
    // broadcast (zoals de oude Android-muziekspeler). Laatste nummer daaruit; gebruikt als er geen sessie is.
    private var broadcastInfo: JSONObject? = null
    private var broadcastAt = 0L
    private val seenActions = HashSet<String>()

    // CarPlay en Android Auto (onderzoek APK's, 6-11-2026): de radio meldt verbinden en audio met broadcasts van
    // Jancar/Autochips. Tijdens CarPlay is er geen mediasessie met titel; dan toont PandaOS "Speelt via CarPlay".
    // De letterlijke namen van de extra's kennen we nog niet: we kijken naar alle tekstwaarden en loggen ze.
    private var projection: String? = null // "carplay" of "androidauto" (verbonden)
    private var projectionAudio = false
    private val loggedProjection = HashSet<String>()
    private val projectionReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: android.content.Intent) {
            val action = intent.action ?: return
            val extras = intent.extras
            val values = extras?.keySet()?.mapNotNull { extras.get(it)?.toString() } ?: emptyList()
            val described = "$action ${extras?.keySet()?.joinToString { "$it=${extras.get(it)}" } ?: ""}"
            if (loggedProjection.size < 200 && loggedProjection.add(described)) DiagLog.add("info", "Projectie: $described")
            val kind = if (action.contains("carplay", true)) "carplay" else "androidauto"
            val text = (values + action).joinToString(" ").uppercase()
            when {
                text.contains("DISCONNECT") || action.endsWith("android_auto_end") -> {
                    if (projection == kind) { projection = null; projectionAudio = false }
                }
                text.contains("AUDIO_STOP") -> { projection = kind; projectionAudio = false }
                text.contains("AUDIO_START") -> { projection = kind; projectionAudio = true }
                text.contains("CONNECTED") || action.endsWith("carplay_connected") || action.endsWith("android_auto_start")
                    || action.endsWith("AA_STARTED") -> projection = kind
            }
            push()
        }
    }
    private val metaReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: android.content.Intent) {
            val action = intent.action ?: return
            val extras = intent.extras
            if (seenActions.add(action)) DiagLog.add("info", "Muziekmelding: $action ${extras?.keySet()?.joinToString { "$it=${extras.get(it)}" } ?: ""}")
            fun str(vararg keys: String) = keys.firstNotNullOfOrNull { k -> extras?.get(k)?.toString()?.takeIf { it.isNotBlank() } }
            val title = str("track", "title", "name", "TRACK", "TITLE", "song") ?: return
            val playing = extras?.get("playing") ?: extras?.get("isPlaying") ?: extras?.get("playstate")
            broadcastInfo = JSONObject()
                .put("title", title)
                .put("artist", str("artist", "ARTIST", "singer") ?: "")
                .put("app", str("package", "app") ?: action.substringBeforeLast('.'))
                .put("isPlaying", playing?.toString()?.let { it == "true" || it == "1" || it == "3" } ?: true)
                .put("position", (extras?.get("position") as? Number)?.toLong()?.div(1000) ?: 0)
                .put("duration", ((extras?.get("duration") as? Number)?.toLong() ?: 0) / 1000)
            broadcastAt = SystemClock.elapsedRealtime()
            push()
        }
    }

    init {
        val filter = android.content.IntentFilter().apply {
            listOf("com.android.music.metachanged", "com.android.music.playstatechanged", "com.android.music.queuechanged",
                "com.spotify.music.metadatachanged", "com.spotify.music.playbackstatechanged",
                "com.sec.android.app.music.metachanged", "com.htc.music.metachanged", "fm.last.android.metachanged",
                "com.amazon.mp3.metachanged", "com.miui.player.metachanged", "com.real.IMP.metachanged",
                "com.rdio.android.metachanged", "com.andrew.apollo.metachanged",
                // Bluetooth-muziek (AVRCP) via de Bluetooth-dienst van Android
                "android.bluetooth.avrcp-controller.profile.action.TRACK_EVENT",
                "com.android.bluetooth.avrcp.action.TRACK_CHANGED",
                // Jancar en andere fabrikanten (namen geraden; elke ontvangen melding komt in het logboek)
                "com.jancar.bluetooth.music.metachanged", "com.jancar.btmusic.metachanged", "com.jancar.music.metachanged",
                "com.jancar.action.BT_MUSIC_INFO", "com.jancar.bluetooth.action.MUSIC_INFO",
            ).forEach { addAction(it) }
        }
        try {
            if (android.os.Build.VERSION.SDK_INT >= 33) context.registerReceiver(metaReceiver, filter, Context.RECEIVER_EXPORTED)
            else context.registerReceiver(metaReceiver, filter)
        } catch (_: Exception) {}
        val projectionFilter = android.content.IntentFilter().apply {
            listOf("com.jancar.carplay_connected", "com.jancar.carplay_disconnect", "com.jancar.carplay_show",
                "com.jancar.carplay_hidden", "action.android.carplay.send", "action.android.auto.send",
                "com.google.android.projection.android_auto_start", "com.google.android.projection.android_auto_end",
                "autochips.intent.action.AA_STARTED",
            ).forEach { addAction(it) }
        }
        try {
            if (android.os.Build.VERSION.SDK_INT >= 33) context.registerReceiver(projectionReceiver, projectionFilter, Context.RECEIVER_EXPORTED)
            else context.registerReceiver(projectionReceiver, projectionFilter)
        } catch (_: Exception) {}
    }

    // CarPlay of Android Auto openen (knop op de muziekkaart bij "Speelt via ...")
    fun openProjection(): Boolean {
        val kind = projection ?: return false
        val component = if (kind == "carplay") ComponentName("com.autochips.carplayapp", "com.autochips.carplayapp.CarPlayActivity")
            else ComponentName("com.google.android.projection.sink", "com.google.android.projection.sink.ui.AndroidAutoActivity")
        val pkg = component.packageName
        val intent = android.content.Intent().setComponent(component).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        return try { context.startActivity(intent); true } catch (_: Exception) {
            val launch = context.packageManager.getLaunchIntentForPackage(pkg) ?: return false
            try { context.startActivity(launch.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)); true } catch (_: Exception) { false }
        }
    }

    // Bluetooth-muziek op de Jancar-radio: zonder audiofocus pauzeert de Bluetooth-dienst van Jancar na 1 s zelf
    // (A2dpSinkStreamHandler). De focus gaat pas naar Bluetooth als de bron van de radio op A2DP staat; dat doet het
    // openen van de Bluetooth-muziek-app van de radio (getest 6-11-2026). Kort openen en meteen terug naar PandaOS.
    private var lastSourceSwitch = 0L
    private fun switchRadioSourceToBluetooth(): Boolean {
        val component = ComponentName("com.jancar.bluetooth", "com.jancar.bluetooth.activity.BluetoothMusicActivity")
        val intent = android.content.Intent().setComponent(component)
            .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_NO_ANIMATION)
        if (context.packageManager.resolveActivity(intent, 0) == null) return false
        val now = SystemClock.elapsedRealtime()
        if (now - lastSourceSwitch < 5000) return true
        lastSourceSwitch = now
        return try {
            context.startActivity(intent)
            DiagLog.add("info", "Bron van de radio op Bluetooth-muziek gezet")
            handler.postDelayed({
                try {
                    context.startActivity(android.content.Intent(context, MainActivity::class.java)
                        .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                            or android.content.Intent.FLAG_ACTIVITY_NO_ANIMATION))
                } catch (_: Exception) {}
            }, 700)
            true
        } catch (_: Exception) { false }
    }

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
        val c = controller
        if (c == null || (projection != null && projectionAudio && c.metadata?.getString(MediaMetadata.METADATA_KEY_TITLE).isNullOrEmpty())) {
            // CarPlay/Android Auto zonder mediasessie: mediatoets naar Android (de projectie pakt hem als hij de focus heeft)
            if (projection != null) mediaKey(cmd)
            return
        }
        val controls = c.transportControls
        if (cmd == "play" && c.packageName == "com.android.bluetooth" && c.playbackState?.state != PlaybackState.STATE_PLAYING
            && switchRadioSourceToBluetooth()) {
            handler.postDelayed({ try { controls.play() } catch (_: Exception) {} }, 1200)
            return
        }
        when (cmd) {
            "play" -> controls.play()
            "pause" -> controls.pause()
            "next" -> controls.skipToNext()
            "prev" -> controls.skipToPrevious()
        }
    }

    private fun mediaKey(cmd: String) {
        val code = when (cmd) {
            "play" -> android.view.KeyEvent.KEYCODE_MEDIA_PLAY
            "pause" -> android.view.KeyEvent.KEYCODE_MEDIA_PAUSE
            "next" -> android.view.KeyEvent.KEYCODE_MEDIA_NEXT
            "prev" -> android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS
            else -> return
        }
        val audio = context.getSystemService(android.media.AudioManager::class.java) ?: return
        try {
            audio.dispatchMediaKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, code))
            audio.dispatchMediaKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, code))
        } catch (_: Exception) {}
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
            // CarPlay of Android Auto speelt: geen titel bekend, wel laten zien waar het geluid vandaan komt
            val kind = projection
            if (kind != null && projectionAudio) {
                sendOnce("setNowPlaying(${JSONObject().put("title", "").put("artist", "")
                    .put("app", if (kind == "carplay") "com.autochips.carplayapp" else "com.google.android.projection.sink")
                    .put("projection", kind).put("isPlaying", true).put("position", 0).put("duration", 0)})")
                lastCoverKey = null
                return
            }
            // Geen mediasessie: het laatste nummer uit een muziekmelding (minder dan 30 min oud)
            val info = broadcastInfo
            if (info != null && SystemClock.elapsedRealtime() - broadcastAt < 30 * 60_000) {
                sendOnce("setNowPlaying($info)")
                return
            }
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
