package nl.pandaos.launcher

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// CAN-monitor (Settings > Voertuig > CAN-bus): laat zien wat het CAN-kastje en de CAN-app van de radio doorgeven,
// zodat we kunnen uitzoeken welke gegevens er zijn (achteruit, lichten, deuren, temperatuur ...) en hoe ze heten.
// Twee bronnen:
//  1. Het Android-logboek (logcat) van de hele radio, gefilterd op CAN-achtige regels. Daarvoor is READ_LOGS nodig,
//     eenmalig via ADB: adb shell pm grant nl.pandaos.launcher android.permission.READ_LOGS
//  2. Broadcasts van bekende radio-platforms (best-effort lijst; aanvullen zodra we de echte namen kennen).
class CanMonitor(private val activity: Activity) {

    private data class Line(val time: Long, val source: String, val text: String)

    private val lines = ArrayDeque<Line>()
    private var logThread: Thread? = null
    private var logProcess: Process? = null
    @Volatile private var running = false
    private var onlyCan = true

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

    // Bekende broadcasts van Chinese radio-platforms (MTC/Microntek, FYT/SYU, TopWay ...). Niet volledig.
    private val knownActions = listOf(
        "com.microntek.canbusdisplay", "com.microntek.irkeyDown", "com.microntek.irkeyUp", "com.microntek.light",
        "com.microntek.bootcheck", "com.syu.canbus", "com.syu.ms", "com.syu.carinfo", "com.tw.canbus",
        "com.android.canbus", "android.intent.action.CANBUS", "android.intent.action.BACKCAR",
        "android.intent.action.ILL", "android.intent.action.REVERSE",
    )

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val extras = intent.extras?.keySet()?.joinToString(", ") { key -> "$key=${intent.extras?.get(key)}" } ?: ""
            add("broadcast", "${intent.action} $extras".trim())
        }
    }

    fun hasLogAccess() = activity.checkSelfPermission(Manifest.permission.READ_LOGS) == PackageManager.PERMISSION_GRANTED

    @Synchronized private fun add(source: String, text: String) {
        lines.addLast(Line(System.currentTimeMillis(), source, text))
        while (lines.size > 500) lines.removeFirst()
    }

    fun start(onlyCanLines: Boolean) {
        onlyCan = onlyCanLines
        if (running) return
        running = true
        activity.registerReceiver(receiver, IntentFilter().apply { knownActions.forEach { addAction(it) } })
        if (!hasLogAccess()) return
        // Logboek live volgen, vanaf nu (niet de oude regels)
        logThread = Thread {
            try {
                val process = Runtime.getRuntime().exec(arrayOf("logcat", "-v", "brief", "-T", "1"))
                logProcess = process
                BufferedReader(InputStreamReader(process.inputStream)).use { reader ->
                    while (running) {
                        val line = reader.readLine() ?: break
                        if (line.contains("chromium") || line.contains("nl.pandaos")) continue // eigen regels overslaan
                        if (noisePattern.containsMatchIn(line)) continue // Android-ruis (app-compiler, pakketbeheer ...)
                        if (!onlyCan || canPattern.containsMatchIn(line)) add("logcat", line)
                    }
                }
            } catch (_: Exception) { add("pandaos", "Logboek lezen lukte niet") }
        }.apply { isDaemon = true; start() }
    }

    fun stop() {
        if (!running) return
        running = false
        try { activity.unregisterReceiver(receiver) } catch (_: Exception) {}
        logProcess?.destroy()
        logProcess = null
        logThread = null
    }

    fun setOnlyCan(value: Boolean) { onlyCan = value }

    @Synchronized fun clear() = lines.clear()

    // {"logAccess":true,"running":true,"lines":[{"time":..,"source":"logcat","text":".."}],"canApps":[{"package":..,"name":..}]}
    @Synchronized fun state(): String {
        val array = JSONArray()
        lines.toList().takeLast(200).forEach { array.put(JSONObject().put("time", it.time).put("source", it.source).put("text", it.text)) }
        return JSONObject().put("logAccess", hasLogAccess()).put("running", running).put("onlyCan", onlyCan)
            .put("lines", array).put("canApps", canApps()).toString()
    }

    // Apps van de fabrikant die met de auto te maken hebben (CAN-app, auto-info, MCU-dienst ...)
    private fun canApps(): JSONArray {
        val pm = activity.packageManager
        val pattern = Regex("can|carinfo|vehicle|mcu|syu|microntek|\\.tw\\.|carsetting|carservice|obd", RegexOption.IGNORE_CASE)
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
