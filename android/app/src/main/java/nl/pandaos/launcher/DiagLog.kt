package nl.pandaos.launcher

import android.Manifest
import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// Diagnose aan de Android-kant (Settings > Software > Diagnose):
//  - crashes van de launcher (bewaard in een bestand, bij de volgende start zichtbaar)
//  - belangrijke gebeurtenissen en fouten van de launcher (Bluetooth, updates, toestemmingen ...)
//  - gegevens van de radio (fabrikant, model, chipset, Android-versie) en de stand van de toestemmingen
//  - een rapport opslaan en delen via het deelmenu van Android (WhatsApp, Gmail ... naar je telefoon)
object DiagLog {

    private data class Entry(val time: Long, val level: String, val message: String)

    private val entries = ArrayDeque<Entry>()
    private var dir: File? = null

    fun init(context: Context) {
        dir = File(context.filesDir, "diagnostics").apply { mkdirs() }
        // Crash van de launcher: in een bestand schrijven (het proces stopt daarna)
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                val trace = StringWriter().also { error.printStackTrace(PrintWriter(it)) }.toString()
                File(dir, "crash.txt").writeText("${stamp(System.currentTimeMillis())} op thread ${thread.name}\n$trace")
            } catch (_: Exception) {}
            previous?.uncaughtException(thread, error)
        }
        add("info", "Launcher gestart")
        File(dir, "crash.txt").takeIf { it.exists() }?.let { add("error", "Vorige crash van de launcher: ${it.readText().take(1500)}") }
    }

    @Synchronized fun add(level: String, message: String) {
        entries.addLast(Entry(System.currentTimeMillis(), level, message))
        while (entries.size > 300) entries.removeFirst()
    }

    // [{"time":..,"level":"error","message":".."}]
    @Synchronized fun entriesJson(): String {
        val array = JSONArray()
        entries.forEach { array.put(JSONObject().put("time", it.time).put("level", it.level).put("message", it.message)) }
        return array.toString()
    }

    @Synchronized fun clear() {
        entries.clear()
        dir?.let { File(it, "crash.txt").delete() }
    }

    // Radio en toestemmingen: helpt om op afstand te zien wat er aan staat
    fun deviceJson(activity: Activity): String {
        val pm = activity.packageManager
        fun granted(permission: String) = activity.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
        val listeners = Settings.Secure.getString(activity.contentResolver, "enabled_notification_listeners").orEmpty()
        val policy = activity.getSystemService(DevicePolicyManager::class.java)
        val info = pm.getPackageInfo(activity.packageName, 0)
        val metrics = activity.resources.displayMetrics
        return JSONObject()
            .put("manufacturer", Build.MANUFACTURER).put("brand", Build.BRAND).put("model", Build.MODEL)
            .put("device", Build.DEVICE).put("board", Build.BOARD).put("hardware", Build.HARDWARE)
            .put("soc", if (Build.VERSION.SDK_INT >= 31) "${Build.SOC_MANUFACTURER} ${Build.SOC_MODEL}" else Build.HARDWARE)
            .put("android", Build.VERSION.RELEASE).put("sdk", Build.VERSION.SDK_INT).put("build", Build.DISPLAY)
            .put("screen", "${metrics.widthPixels}x${metrics.heightPixels} @ ${metrics.densityDpi} dpi")
            .put("pandaos", info.versionName)
            .put("deviceOwner", policy?.isDeviceOwnerApp(activity.packageName) == true)
            .put("permissions", JSONObject()
                .put("location", granted(Manifest.permission.ACCESS_FINE_LOCATION))
                .put("camera", granted(Manifest.permission.CAMERA))
                .put("readLogs", granted(Manifest.permission.READ_LOGS))
                .put("notifications", listeners.contains(activity.packageName))
                .put("systemSettings", Settings.System.canWrite(activity)))
            .toString()
    }

    // Rapport opslaan en het deelmenu van Android openen. Geeft het pad van het bestand terug.
    fun share(activity: Activity, text: String): String {
        val reports = File(activity.getExternalFilesDir(null) ?: activity.filesDir, "reports").apply { mkdirs() }
        val file = File(reports, "pandaos-rapport-${SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())}.txt")
        file.writeText(text)
        activity.runOnUiThread {
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_SUBJECT, "PandaOS probleemrapport")
                putExtra(Intent.EXTRA_TEXT, text.take(60_000)) // WhatsApp/Gmail: tekst, ruim genoeg
            }
            activity.startActivity(Intent.createChooser(send, "Rapport delen").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        add("info", "Rapport opgeslagen: ${file.absolutePath}")
        return file.absolutePath
    }

    private fun stamp(time: Long) = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date(time))
}
