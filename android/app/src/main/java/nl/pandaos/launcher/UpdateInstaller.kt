package nl.pandaos.launcher

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

// Software-updates (Settings > Software): een nieuwe PandaOS-versie (APK uit een GitHub Release) downloaden en
// installeren. Als apparaateigenaar installeert Android hem zonder vraag; anders vraagt Android één bevestiging.
// Na de installatie start PandaOS als startscherm vanzelf opnieuw.
class UpdateInstaller(private val activity: Activity, private val send: (String) -> Unit) {
    companion object { const val PREFS = "pandaos_update" }

    @Volatile private var busy = false

    fun versionJson(): String {
        val info = activity.packageManager.getPackageInfo(activity.packageName, 0)
        @Suppress("DEPRECATION")
        val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
        return JSONObject().put("version", info.versionName).put("code", code).toString()
    }

    // Voortgang naar de webapp: updateStatus({"state":"downloading","progress":42}) / installing / done / error
    private fun status(state: String, progress: Int = 0, message: String = "") =
        activity.runOnUiThread {
            send("updateStatus(${JSONObject().put("state", state).put("progress", progress).put("message", message)})")
        }

    private val updateFile get() = File(activity.cacheDir, "pandaos-update.apk")
    private val prefs get() = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    // Oude manier (één knop): downloaden en meteen installeren
    fun install(url: String) = download(url, thenInstall = true)

    // Stap 1 (updatepagina): alleen downloaden en controleren; daarna status "ready" met de nieuwe versie
    fun download(url: String, thenInstall: Boolean = false) {
        if (busy) return
        busy = true
        DiagLog.add("info", "Update downloaden: $url")
        Thread {
            try {
                download(url, updateFile)
                val version = check(updateFile)
                if (thenInstall) { status("installing", 100, version); commit(updateFile, version) }
                else { status("ready", 100, version); busy = false }
            } catch (e: Exception) {
                DiagLog.add("error", "Update mislukt: ${e.message}")
                status("error", 0, e.message ?: "Onbekende fout")
                busy = false
            }
        }.apply { isDaemon = true; start() }
    }

    // Versie van de gedownloade update ("" = niets klaar)
    fun downloadedVersion(): String = try {
        if (!updateFile.exists()) "" else check(updateFile)
    } catch (_: Exception) { "" }

    // Stap 2: de gedownloade update installeren. PandaOS wordt daarbij gestopt en start daarna vanzelf opnieuw.
    fun installDownloaded(): Boolean {
        if (busy) return false
        val version = downloadedVersion().ifEmpty { return false }
        busy = true
        status("installing", 100, version)
        Thread {
            try { commit(updateFile, version) } catch (e: Exception) {
                DiagLog.add("error", "Update installeren mislukt: ${e.message}")
                prefs.edit().remove("updatingTo").apply()
                status("error", 0, e.message ?: "Onbekende fout")
                busy = false
            }
        }.apply { isDaemon = true; start() }
        return true
    }

    // Na het opnieuw opstarten: is de update gelukt? {"updatedTo":"1.4.1"} één keer, daarna leeg.
    // Ruimt ook de gedownloade APK op.
    fun takeUpdateResult(): String {
        val target = prefs.getString("updatingTo", null) ?: return "{}"
        val current = activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: ""
        if (current != target) return "{}" // installatie loopt nog of is afgebroken (dan meldt takeLastError het)
        prefs.edit().remove("updatingTo").apply()
        updateFile.delete()
        DiagLog.add("info", "Bijgewerkt naar $target")
        return JSONObject().put("updatedTo", target).toString()
    }

    // Downloaden met voortgang; GitHub stuurt eerst door naar de echte bestandslocatie
    private fun download(url: String, target: File) {
        var connection = URL(url).openConnection() as HttpURLConnection
        var redirects = 0
        while (connection.responseCode in 300..399 && redirects < 5) {
            val next = connection.getHeaderField("Location")
            connection.disconnect()
            connection = URL(next).openConnection() as HttpURLConnection
            redirects++
        }
        if (connection.responseCode != 200) throw IllegalStateException("Download mislukt (${connection.responseCode})")
        val total = connection.contentLengthLong
        var done = 0L
        var lastPercent = -1
        connection.inputStream.use { input ->
            target.outputStream().use { output ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    output.write(buffer, 0, read)
                    done += read
                    val percent = if (total > 0) (done * 100 / total).toInt() else 0
                    if (percent != lastPercent) { lastPercent = percent; status("downloading", percent) }
                }
            }
        }
        connection.disconnect()
    }

    // Alleen PandaOS zelf, en alleen een nieuwere versie; geeft de versie van de APK
    private fun check(file: File): String {
        val pm = activity.packageManager
        val archive = pm.getPackageArchiveInfo(file.absolutePath, 0) ?: throw IllegalStateException("Geen geldige APK")
        if (archive.packageName != activity.packageName) throw IllegalStateException("APK is niet van PandaOS")
        val installed = pm.getPackageInfo(activity.packageName, 0)
        @Suppress("DEPRECATION")
        val newCode = if (Build.VERSION.SDK_INT >= 28) archive.longVersionCode else archive.versionCode.toLong()
        @Suppress("DEPRECATION")
        val oldCode = if (Build.VERSION.SDK_INT >= 28) installed.longVersionCode else installed.versionCode.toLong()
        if (newCode <= oldCode) throw IllegalStateException("Deze versie is al geïnstalleerd")
        return archive.versionName ?: ""
    }

    private fun commit(file: File, version: String) {
        // Onthouden dat we bijwerken: na de herstart bevestigt PandaOS dat het gelukt is (takeUpdateResult)
        prefs.edit().putString("updatingTo", version).apply()
        DiagLog.add("info", "Update installeren: $version")
        val installer = activity.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            .apply { setAppPackageName(activity.packageName) }
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("pandaos.apk", 0, file.length()).use { out ->
                file.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            val intent = Intent(activity, InstallResultReceiver::class.java)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            session.commit(PendingIntent.getBroadcast(activity, sessionId, intent, flags).intentSender)
        }
    }

    // Uitslag van de installatie. Zonder apparaateigenaar vraagt Android eerst om bevestiging (scherm openen).
    class InstallResultReceiver : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    @Suppress("DEPRECATION")
                    val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                    context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                // Gelukt: PandaOS is vervangen. Vangnet naast PackageReplacedReceiver: zelf weer openen.
                PackageInstaller.STATUS_SUCCESS -> try {
                    context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (_: Exception) {}
                else -> {
                    // Mislukt (bijv. andere ondertekening): de webapp ziet dat er niets gebeurd is
                    val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "Installatie mislukt"
                    DiagLog.add("error", "Update-installatie geweigerd: $message")
                    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("error", message).remove("updatingTo").apply()
                }
            }
        }
    }

    // Na een update (of herinstallatie) PandaOS meteen weer openen als startscherm
    class PackageReplacedReceiver : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
            context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    // Laatste installatiefout (bijv. "handtekening komt niet overeen"), daarna leeg
    fun takeLastError(): String {
        val error = prefs.getString("error", "") ?: ""
        if (error.isNotEmpty()) { prefs.edit().remove("error").apply(); busy = false }
        return error
    }

    // Mag PandaOS zelf apps installeren? (Alleen nodig zonder apparaateigenaar; zie de manifest-toestemming)
    fun canInstall(): Boolean = Build.VERSION.SDK_INT < 26 || activity.packageManager.canRequestPackageInstalls() ||
        activity.packageManager.checkPermission(android.Manifest.permission.INSTALL_PACKAGES, activity.packageName) == PackageManager.PERMISSION_GRANTED
}
