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
    // Meestervolume van de radio (0-40, Jancar AudioService), uit het logboek: "onVolumeChanged: VOLUME_MASTER : 12".
    // -1 = (nog) onbekend; dan werkt PandaOS met het Android-mediavolume zoals voorheen. Vraagt READ_LOGS.
    @Volatile var masterVolume = -1
        private set
    @Volatile private var masterThread: Thread? = null
    // Laatst gelezen waarde per volume (MASTER, BLUETOOTH, MEDIA_CCD, NAVIGATION)
    private val radioVolumes = java.util.concurrent.ConcurrentHashMap<String, Int>()
    fun radioVolumesJson(): String = org.json.JSONObject(radioVolumes as Map<*, *>).toString()
    @Volatile private var masterProcess: Process? = null
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
        // Volume van de radio zoeken: de VOL-knoppen van de Golf-radio gaan via de eigen dienst van de radio naar de
        // audiochip (AudioBD37534), buiten het Android-volume om. Veel radio's bewaren dat volume in een
        // systeeminstelling; elke wijziging met vol/sound/audio/gain in de naam komt in het diagnoselogboek.
        val resolver = activity.contentResolver
        for (uri in listOf(android.provider.Settings.System.CONTENT_URI, android.provider.Settings.Global.CONTENT_URI, android.provider.Settings.Secure.CONTENT_URI)) {
            try { resolver.registerContentObserver(uri, true, settingsObserver) } catch (_: Exception) {}
        }
        startMasterVolumeReader()
    }

    private fun startMasterVolumeReader() {
        if (masterThread != null) return
        // Android 13+ vraagt bij elk lezen van het hele logboek toestemming (venster); de radio draait Android 9
        if (Build.VERSION.SDK_INT >= 33) return
        if (activity.checkSelfPermission(android.Manifest.permission.READ_LOGS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return
        // Alle vier de volumes van de radio (Jancar AudioService, gezien op 5-11-2026):
        //   VOLUME_MASTER 0-40, VOLUME_BLUETOOTH 0-40, VOLUME_MEDIA_CCD 0-100 % (media bij camera/achteruit),
        //   VOLUME_NAVIGATION 0-100
        // Laatst bekende waarden (van voor een herstart): de radio logt een volume pas als het verandert
        val saved = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        for (name in saved.getStringSet("vol_names", emptySet()) ?: emptySet()) {
            val v = saved.getInt("vol_$name", -1)
            if (v >= 0) radioVolumes[name] = v
        }
        radioVolumes["MASTER"]?.let { masterVolume = it }
        // Elk volume dat de radio meldt ("VOLUME_<NAAM> : <waarde>"), ook nieuwe zoals AUX; VOLUME_CHANGED e.d.
        // hebben geen ": getal" en tellen niet mee
        val pattern = Regex("""VOLUME_([A-Z0-9_]+)\s*:\s*(\d+)""")
        masterThread = Thread {
            try {
                // Eerst wat er al in het logboek staat (laatste waarden), daarna live volgen
                val process = Runtime.getRuntime().exec(arrayOf("logcat", "-v", "brief", "-e", "VOLUME_[A-Z0-9_]+ *: *[0-9]"))
                masterProcess = process
                java.io.BufferedReader(java.io.InputStreamReader(process.inputStream)).use { reader ->
                    while (true) {
                        val line = reader.readLine() ?: break
                        val match = pattern.find(line) ?: continue
                        val name = match.groupValues[1]
                        val value = match.groupValues[2].toIntOrNull() ?: continue
                        val max = if (name == "MASTER" || name == "BLUETOOTH") MASTER_MAX else 100
                        if (value !in 0..max || name.startsWith("BAR")) continue
                        if (radioVolumes[name] == value) continue
                        radioVolumes[name] = value
                        saved.edit().putInt("vol_$name", value)
                            .putStringSet("vol_names", HashSet(radioVolumes.keys)).apply()
                        if (name == "MASTER") masterVolume = value
                        val json = radioVolumesJson()
                        activity.runOnUiThread {
                            if (name == "MASTER") send("radioVolume($value)")
                            send("radioVolumes($json)")
                        }
                    }
                }
            } catch (_: Exception) {}
            masterThread = null
        }.apply { isDaemon = true; start() }
    }

    fun stop() {
        try { activity.unregisterReceiver(receiver) } catch (_: Exception) {}
        try { activity.contentResolver.unregisterContentObserver(settingsObserver) } catch (_: Exception) {}
        try { masterProcess?.destroy() } catch (_: Exception) {}
    }

    private val loggedSettings = HashMap<String, String>()
    private val settingsObserver = object : android.database.ContentObserver(android.os.Handler(android.os.Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean, uri: android.net.Uri?) {
            val segments = uri?.pathSegments ?: return
            if (segments.size < 2) return
            val table = segments[0]
            val key = segments[1]
            if (!Regex("vol|sound|audio|gain|amp|mute|bd37|loud", RegexOption.IGNORE_CASE).containsMatchIn(key)) return
            val value = try {
                when (table) {
                    "system" -> android.provider.Settings.System.getString(activity.contentResolver, key)
                    "global" -> android.provider.Settings.Global.getString(activity.contentResolver, key)
                    else -> android.provider.Settings.Secure.getString(activity.contentResolver, key)
                }
            } catch (_: Exception) { null } ?: return
            if (loggedSettings["$table/$key"] == value) return
            loggedSettings["$table/$key"] = value
            DiagLog.add("info", "Instelling veranderd: $table/$key = $value")
            send("radioSetting(${org.json.JSONObject().put("table", table).put("key", key).put("value", value)})")
        }
    }

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

    // Meestervolume met stappen zoals de knop van de radio (via de volumetoets-route van Android, die de radio naar
    // zijn meestervolume stuurt). Het echte nieuwe volume komt daarna uit het logboek (radioVolume).
    fun stepMaster(delta: Int) {
        val am = audio ?: return
        val direction = if (delta > 0) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER
        repeat(Math.abs(delta).coerceAtMost(MASTER_MAX)) {
            try { am.adjustSuggestedStreamVolume(direction, AudioManager.USE_DEFAULT_STREAM_TYPE, 0) } catch (_: Exception) {}
        }
    }

    fun setMaster(target: Int) {
        if (masterVolume < 0) return
        stepMaster(target.coerceIn(0, MASTER_MAX) - masterVolume)
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
        const val MASTER_MAX = 40
        private const val PREFS = "pandaos_car"
        private const val VOLUME_CHANGED = "android.media.VOLUME_CHANGED_ACTION"
        private const val EXTRA_STREAM = "android.media.EXTRA_VOLUME_STREAM_TYPE"
        private val BACKCAR_PREFIXES = listOf("android.backcar.action.", "com.jancar.backcar.action.", "android.intent.action.BACKCAR_")
        private val START_WORDS = listOf("START", "ENTER", "BEGIN", "SHOW", "OPEN", "ON", "IN")
        private val END_WORDS = listOf("FINISH", "EXIT", "STOP", "END", "CLOSE", "OFF", "OUT")
    }
}
