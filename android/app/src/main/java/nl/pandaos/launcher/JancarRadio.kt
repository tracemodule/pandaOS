package nl.pandaos.launcher

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

// Radio FM/AM/DAB van de radio zelf, voor de PandaOS Radio-app (client/src/store/apps/RadioApp.tsx).
// De tuner hoort bij Jancar: app com.jancar.radio, RadioService en DABService in com.jancar.services, Jancar-SDK
// com.jancar.sdk.*. Er is geen gedocumenteerde API en de APK's zijn nog niet onderzocht (zie BEVINDINGEN.md, "Radio
// (Jancar)"). Daarom in lagen, en eerlijk over wat zeker is:
//  1. Mediasessie van de radio-app (als die er is): zender/RDS als titel/artiest; bediening via transportControls.
//     Vraagt de meldingen-toegang (MediaListenerService), net als MediaWatcher.
//  2. Logboek (READ_LOGS, zoals het meestervolume in CarSignals): frequentie, band, PS-naam, radiotekst en
//     voorkeuzes uit de regels van de radio. Het echte formaat kennen we nog niet: de patronen hieronder zijn
//     gangbare vormen. Elke nieuwe vorm van een radioregel komt als "Radio-log: ..." in het diagnoselogboek, zodat de
//     volgende laptoptest het echte formaat laat zien.
//  3. Bediening: transportControls of mediatoetsen van Android (gaan naar de bron met audiofocus); de radio-app openen
//     (zet de bron van de radio op radio, zoals BluetoothMusicActivity dat voor Bluetooth deed); afstemmen via GERADEN
//     broadcasts (NIET geverifieerd, zie tune()).
// Naar de webapp: DOM-event 'pandaos-radio' (detail = dezelfde JSON als getRadioInfo).
object JancarRadio {

    const val PKG = "com.jancar.radio"
    private const val SERVICES_PKG = "com.jancar.services"
    private const val PREFS = "pandaos_radio"
    private const val MAX_SHAPES = 200
    private const val MAX_STATIONS = 60

    private val handler = Handler(Looper.getMainLooper())
    @Volatile private var appContext: Context? = null
    @Volatile private var js: ((String) -> Unit)? = null
    private val lock = Any()

    // Laatst gelezen (logboek, of mediasessie als die een frequentie in de tekst heeft)
    private var band: String? = null   // FM, AM of DAB
    private var freq: Double? = null   // FM in MHz, AM in kHz; DAB: geen
    private var ps: String? = null     // zendernaam (RDS PS of DAB-servicelabel)
    private var rt: String? = null     // radiotekst (RDS RT of DAB DLS)
    private var source: String? = null // "log" of "session"
    private var updatedAt = 0L         // System.currentTimeMillis()
    private val presets = LinkedHashMap<String, JSONObject>()  // "FM:3" -> {index, band, freq}
    private val stations = LinkedHashMap<String, JSONObject>() // "FM:101.7" / "DAB:NPO Radio 2" -> {band, freq, name, text, lastSeen}
    private var lastTune: JSONObject? = null
    private var logLines = 0
    private val shapes = HashSet<String>()
    @Volatile private var logThread: Thread? = null
    @Volatile private var logProcess: Process? = null
    @Volatile private var logRunning = false

    // Mediasessie van de radio
    private var sessionsListening = false
    @Volatile private var radioController: MediaController? = null
    private val loggedSessions = HashSet<String>()
    private val loggedRoutes = HashSet<String>()

    // Pakketgegevens: niet bij elke vraag opnieuw (de webapp vraagt elke paar seconden)
    private var packageCache: JSONObject? = null
    private var packageCacheAt = 0L

    // Aanroepen vanuit MainActivity.onCreate (ook na een herstart van de activiteit: dan alleen de nieuwe webview)
    fun start(context: Context, js: (String) -> Unit) {
        this.js = js
        if (appContext == null) {
            appContext = context.applicationContext
            restore()
        }
        if (!installed()) return // geen Jancar-radio (emulator, telefoon): niets te volgen
        startLogReader()
        listenSessions()
    }

    private fun installed(): Boolean = try {
        appContext?.packageManager?.getPackageInfo(PKG, 0); appContext != null
    } catch (_: Exception) { false }

    // ---------------- Naar de webapp ----------------

    private val dispatchRunnable = Runnable {
        save()
        val json = infoJson()
        js?.invoke("window.dispatchEvent(new CustomEvent('pandaos-radio',{detail:$json}))")
    }

    private fun scheduleDispatch() {
        handler.removeCallbacks(dispatchRunnable)
        handler.postDelayed(dispatchRunnable, 300)
    }

    // Alles wat PandaOS over de radio weet (window.PandaAndroid.getRadioInfo)
    fun infoJson(): String {
        val ctx = appContext ?: return JSONObject().put("available", false).put("installed", false).toString()
        if (!sessionsListening) listenSessions() // meldingen-toegang kan intussen gegeven zijn
        val o = JSONObject().put("available", true).put("package", PKG)
        val pkg = packageJson(ctx)
        val keys = pkg.keys()
        while (keys.hasNext()) { val k = keys.next(); o.put(k, pkg.get(k)) }
        o.put("sessionAccess", hasSessionAccess(ctx))
        val controller = radioController ?: findRadioController()
        o.put("session", controller?.let { sessionJson(it) } ?: JSONObject.NULL)
        o.put("log", JSONObject()
            .put("readable", Build.VERSION.SDK_INT < 33 && ctx.checkSelfPermission(android.Manifest.permission.READ_LOGS) == PackageManager.PERMISSION_GRANTED)
            .put("running", logRunning).put("lines", logLines).put("shapes", synchronized(lock) { shapes.size }))
        synchronized(lock) {
            o.put("current", if (freq == null && ps == null && rt == null) JSONObject.NULL else JSONObject()
                .put("band", band ?: JSONObject.NULL)
                .put("freq", freq ?: JSONObject.NULL)
                .put("unit", when (band) { "FM" -> "MHz"; "AM" -> "kHz"; else -> "" })
                .put("ps", ps ?: JSONObject.NULL).put("rt", rt ?: JSONObject.NULL)
                .put("source", source ?: JSONObject.NULL).put("updatedAt", updatedAt))
            o.put("presets", JSONArray(presets.values.sortedWith(compareBy({ it.optString("band") }, { it.optInt("index") }))))
            o.put("stations", JSONArray(stations.values.sortedWith(compareBy({ it.optString("band") }, { it.optDouble("freq", 0.0) }, { it.optString("name") }))))
            o.put("lastTune", lastTune ?: JSONObject.NULL)
        }
        return o.toString()
    }

    private fun packageJson(ctx: Context): JSONObject {
        val now = SystemClock.elapsedRealtime()
        packageCache?.let { if (now - packageCacheAt < 15_000) return it }
        val pm = ctx.packageManager
        val o = JSONObject()
        val info: PackageInfo? = try {
            pm.getPackageInfo(PKG, PackageManager.GET_ACTIVITIES or PackageManager.GET_RECEIVERS or PackageManager.GET_SERVICES)
        } catch (_: PackageManager.NameNotFoundException) { null } catch (_: Exception) {
            try { pm.getPackageInfo(PKG, PackageManager.GET_ACTIVITIES) } catch (_: Exception) { null }
        }
        o.put("installed", info != null)
        if (info != null) {
            o.put("version", info.versionName ?: "")
            o.put("label", try { pm.getApplicationLabel(pm.getApplicationInfo(PKG, 0)).toString() } catch (_: Exception) { "" })
            val launchable = JSONArray()
            val seen = HashSet<String>()
            for (intent in listOf(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(PKG),
                Intent(Intent.ACTION_MAIN).setPackage(PKG))) {
                for (r in pm.queryIntentActivities(intent, 0)) {
                    if (!seen.add(r.activityInfo.name)) continue
                    launchable.put(JSONObject().put("activity", r.activityInfo.name).put("label", r.loadLabel(pm).toString()))
                }
            }
            o.put("launchable", launchable)
            o.put("activities", JSONArray(info.activities?.map { if (it.exported) it.name else "${it.name} (niet exported)" } ?: emptyList<String>()))
            o.put("receivers", JSONArray(info.receivers?.map { it.name } ?: emptyList<String>()))
            o.put("services", JSONArray(info.services?.map { it.name } ?: emptyList<String>()))
        }
        // RadioService/DABService van Jancar
        o.put("jancarServices", JSONArray(try {
            pm.getPackageInfo(SERVICES_PKG, PackageManager.GET_SERVICES).services
                ?.map { it.name }?.filter { Regex("radio|dab|tuner", RegexOption.IGNORE_CASE).containsMatchIn(it) } ?: emptyList()
        } catch (_: Exception) { emptyList<String>() }))
        packageCache = o
        packageCacheAt = now
        return o
    }

    // ---------------- Mediasessie ----------------

    private fun listenerComponent(ctx: Context) = ComponentName(ctx, MediaListenerService::class.java)

    private fun hasSessionAccess(ctx: Context): Boolean {
        val enabled = Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners") ?: return false
        val me = listenerComponent(ctx)
        return enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
    }

    // De radio-app zelf, of RadioService/DABService in com.jancar.services (sessietag met radio/dab/tuner/fm)
    private fun isRadioSession(c: MediaController): Boolean = c.packageName == PKG ||
        (c.packageName == SERVICES_PKG && Regex("radio|dab|tuner|fm", RegexOption.IGNORE_CASE).containsMatchIn(c.tag ?: ""))

    private fun findRadioController(): MediaController? {
        val ctx = appContext ?: return null
        val manager = ctx.getSystemService(MediaSessionManager::class.java) ?: return null
        return try { manager.getActiveSessions(listenerComponent(ctx)).firstOrNull { isRadioSession(it) } } catch (_: Exception) { null }
    }

    private val sessionsListener = MediaSessionManager.OnActiveSessionsChangedListener { list ->
        bindController(list?.firstOrNull { isRadioSession(it) })
    }

    private val controllerCallback = object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?) { fromSession(); scheduleDispatch() }
        override fun onPlaybackStateChanged(state: PlaybackState?) = scheduleDispatch()
        override fun onSessionDestroyed() = bindController(null)
    }

    private fun listenSessions() {
        if (sessionsListening) return
        val ctx = appContext ?: return
        if (!hasSessionAccess(ctx)) return
        val manager = ctx.getSystemService(MediaSessionManager::class.java) ?: return
        try {
            manager.addOnActiveSessionsChangedListener(sessionsListener, listenerComponent(ctx), handler)
            sessionsListening = true
            bindController(manager.getActiveSessions(listenerComponent(ctx)).firstOrNull { isRadioSession(it) })
        } catch (_: Exception) { /* toegang (nog) niet gegeven */ }
    }

    private fun bindController(c: MediaController?) {
        if (c?.sessionToken == radioController?.sessionToken) return
        try { radioController?.unregisterCallback(controllerCallback) } catch (_: Exception) {}
        radioController = c
        if (c != null) {
            try { c.registerCallback(controllerCallback, handler) } catch (_: Exception) {}
            if (loggedSessions.add("${c.packageName}|${c.tag}"))
                DiagLog.add("info", "Radio-sessie: ${c.packageName} tag=${c.tag} acties=${c.playbackState?.actions}")
            fromSession()
        }
        scheduleDispatch()
    }

    private fun sessionJson(c: MediaController): JSONObject {
        val m = c.metadata
        val extras = JSONObject()
        if (m != null) {
            for (key in m.keySet()) {
                if (key.contains("ART") || key.contains("ICON")) continue // plaatjes niet
                val text = try { m.getText(key) } catch (_: Exception) { null }
                if (text != null) extras.put(key, text.toString())
                else try { extras.put(key, m.getLong(key)) } catch (_: Exception) {}
            }
        }
        c.extras?.let { b -> for (k in b.keySet()) extras.put("session.$k", b.get(k)?.toString() ?: "") }
        val state = c.playbackState
        state?.extras?.let { b -> for (k in b.keySet()) extras.put("state.$k", b.get(k)?.toString() ?: "") }
        return JSONObject()
            .put("package", c.packageName).put("tag", c.tag ?: "")
            .put("title", m?.getString(MediaMetadata.METADATA_KEY_TITLE) ?: m?.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE) ?: "")
            .put("artist", m?.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: m?.getString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE) ?: "")
            .put("album", m?.getString(MediaMetadata.METADATA_KEY_ALBUM) ?: "")
            .put("playing", state?.state == PlaybackState.STATE_PLAYING)
            .put("state", state?.state ?: -1)
            .put("actions", state?.actions ?: 0L)
            .put("extras", extras)
    }

    // Frequentie in de tekst van de sessie ("101.70 MHz", "FM 101.7") overnemen als het logboek niets weet
    private fun fromSession() {
        val m = radioController?.metadata ?: return
        val text = listOf(MediaMetadata.METADATA_KEY_TITLE, MediaMetadata.METADATA_KEY_ARTIST, MediaMetadata.METADATA_KEY_ALBUM,
            MediaMetadata.METADATA_KEY_DISPLAY_TITLE, MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE)
            .mapNotNull { m.getString(it) }.joinToString(" | ")
        if (text.isBlank()) return
        synchronized(lock) {
            val found = findFrequency(text, band) ?: return
            if (source == "log" && System.currentTimeMillis() - updatedAt < 60_000) return
            setStation(found.first, found.second, "session")
        }
    }

    // ---------------- Logboek ----------------

    // logcat -e werkt op de tekst van de regel (niet op de tag); de echte keuze maakt handleLogLine
    private const val LOGCAT_FILTER =
        "[Ff][Rr][Ee][Qq]|[Bb][Aa][Nn][Dd]|RDS|[Rr]ds|PS *[:=]|[Ss]tation|[Pp]reset|DAB|[Dd]ab|[Rr]adio|[Tt]uner|M[Hh]z|[Kk][Hh]z"
    private val BRIEF = Regex("""^([VDIWEF])/([^(]*)\(\s*\d+\):\s?(.*)$""")
    private val RADIO_WORDS = Regex("""radio|dab|tuner|\bfm\b|\brds\b""", RegexOption.IGNORE_CASE)
    // Telefonie ("radio" = modem), wifi/Bluetooth ("band") en Android zelf: geen FM/AM-radio
    private val NOISE = Regex("""RIL|Telephony|GsmCdma|ServiceState|\bIms|Wifi|wpa_|Bluetooth|\bbt_|nl\.pandaos|PandaOS|chromium|WebView|ActivityManager|ActivityTaskManager|PackageManager|WindowManager|InputMethod""", RegexOption.IGNORE_CASE)

    private fun startLogReader() {
        if (logThread != null) return
        val ctx = appContext ?: return
        // Android 13+ vraagt bij elk lezen van het logboek toestemming; de radio draait Android 9
        if (Build.VERSION.SDK_INT >= 33) return
        if (ctx.checkSelfPermission(android.Manifest.permission.READ_LOGS) != PackageManager.PERMISSION_GRANTED) return
        logThread = Thread {
            try {
                // Eerst wat er al in het logboek staat, daarna live volgen
                val process = Runtime.getRuntime().exec(arrayOf("logcat", "-v", "brief", "-e", LOGCAT_FILTER))
                logProcess = process
                logRunning = true
                java.io.BufferedReader(java.io.InputStreamReader(process.inputStream)).use { reader ->
                    while (true) {
                        val line = reader.readLine() ?: break
                        try { handleLogLine(line) } catch (_: Exception) {}
                    }
                }
            } catch (_: Exception) {}
            logRunning = false
            logThread = null
        }.apply { isDaemon = true; name = "JancarRadio-log"; start() }
    }

    private fun handleLogLine(line: String) {
        val match = BRIEF.find(line) ?: return
        val tag = match.groupValues[2].trim()
        val msg = match.groupValues[3]
        val whole = "$tag $msg"
        if (!RADIO_WORDS.containsMatchIn(whole) || NOISE.containsMatchIn(tag)) return
        val changed = synchronized(lock) {
            logLines++
            // Nieuwe vorm van een radioregel (cijfers weg, begin van de tekst): één voorbeeld in het diagnoselogboek
            val shape = "$tag|" + msg.replace(Regex("""\d+"""), "#").take(48)
            if (shapes.size < MAX_SHAPES && shapes.add(shape)) DiagLog.add("info", "Radio-log: $tag: ${msg.take(240)}")
            parse(whole)
        }
        if (changed) scheduleDispatch()
    }

    // Gangbare vormen (NOG NIET GEZIEN op de radio; aanpassen na de laptoptest met de "Radio-log:"-regels):
    //   band: "band=FM", "mBand:AM", "Band FM1", "FM 101.7"
    //   frequentie: "freq=10170" (10 kHz), "setFreq: 101.7", "frequency 87500" (kHz), "101.70MHz", "1008 kHz"
    //   zender: "PS: RADIO 2", "psName=SKYRADIO", "serviceLabel=NPO Radio 1" (DAB)
    //   tekst: "RT: ...", "radioText=...", "DLS: ..." (DAB)
    //   voorkeuze: "preset[3]=10170", "savePreset(2, 9810)", "presetList=[8750, 9810, ...]"
    private val BAND = Regex("""(?i)\bm?band\w*\s*[:=]?\s*\(?\s*["']?(FM|AM|MW|LW|SW|DAB)""")
    private val FREQ_KEY = Regex("""(?i)freq(?:uency)?\w*\s*[:=]?\s*\(?\s*(\d+(?:\.\d+)?)""")
    private val FREQ_BAND = Regex("""(?i)\b(FM|AM|MW)\d?\s*[:=]?\s*(\d{2,6}(?:\.\d{1,3})?)""")
    private val MHZ = Regex("""(?i)(\d{2,3}\.\d{1,3})\s*MHz""")
    private val KHZ = Regex("""(?i)\b(\d{3,4})\s*kHz""")
    private val PS = Regex("""(?i)\b(?:ps|psName|ps_name|programService|stationName|station_name|serviceLabel|service_label|serviceName|service_name)\s*[:=]\s*["'\[]?([^"'\],;|{}]{1,24})""")
    private val RT = Regex("""(?i)\b(?:rt|radioText|radio_text|dls|dlsText|dls_text)\s*[:=]\s*["'\[]?([^"'\]|{}]{2,64})""")
    private val PRESET = Regex("""(?i)preset\w*\s*[\[(]?\s*(\d{1,2})\s*[\])]?\s*[:=,]?\s*(?:freq\w*\s*[:=]?\s*)?(\d+(?:\.\d+)?)""")
    private val PRESET_LIST = Regex("""(?i)preset\w*\s*[:=]\s*\[([\d.,\s]+)]""")
    private val DAB_FIELD = Regex("""(?i)serviceLabel|service_label|serviceName|service_name|\bdls\b|ensemble""")

    private fun bandOf(word: String): String? = when (word.uppercase()) {
        "FM" -> "FM"; "AM", "MW", "LW", "SW" -> "AM"; "DAB" -> "DAB"; else -> null
    }

    // Getal uit het logboek naar (band, frequentie): FM in MHz (87.5-108), AM in kHz (522-1710)
    private fun normalize(raw: String, hint: String?): Pair<String, Double>? {
        val v = raw.toDoubleOrNull() ?: return null
        fun fm(x: Double) = if (x in 87.5..108.0) "FM" to Math.round(x * 100) / 100.0 else null
        fun am(x: Double) = if (x in 522.0..1710.0) "AM" to Math.round(x).toDouble() else null
        if (hint == "DAB") return null // DAB-frequenties (174-240 MHz) zijn geen zender
        if (raw.contains('.')) return fm(v) ?: am(v)
        return when {
            v in 87_500_000.0..108_000_000.0 -> fm(v / 1_000_000)        // Hz
            v in 522_000.0..1_710_000.0 && hint == "AM" -> am(v / 1000)  // Hz (AM)
            v in 87_500.0..108_000.0 -> fm(v / 1000)                      // kHz
            v in 8_750.0..10_800.0 -> fm(v / 100)                         // 10 kHz (gangbaar bij Chinese tuners)
            v in 875.0..1080.0 && hint == "FM" -> fm(v / 10)              // 100 kHz
            v in 522.0..1710.0 && hint != "FM" -> am(v)                   // kHz
            else -> null
        }
    }

    private fun findFrequency(text: String, hint: String?): Pair<String, Double>? {
        FREQ_BAND.find(text)?.let { m -> normalize(m.groupValues[2], bandOf(m.groupValues[1]))?.let { return it } }
        MHZ.find(text)?.let { m -> normalize(m.groupValues[1], "FM")?.let { return it } }
        KHZ.find(text)?.let { m -> normalize(m.groupValues[1], "AM")?.let { return it } }
        FREQ_KEY.find(text)?.let { m -> normalize(m.groupValues[1], hint)?.let { return it } }
        return null
    }

    private fun clean(s: String): String? = s.trim().trimEnd(',', ';', '.', ')').trim()
        .takeIf { it.isNotEmpty() && it.any(Char::isLetter) && !it.equals("null", true) }

    // Onder lock aanroepen. true = er is iets veranderd
    private fun parse(text: String): Boolean {
        var changed = false
        val bandHere = BAND.find(text)?.let { bandOf(it.groupValues[1]) }
        val hint = bandHere ?: band
        val found = findFrequency(text, hint)
        if (found != null) {
            if (setStation(found.first, found.second, "log")) changed = true
        } else if (bandHere != null && bandHere != band) {
            band = bandHere; updatedAt = System.currentTimeMillis(); source = "log"; changed = true
        }
        PS.find(text)?.let { m ->
            clean(m.groupValues[1])?.let { name ->
                if (DAB_FIELD.containsMatchIn(text) && found == null && band != "DAB") { band = "DAB"; freq = null }
                if (name != ps) { ps = name; changed = true }
            }
        }
        RT.find(text)?.let { m ->
            clean(m.groupValues[1])?.let { t -> if (t != rt) { rt = t; changed = true } }
        }
        PRESET_LIST.find(text)?.let { m ->
            m.groupValues[1].split(',').map { it.trim() }.filter { it.isNotEmpty() }.forEachIndexed { i, raw ->
                normalize(raw, hint)?.let { (b, f) -> if (putPreset(i + 1, b, f)) changed = true }
            }
        } ?: PRESET.find(text)?.let { m ->
            val index = m.groupValues[1].toIntOrNull()
            val nf = normalize(m.groupValues[2], hint)
            if (index != null && index in 0..40 && nf != null && putPreset(index, nf.first, nf.second)) changed = true
        }
        if (changed) {
            updatedAt = System.currentTimeMillis()
            learn()
        }
        return changed
    }

    // Andere zender: naam en tekst horen bij de vorige
    private fun setStation(b: String, f: Double, from: String): Boolean {
        if (b == band && f == freq) return false
        band = b; freq = f; ps = null; rt = null; source = from
        updatedAt = System.currentTimeMillis()
        learn()
        return true
    }

    private fun putPreset(index: Int, b: String, f: Double): Boolean {
        val key = "$b:$index"
        if (presets[key]?.optDouble("freq") == f) return false
        presets[key] = JSONObject().put("index", index).put("band", b).put("freq", f)
        return true
    }

    // Zenders onthouden die de radio heeft gespeeld ("PandaOS leert de zenders")
    private fun learn() {
        val b = band ?: return
        val key = when {
            freq != null -> "$b:${freq}"
            b == "DAB" && ps != null -> "DAB:$ps"
            else -> return
        }
        val entry = stations[key] ?: JSONObject().put("band", b).put("freq", freq ?: JSONObject.NULL)
        ps?.let { entry.put("name", it) }
        rt?.let { entry.put("text", it) }
        entry.put("lastSeen", System.currentTimeMillis())
        stations.remove(key)
        stations[key] = entry
        while (stations.size > MAX_STATIONS) stations.remove(stations.keys.first())
    }

    // ---------------- Bewaren ----------------

    private fun save() {
        val ctx = appContext ?: return
        val state: String
        val list: String
        val pre: String
        synchronized(lock) {
            state = JSONObject().put("band", band ?: JSONObject.NULL).put("freq", freq ?: JSONObject.NULL)
                .put("ps", ps ?: JSONObject.NULL).put("rt", rt ?: JSONObject.NULL)
                .put("source", source ?: JSONObject.NULL).put("updatedAt", updatedAt).toString()
            list = JSONArray(stations.values.toList()).toString()
            pre = JSONArray(presets.values.toList()).toString()
        }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("state", state).putString("stations", list).putString("presets", pre).apply()
    }

    private fun restore() {
        val prefs = appContext?.getSharedPreferences(PREFS, Context.MODE_PRIVATE) ?: return
        try {
            synchronized(lock) {
                prefs.getString("state", null)?.let { s ->
                    val o = JSONObject(s)
                    band = o.optString("band").takeIf { it.isNotEmpty() && it != "null" }
                    freq = if (o.isNull("freq")) null else o.optDouble("freq")
                    ps = o.optString("ps").takeIf { it.isNotEmpty() && it != "null" }
                    rt = o.optString("rt").takeIf { it.isNotEmpty() && it != "null" }
                    source = o.optString("source").takeIf { it.isNotEmpty() && it != "null" }
                    updatedAt = o.optLong("updatedAt")
                }
                prefs.getString("stations", null)?.let { s ->
                    val a = JSONArray(s)
                    for (i in 0 until a.length()) {
                        val e = a.getJSONObject(i)
                        val key = if (e.isNull("freq")) "${e.optString("band")}:${e.optString("name")}" else "${e.optString("band")}:${e.optDouble("freq")}"
                        stations[key] = e
                    }
                }
                prefs.getString("presets", null)?.let { s ->
                    val a = JSONArray(s)
                    for (i in 0 until a.length()) { val e = a.getJSONObject(i); presets["${e.optString("band")}:${e.optInt("index")}"] = e }
                }
            }
        } catch (_: Exception) {}
    }

    // ---------------- Bediening ----------------

    // next/prev (zoeken omhoog/omlaag), play, pause, toggle. Geeft de gebruikte route terug: "session" of "mediakey".
    fun command(cmd: String): String {
        val c = radioController ?: findRadioController()
        val route = if (c != null) "session" else "mediakey"
        if (loggedRoutes.add("$cmd|$route")) DiagLog.add("info", "Radio-bediening: $cmd via $route")
        if (c != null) {
            val controls = c.transportControls
            val playing = c.playbackState?.state == PlaybackState.STATE_PLAYING
            handler.post {
                try {
                    when (cmd) {
                        "next", "seekUp" -> controls.skipToNext()
                        "prev", "seekDown" -> controls.skipToPrevious()
                        "play" -> controls.play()
                        "pause" -> controls.pause()
                        "toggle" -> if (playing) controls.pause() else controls.play()
                    }
                } catch (_: Exception) {}
            }
            return route
        }
        // Geen sessie: mediatoets naar Android; die gaat naar de bron met audiofocus (de radio als die speelt)
        val code = when (cmd) {
            "next", "seekUp" -> android.view.KeyEvent.KEYCODE_MEDIA_NEXT
            "prev", "seekDown" -> android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS
            "play" -> android.view.KeyEvent.KEYCODE_MEDIA_PLAY
            "pause" -> android.view.KeyEvent.KEYCODE_MEDIA_PAUSE
            "toggle" -> android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
            else -> return "unknown"
        }
        val audio = appContext?.getSystemService(android.media.AudioManager::class.java) ?: return "none"
        try {
            audio.dispatchMediaKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, code))
            audio.dispatchMediaKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, code))
        } catch (_: Exception) {}
        return route
    }

    // Activiteit van de radio-app; DAB: een activiteit met "dab" in de naam als die er is
    private fun launchIntent(ctx: Context, band: String): Intent? {
        val pm = ctx.packageManager
        if (band.equals("DAB", true)) {
            val dab = try {
                pm.getPackageInfo(PKG, PackageManager.GET_ACTIVITIES).activities
                    ?.firstOrNull { it.exported && it.name.contains("dab", true) }
            } catch (_: Exception) { null }
            if (dab != null) return Intent().setComponent(ComponentName(PKG, dab.name))
        }
        pm.getLaunchIntentForPackage(PKG)?.let { return it }
        val main = pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).setPackage(PKG), 0).firstOrNull() ?: return null
        return Intent(Intent.ACTION_MAIN).setComponent(ComponentName(PKG, main.activityInfo.name))
    }

    // Radio-app openen: zet ook de bron van de radio op radio (zoals BluetoothMusicActivity voor Bluetooth deed).
    // background = na 700 ms terug naar PandaOS (zelfde truc als MediaWatcher.switchRadioSourceToBluetooth).
    fun open(band: String, background: Boolean): Boolean {
        val ctx = appContext ?: return false
        val intent = launchIntent(ctx, band) ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (background) intent.addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION)
        // Geraden extra (NIET geverifieerd); een app die hem niet kent negeert hem
        if (band.isNotEmpty()) intent.putExtra("band", band.uppercase())
        handler.post {
            try {
                ctx.startActivity(intent)
                DiagLog.add("info", "Radio-app geopend (${intent.component?.className ?: PKG}${if (background) ", terug naar PandaOS" else ""})")
                if (background) handler.postDelayed({
                    try {
                        ctx.startActivity(Intent(ctx, MainActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_NO_ANIMATION))
                    } catch (_: Exception) {}
                }, 700)
            } catch (e: Exception) {
                DiagLog.add("error", "Radio-app openen mislukt: ${e.javaClass.simpleName}")
            }
        }
        return true
    }

    // NIET GEVERIFIEERD — moet op de radio getest worden. De actie- en extranamen zijn GERADEN (er is geen
    // gedocumenteerde Jancar-API). We sturen ze gericht naar com.jancar.radio en com.jancar.services; een app die ze
    // niet kent negeert ze. Na 3 s kijken we in het logboek of de frequentie echt veranderde en schrijven we dat in
    // het diagnoselogboek ("Radio: afstemmen ... bevestigd/niet bevestigd"). Echte route waarschijnlijk: binden aan
    // RadioService (com.jancar.sdk.radio) — eerst de APK bekijken.
    private val TUNE_ACTIONS = listOf(
        "com.jancar.radio.action.SET_FREQ",
        "com.jancar.radio.action.TUNE",
        "com.jancar.radio.SET_FREQUENCY",
        "com.jancar.action.RADIO_SET_FREQ",
    )

    fun tune(f: Double, b: String): String {
        val ctx = appContext ?: return JSONObject().put("sent", 0).toString()
        val bandName = b.uppercase()
        val units = if (bandName == "FM") Math.round(f * 100).toInt() else Math.round(f).toInt()   // FM 101.7 -> 10170
        val khz = if (bandName == "FM") Math.round(f * 1000).toInt() else Math.round(f).toInt()   // FM 101.7 -> 101700
        var sent = 0
        for (action in TUNE_ACTIONS) for (pkg in listOf(PKG, SERVICES_PKG)) {
            val intent = Intent(action).setPackage(pkg)
                .putExtra("freq", units).putExtra("frequency", f).putExtra("freq_khz", khz).putExtra("band", bandName)
            try { ctx.sendBroadcast(intent); sent++ } catch (_: Exception) {}
        }
        val tuneAt = System.currentTimeMillis()
        synchronized(lock) {
            lastTune = JSONObject().put("band", bandName).put("freq", f).put("at", tuneAt).put("verified", false)
        }
        DiagLog.add("info", "Radio: afstemmen op $bandName $f via geraden broadcasts (niet geverifieerd)")
        handler.postDelayed({
            val ok = synchronized(lock) { band == bandName && freq != null && Math.abs(freq!! - f) < 0.05 && updatedAt >= tuneAt }
            synchronized(lock) { lastTune?.takeIf { it.optLong("at") == tuneAt }?.put("verified", ok) }
            DiagLog.add("info", "Radio: afstemmen op $bandName $f ${if (ok) "bevestigd door het logboek" else "niet bevestigd (logboek toont ${band ?: "?"} ${freq ?: "?"})"}")
            scheduleDispatch()
        }, 3000)
        return JSONObject().put("sent", sent).put("actions", JSONArray(TUNE_ACTIONS)).put("verified", false).toString()
    }
}
