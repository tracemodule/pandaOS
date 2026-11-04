package nl.pandaos.launcher

import android.app.Notification
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject

// Meldingen-luisteraar. Android geeft alleen aan een app met een toegestane meldingen-luisteraar toegang tot
// de mediasessies van andere apps (MediaWatcher) en tot de meldingen (PandaOS-paneel, veeg omlaag).
// Toestaan: Instellingen > Meldingen > Apparaat- en app-meldingen (of Settings > Apps in PandaOS).
class MediaListenerService : NotificationListenerService() {

    override fun onListenerConnected() {
        instance = this
        onChange?.invoke()
    }

    override fun onListenerDisconnected() {
        if (instance === this) instance = null
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) { onChange?.invoke() }
    override fun onNotificationRemoved(sbn: StatusBarNotification) { onChange?.invoke() }

    companion object {
        @Volatile var instance: MediaListenerService? = null
        // Aangeroepen bij een nieuwe of verdwenen melding (MainActivity stuurt dat door naar de webapp)
        @Volatile var onChange: (() -> Unit)? = null

        // [{"key":"..","app":"WhatsApp","package":"com.whatsapp","title":"..","text":"..","time":123,"clearable":true}]
        fun notificationsJson(): String {
            val service = instance ?: return "[]"
            val pm = service.packageManager
            val list = JSONArray()
            val active = try { service.activeNotifications } catch (_: Exception) { null } ?: return "[]"
            active
                .filter { it.packageName != service.packageName }
                // Lopende media- en systeemmeldingen zonder tekst overslaan
                .filter { !it.notification.extras.getCharSequence(Notification.EXTRA_TITLE).isNullOrBlank() }
                .filter { it.notification.flags and Notification.FLAG_GROUP_SUMMARY == 0 }
                .sortedByDescending { it.postTime }
                .forEach { sbn ->
                    val extras = sbn.notification.extras
                    val appName = try {
                        pm.getApplicationLabel(pm.getApplicationInfo(sbn.packageName, 0)).toString()
                    } catch (_: PackageManager.NameNotFoundException) { sbn.packageName }
                    list.put(JSONObject()
                        .put("key", sbn.key)
                        .put("app", appName)
                        .put("package", sbn.packageName)
                        .put("title", extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: "")
                        .put("text", (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: "")
                        .put("time", sbn.postTime)
                        .put("clearable", sbn.isClearable))
                }
            return list.toString()
        }

        // Tik op een melding: openen wat de app daarvoor heeft ingesteld, daarna weghalen als dat hoort
        fun open(key: String): Boolean {
            val service = instance ?: return false
            val sbn = service.activeNotifications.firstOrNull { it.key == key } ?: return false
            return try {
                sbn.notification.contentIntent?.send()
                if (sbn.notification.flags and Notification.FLAG_AUTO_CANCEL != 0) service.cancelNotification(key)
                true
            } catch (_: Exception) { false }
        }

        fun dismiss(key: String) { instance?.cancelNotification(key) }

        fun dismissAll() { instance?.cancelAllNotifications() }
    }
}
