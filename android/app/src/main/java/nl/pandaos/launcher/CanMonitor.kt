package nl.pandaos.launcher

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// CAN-monitor (app in PandaOS): laat zien wat het CAN-kastje en de CAN-app van de radio doorgeven, zodat we kunnen
// uitzoeken welke gegevens er zijn (achteruit, lichten, deuren, temperatuur ...) en hoe ze heten.
// Bronnen:
//  1. Het Android-logboek (logcat) van de hele radio. Daarvoor is READ_LOGS nodig (vast via ADB:
//     adb shell pm grant nl.pandaos.launcher android.permission.READ_LOGS).
//  2. Broadcasts van bekende radio-platforms (best-effort lijst; aanvullen zodra we de echte namen kennen).
// Daarnaast:
//  - Koppelen (CanLinks): elke regel gaat ook naar de koppelingen; met koppelingen leest de monitor op de achtergrond
//    door, ook als de app dicht is.
//  - Leren: alle regels van de laatste minuten worden onthouden, zodat we na "Leren" kunnen laten zien welke regels
//    er nieuw bijkwamen toen je de deur opende, R inschakelde enz.
//  - Verbinding: seriële poorten, systeemeigenschappen en apps van de radio die met CAN te maken hebben.
class CanMonitor(private val activity: Activity, private val onLine: (source: String, text: String) -> Unit = { _, _ -> }) {

    private data class Line(val time: Long, val source: String, val text: String)

    private val lines = ArrayDeque<Line>() // wat de monitor toont (gefilterd)
    private val recent = ArrayDeque<Line>() // alle regels van de laatste minuten (voor Leren)
    private var logThread: Thread? = null
    private var logProcess: Process? = null
    @Volatile private var threadRunning = false
    @Volatile private var uiRecording = false // CAN-monitor-app open en Start gedrukt
    @Volatile private var background = false // er zijn koppelingen: blijven meelezen
    private var onlyCan = true
    private var receiverRegistered = false

    // Leren
    private var learnFrom = 0L
    private var learnBaseline = emptySet<String>()

    // Regels die waarschijnlijk met de auto/het CAN-kastje te maken hebben
    private val canPattern = Regex(
        "can ?bus|canbox|can_|\\bcan\\b|mcu|backcar|reverse|\\bill\\b|illum|headlight|door|radar|steer|swc|" +
            "outtemp|odometer|mileage|fuel|speed|gear|handbrake|seatbelt|carinfo|vehicle|obd",
        RegexOption.IGNORE_CASE,
    )

    // Systeemregels die niets met de auto te maken hebben maar wel op de woorden lijken (bijv. "speed-profile")
    private val noisePattern = Regex(
        "^[VDIWEF]/(artd|dex2oat\\w*|PackageManager\\w*|BackgroundDexOpt\\w*|chatty|EGL_emulation|ActivityManager|Finsky|PhenotypeFlag\\w*)\\b",
    )

    // GPS-regels van de radio (WatermarkService, AtcLocationService, AudioService.updateAslSpeed ...): bevatten
    // 'speed', maar zijn GPS-ruis en geen CAN. Bij 'Alleen auto' overslaan (op de Golf-radio, 4 november 2026).
    private val gpsPattern = Regex(
        "WatermarkService|AtcLocation|updateAslSpeed|LocationManager|GnssLocation|\\bgps\\b|\\bnmea\\b",
        RegexOption.IGNORE_CASE,
    )

    // Bekende broadcasts van Chinese radio-platforms (MTC/Microntek, FYT/SYU, TopWay ...). Niet volledig.
    private val knownActions = listOf(
        "com.microntek.canbusdisplay", "com.microntek.irkeyDown", "com.microntek.irkeyUp", "com.microntek.light",
        "com.microntek.bootcheck", "com.syu.canbus", "com.syu.ms", "com.syu.carinfo", "com.tw.canbus",
        // Jancar-platform (Golf-radio): achteruitcamera begint/stopt
        "android.backcar.action.START", "android.backcar.action.FINISH",
        "com.android.canbus", "android.intent.action.CANBUS", "android.intent.action.BACKCAR",
        "android.intent.action.ILL", "android.intent.action.REVERSE",
    )

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val extras = intent.extras?.keySet()?.joinToString(", ") { key -> "$key=${intent.extras?.get(key)}" } ?: ""
            val text = "${intent.action} $extras".trim()
            remember("broadcast", text)
            onLine("broadcast", intent.action ?: "")
            if (uiRecording) add("broadcast", text)
        }
    }

    fun hasLogAccess() = activity.checkSelfPermission(Manifest.permission.READ_LOGS) == PackageManager.PERMISSION_GRANTED

    @Synchronized private fun add(source: String, text: String) {
        lines.addLast(Line(System.currentTimeMillis(), source, text))
        while (lines.size > 500) lines.removeFirst()
    }

    @Synchronized private fun remember(source: String, text: String) {
        val now = System.currentTimeMillis()
        recent.addLast(Line(now, source, text))
        while (recent.size > 4000 || (recent.isNotEmpty() && now - recent.first().time > 180_000)) recent.removeFirst()
    }

    // CAN-monitor-app: Start
    fun start(onlyCanLines: Boolean) {
        onlyCan = onlyCanLines
        uiRecording = true
        ensureRunning()
    }

    // CAN-monitor-app: Stop of dicht. Met koppelingen blijft het meelezen doorgaan.
    fun stop() {
        uiRecording = false
        if (!background) stopReading()
    }

    // Koppelingen aanwezig: ook zonder open monitor blijven meelezen
    fun setBackground(enabled: Boolean) {
        background = enabled
        if (enabled) ensureRunning() else if (!uiRecording) stopReading()
    }

    @Synchronized private fun ensureRunning() {
        if (!receiverRegistered) {
            val filter = IntentFilter().apply { (knownActions + extraActions).forEach { addAction(it) } }
            if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
            else activity.registerReceiver(receiver, filter)
            receiverRegistered = true
        }
        if (threadRunning || !hasLogAccess()) return
        threadRunning = true
        // Logboek live volgen, vanaf nu (niet de oude regels)
        logThread = Thread {
            try {
                val process = Runtime.getRuntime().exec(arrayOf("logcat", "-v", "brief", "-T", "1"))
                logProcess = process
                BufferedReader(InputStreamReader(process.inputStream)).use { reader ->
                    while (threadRunning) {
                        val line = reader.readLine() ?: break
                        if (line.contains("chromium") || line.contains("nl.pandaos")) continue // eigen regels overslaan
                        if (noisePattern.containsMatchIn(line)) continue // Android-ruis (app-compiler, pakketbeheer ...)
                        remember("logcat", line)
                        onLine("logcat", line)
                        if (uiRecording && (!onlyCan || (canPattern.containsMatchIn(line) && !gpsPattern.containsMatchIn(line)))) add("logcat", line)
                    }
                }
            } catch (_: Exception) { add("pandaos", "Logboek lezen lukte niet") }
            threadRunning = false
        }.apply { isDaemon = true; start() }
    }

    @Synchronized private fun stopReading() {
        threadRunning = false
        if (receiverRegistered) {
            try { activity.unregisterReceiver(receiver) } catch (_: Exception) {}
            receiverRegistered = false
        }
        logProcess?.destroy()
        logProcess = null
        logThread = null
    }

    // Broadcasts uit koppelingen die niet in de bekende lijst staan: ook ontvangen
    private var extraActions: List<String> = emptyList()
    @Synchronized fun setExtraActions(actions: List<String>) {
        if (actions == extraActions) return
        extraActions = actions
        if (receiverRegistered) {
            try { activity.unregisterReceiver(receiver) } catch (_: Exception) {}
            receiverRegistered = false
            ensureRunning()
        }
    }

    fun setOnlyCan(value: Boolean) { onlyCan = value }

    @Synchronized fun clear() = lines.clear()

    // {"logAccess":true,"running":true,"background":false,"lines":[..],"canApps":[{"package":..,"name":..}]}
    @Synchronized fun state(): String {
        val array = JSONArray()
        lines.toList().takeLast(200).forEach { array.put(JSONObject().put("time", it.time).put("source", it.source).put("text", it.text)) }
        return JSONObject().put("logAccess", hasLogAccess()).put("running", uiRecording && (threadRunning || receiverRegistered))
            .put("background", background).put("onlyCan", onlyCan)
            .put("lines", array).put("canApps", canApps()).toString()
    }

    // ---------------- Leren ----------------
    // Vergelijkt regels zonder getallen (tijden, pid's en meetwaarden verschillen steeds)
    private fun signature(text: String) = text.replace(Regex("^[VDIWEF]/"), "").replace(Regex("\\d+"), "#").trim()

    // Begin: alles wat er de laatste 30 seconden al langskwam telt als "normaal"
    @Synchronized fun learnStart() {
        ensureRunning()
        learnFrom = System.currentTimeMillis()
        learnBaseline = recent.filter { learnFrom - it.time < 30_000 }.map { signature(it.text) }.toSet()
    }

    // Uitslag: regels die na het begin voor het eerst langskwamen (zonder GPS), nieuwste soort één keer
    // [{"time":..,"source":"logcat","text":".."}]
    @Synchronized fun learnResult(): String {
        val seen = HashSet<String>()
        val array = JSONArray()
        recent.filter { it.time >= learnFrom && !gpsPattern.containsMatchIn(it.text) }
            .filter { val sig = signature(it.text); sig !in learnBaseline && seen.add(sig) }
            .take(80)
            .forEach { array.put(JSONObject().put("time", it.time).put("source", it.source).put("text", it.text)) }
        return JSONObject().put("from", learnFrom).put("logAccess", hasLogAccess()).put("lines", array).toString()
    }

    // ---------------- Verbinding ----------------
    // Seriële poorten (CAN-kastje/MCU hangen meestal aan een UART), systeemeigenschappen met can/mcu/car, CAN-apps
    fun connectionInfo(): String {
        val ports = JSONArray()
        val portPattern = Regex("^(tty(S|MT|HS|AMA|USB|ACM|mxc|GS|SAC|FIQ)\\d+|can\\d+|.*mcu.*|.*canbus.*|spidev.*)$", RegexOption.IGNORE_CASE)
        // Doorbladeren van /dev mag een app vaak niet (SELinux); daarom ook bekende namen rechtstreeks proberen
        val listed = File("/dev").listFiles()?.filter { portPattern.matches(it.name) }?.map { it.name } ?: emptyList()
        val known = listOf("ttyS", "ttyMT", "ttyHS", "ttyAMA", "ttyUSB", "ttyACM", "ttyGS", "ttySAC", "ttyFIQ")
            .flatMap { prefix -> (0..7).map { "$prefix$it" } } + listOf("can0", "can1", "mcu", "mcu_uart", "canbus")
        (listed + known).distinct().map { File("/dev/$it") }.filter { it.exists() }.sortedBy { it.name }.forEach {
            ports.put(JSONObject().put("name", it.absolutePath).put("read", it.canRead()).put("write", it.canWrite()))
        }
        val props = JSONArray()
        try {
            val process = Runtime.getRuntime().exec("getprop")
            val keep = Regex("(^|[^a-z])can(bus|box|_|\\.|\\]|\\b)|mcu|protocol|backcar|jancar|\\.car\\.|vehicle|uart|tty", RegexOption.IGNORE_CASE)
            BufferedReader(InputStreamReader(process.inputStream)).useLines { seq ->
                seq.filter { keep.containsMatchIn(it) && !it.contains("ro.serialno") && !it.contains("ro.boot.serialno") }
                    .take(80).forEach { props.put(it) }
            }
        } catch (_: Exception) {}
        // CAN-netwerkinterfaces (SocketCAN), als de radio die heeft
        val netCan = JSONArray()
        File("/sys/class/net").listFiles()?.filter { it.name.startsWith("can") || it.name.startsWith("vcan") }?.forEach { netCan.put(it.name) }
        return JSONObject()
            .put("ports", ports).put("properties", props).put("canInterfaces", netCan)
            .put("canApps", canApps()).put("logAccess", hasLogAccess())
            .put("reading", threadRunning).put("background", background)
            .toString()
    }

    // Apps van de fabrikant die met de auto te maken hebben (CAN-app, auto-info, MCU-dienst ...)
    private fun canApps(): JSONArray {
        val pm = activity.packageManager
        val pattern = Regex("can|carinfo|vehicle|mcu|syu|microntek|\\.tw\\.|carsetting|carservice|obd|backcar|jancar|autoai", RegexOption.IGNORE_CASE)
        val result = JSONArray()
        pm.getInstalledApplications(0)
            .filter { pattern.containsMatchIn(it.packageName) && !it.packageName.startsWith("com.google") }
            .sortedBy { it.packageName }
            .forEach { result.put(JSONObject().put("package", it.packageName).put("name", pm.getApplicationLabel(it).toString())) }
        return result
    }

    // Alles opslaan als tekstbestand (op de radio te kopiëren met: adb pull <pad>)
    @Synchronized fun save(): String {
        val dir = activity.getExternalFilesDir(null) ?: activity.filesDir
        val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
        val file = File(dir, "can-monitor-$stamp.txt")
        val format = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)
        file.printWriter().use { out ->
            out.println("PandaOS CAN-monitor $stamp")
            out.println("CAN-apps: ${canApps()}")
            lines.forEach { out.println("${format.format(Date(it.time))} [${it.source}] ${it.text}") }
        }
        return file.absolutePath
    }
}
