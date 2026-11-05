package nl.pandaos.launcher

import android.Manifest
import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

// Rechten van PandaOS (Instellingen > Rechten): per recht de status en hoe je het geeft.
//  - "runtime": Android vraagt het zelf (venster), PandaOS kan dat starten;
//  - "adb": alleen eenmalig via de laptop (adb shell pm grant / appops);
//  - "special": een Android-instellingenscherm (of PandaOS zet het zelf met WRITE_SECURE_SETTINGS).
class PermissionsCenter(private val activity: Activity) {

    data class Item(val id: String, val group: String, val kind: String, val permission: String?, val adb: String?)

    private val pkg = activity.packageName

    private val items = listOf(
        Item("camera", "car", "runtime", Manifest.permission.CAMERA, null),
        Item("microphone", "car", "runtime", Manifest.permission.RECORD_AUDIO, null),
        Item("location", "car", "runtime", Manifest.permission.ACCESS_FINE_LOCATION, null),
        Item("contacts", "phone", "runtime", Manifest.permission.READ_CONTACTS, null),
        Item("calllog", "phone", "runtime", Manifest.permission.READ_CALL_LOG, null),
        Item("calllog_edit", "phone", "runtime", Manifest.permission.WRITE_CALL_LOG, null),
        Item("contacts_edit", "phone", "runtime", Manifest.permission.WRITE_CONTACTS, null),
        Item("call", "phone", "runtime", Manifest.permission.CALL_PHONE, null),
        Item("calendar", "phone", "runtime", Manifest.permission.READ_CALENDAR, null),
        Item("sms", "phone", "runtime", Manifest.permission.READ_SMS, null),
        Item("notifications", "system", "special", null, "adb shell cmd notification allow_listener $pkg/$pkg.MediaListenerService"),
        Item("overlay", "system", "special", null, "adb shell appops set $pkg SYSTEM_ALERT_WINDOW allow"),
        Item("logs", "system", "adb", Manifest.permission.READ_LOGS, "adb shell pm grant $pkg android.permission.READ_LOGS"),
        Item("secure", "system", "adb", Manifest.permission.WRITE_SECURE_SETTINGS, "adb shell pm grant $pkg android.permission.WRITE_SECURE_SETTINGS"),
        Item("config", "system", "adb", "android.permission.CHANGE_CONFIGURATION", "adb shell pm grant $pkg android.permission.CHANGE_CONFIGURATION"),
        Item("windows", "system", "special", null, "adb shell settings put global enable_freeform_support 1"),
    )

    private fun has(permission: String) = activity.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    private fun canWriteSecure() = has(Manifest.permission.WRITE_SECURE_SETTINGS)

    private val listener get() = ComponentName(activity, MediaListenerService::class.java)

    fun notificationAccess(): Boolean {
        val enabled = Settings.Secure.getString(activity.contentResolver, "enabled_notification_listeners") ?: return false
        return enabled.split(':').any { ComponentName.unflattenFromString(it) == listener }
    }

    private fun freeformOn() = Settings.Global.getInt(activity.contentResolver, "enable_freeform_support", 0) == 1

    private fun granted(item: Item): Boolean = when (item.id) {
        "notifications" -> notificationAccess()
        "overlay" -> Settings.canDrawOverlays(activity)
        "windows" -> freeformOn()
        else -> item.permission?.let { has(it) } ?: false
    }

    fun stateJson(): String {
        val list = JSONArray()
        for (item in items) {
            list.put(JSONObject()
                .put("id", item.id).put("group", item.group).put("kind", item.kind)
                .put("granted", granted(item))
                // Kan PandaOS het nu zelf regelen (venster van Android, instellingenscherm of met WRITE_SECURE_SETTINGS)?
                .put("canRequest", item.kind != "adb")
                .put("adb", item.adb ?: JSONObject.NULL))
        }
        return JSONObject().put("items", list).put("canWriteSecure", canWriteSecure()).toString()
    }

    // Recht aanvragen. true = er gebeurt iets (venster/scherm), false = alleen via de laptop
    fun request(id: String): Boolean {
        val item = items.firstOrNull { it.id == id } ?: return false
        return when (item.id) {
            "notifications" -> {
                // Met WRITE_SECURE_SETTINGS zet PandaOS de toegang zelf aan; anders het Android-scherm
                if (canWriteSecure() && enableNotificationAccess()) true
                else openSettings(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"))
            }
            "overlay" -> openSettings(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$pkg")))
            "windows" -> {
                if (!canWriteSecure()) return false
                Settings.Global.putInt(activity.contentResolver, "enable_freeform_support", 1)
                Settings.Global.putInt(activity.contentResolver, "force_resizable_activities", 1)
                DiagLog.add("info", "Losse vensters aangezet (werkt na herstart)")
                true
            }
            else -> if (item.kind == "runtime" && item.permission != null) {
                activity.requestPermissions(arrayOf(item.permission), REQUEST_CODE)
                true
            } else false
        }
    }

    // Alle rechten van de groep Telefoon in één keer vragen (bij het openen van Telefoon/Agenda/Berichten)
    fun requestPhoneGroup() {
        val missing = items.filter { it.group == "phone" && it.permission != null && !has(it.permission) }.map { it.permission!! }
        if (missing.isNotEmpty()) activity.requestPermissions(missing.toTypedArray(), REQUEST_CODE)
    }

    // PandaOS zelf toevoegen aan de meldingen-luisteraars (zelfde instelling als het Android-scherm)
    fun enableNotificationAccess(): Boolean = try {
        val current = Settings.Secure.getString(activity.contentResolver, "enabled_notification_listeners") ?: ""
        if (!current.split(':').any { ComponentName.unflattenFromString(it) == listener }) {
            val updated = listOf(current, listener.flattenToString()).filter { it.isNotEmpty() }.joinToString(":")
            Settings.Secure.putString(activity.contentResolver, "enabled_notification_listeners", updated)
            DiagLog.add("info", "Toegang tot meldingen/media zelf aangezet")
        }
        true
    } catch (e: Exception) { DiagLog.add("error", "Meldingen-toegang aanzetten mislukt: ${e.message}"); false }

    private fun openSettings(intent: Intent): Boolean = try {
        activity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
    } catch (_: Exception) {
        try { activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true }
        catch (_: Exception) { false }
    }

    companion object {
        const val REQUEST_CODE = 41
    }
}
