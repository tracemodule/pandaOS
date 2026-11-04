package nl.pandaos.launcher

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build

// Signalen van de radio zelf (niet van de CAN-bus):
//  - Achteruit: de Golf-radio (Jancar-platform, camera-app com.jancar.hd2cam) stuurt bij het einde van achteruit de
//    broadcast "android.backcar.action.FINISH" (gezien in de CAN-monitor, 5 november 2026). De naam voor het begin
//    kennen we nog niet: we luisteren naar de waarschijnlijke namen en schrijven elke backcar-broadcast in het
//    diagnoselogboek, zodat we hem na de volgende test zeker weten.
//  - Volume: het Android-mediavolume (STREAM_MUSIC). Verandert het (VOL-knoppen van de radio, stuurknoppen, andere
//    app), dan krijgt de webapp het nieuwe percentage; de volumeknoppen in PandaOS zetten het Android-volume.
class CarSignals(private val activity: Activity, private val send: (String) -> Unit) {

    private val audio = activity.getSystemService(AudioManager::class.java)
    private var lastLoggedVolume = -1
    @Volatile var reverseActive = false
        private set
    // Ooit een backcar-broadcast gezien op dit apparaat? Dan is het focusverlies zonder aanraking waarschijnlijk de
    // camera-app van de radio (zie MainActivity.onWindowFocusChanged)
    val backcarKnown: Boolean
        get() = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("backcarSeen", false)

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val action = intent.action ?: return
            when {
                action == VOLUME_CHANGED -> {
                    if (intent.getIntExtra(EXTRA_STREAM, -1) == AudioManager.STREAM_MUSIC) {
                        val percent = volumePercent()
                        if (percent != lastLoggedVolume) { lastLoggedVolume = percent; DiagLog.add("info", "Volume van de radio: $percent%") }
                        send("systemVolume($percent)")
                    }
                }
                action.contains("backcar", ignoreCase = true) || action.contains("reverse", ignoreCase = true) -> {
                    DiagLog.add("info", "Achteruit-broadcast: $action ${intent.extras?.keySet()?.joinToString { "$it=${intent.extras?.get(it)}" } ?: ""}")
                    activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("backcarSeen", true).apply()
                    val end = END_WORDS.any { action.endsWith(it, ignoreCase = true) }
                    setReverse(!end, "broadcast")
                }
            }
        }
    }

    fun start() {
        val filter = IntentFilter(VOLUME_CHANGED)
        for (prefix in BACKCAR_PREFIXES) for (word in START_WORDS + END_WORDS) filter.addAction("$prefix$word")
        if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        else activity.registerReceiver(receiver, filter)
    }

    fun stop() { try { activity.unregisterReceiver(receiver) } catch (_: Exception) {} }

    // Achteruit aan/uit naar de webapp (alleen bij een verandering)
    fun setReverse(active: Boolean, source: String) {
        if (reverseActive == active) return
        reverseActive = active
        DiagLog.add("info", "Achteruit ${if (active) "aan" else "uit"} ($source)")
        activity.runOnUiThread { send("setReverseSignal($active)") }
    }

    // ---------------- Volume ----------------

    fun volumePercent(): Int {
        val am = audio ?: return 0
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        return Math.round(am.getStreamVolume(AudioManager.STREAM_MUSIC) * 100f / max)
    }

    // Eén echte stap van de radio omhoog/omlaag (de radio heeft minder stappen dan 100); geeft het nieuwe percentage
    fun stepVolume(delta: Int): Int {
        val am = audio ?: return volumePercent()
        try {
            am.adjustStreamVolume(AudioManager.STREAM_MUSIC, if (delta > 0) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER, 0)
        } catch (_: Exception) {}
        return volumePercent()
    }

    fun setVolumePercent(percent: Int) {
        val am = audio ?: return
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val index = Math.round(percent.coerceIn(0, 100) * max / 100f)
        if (index != am.getStreamVolume(AudioManager.STREAM_MUSIC)) {
            try { am.setStreamVolume(AudioManager.STREAM_MUSIC, index, 0) } catch (_: Exception) { /* bijv. Niet storen */ }
        }
    }

    companion object {
        private const val PREFS = "pandaos_car"
        private const val VOLUME_CHANGED = "android.media.VOLUME_CHANGED_ACTION"
        private const val EXTRA_STREAM = "android.media.EXTRA_VOLUME_STREAM_TYPE"
        private val BACKCAR_PREFIXES = listOf("android.backcar.action.", "com.jancar.backcar.action.", "android.intent.action.BACKCAR_")
        private val START_WORDS = listOf("START", "ENTER", "BEGIN", "SHOW", "OPEN", "ON", "IN")
        private val END_WORDS = listOf("FINISH", "EXIT", "STOP", "END", "CLOSE", "OFF", "OUT")
    }
}
