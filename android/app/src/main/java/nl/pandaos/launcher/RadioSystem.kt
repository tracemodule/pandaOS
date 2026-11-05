package nl.pandaos.launcher

import android.Manifest
import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.pm.PackageManager
import android.provider.Settings
import org.json.JSONObject

// Geavanceerde instellingen van de radio (Settings > Advanced > Radio-instellingen).
// Wat eerder alleen via de laptop kon (BEVINDINGEN.md, 5-11-2026):
//   - systeembalk van de radio verbergen (alle apps): settings put global policy_control immersive.full=*
//   - volumebalk van de radio buiten beeld: wm overscan 0,-110,0,0
//   - paneel van de radio op slot: jancar_sysui_panel_disable_touch (Jancar, nog niet getest)
//   - camera-app van de radio (com.jancar.hd2cam): alleen tonen; uitzetten kan een gewone app niet
// Schrijven vraagt WRITE_SECURE_SETTINGS. Die geeft Android niet aan een app; één keer via de laptop:
//   adb shell pm grant nl.pandaos.launcher android.permission.WRITE_SECURE_SETTINGS
// Alles is terug te draaien (reset()).
class RadioSystem(private val activity: Activity) {

    private val resolver get() = activity.contentResolver
    private val prefs get() = activity.getSharedPreferences("radio-system", Activity.MODE_PRIVATE)

    companion object {
        // Vensters boven andere apps (TYPE_APPLICATION_OVERLAY) rekent Android 9 vanaf de overscan-rand (bijv. 110 px
        // boven het scherm). Zoveel px moeten ze omlaag om op het zichtbare scherm te beginnen.
        @Volatile private var measuredShift: Int? = null
        // Wordt aangeroepen zodra de verschuiving gemeten is (PandaOverlay zet dan de veegstrook goed)
        var onShiftMeasured: (() -> Unit)? = null
        fun overlayShift(activity: Activity): Int = measuredShift ?: -(RadioSystem(activity).overscanTop() ?: 0).coerceAtMost(0)

        // Na het plaatsen nameten waar het venster echt staat en het verschil corrigeren (de overscan is niet altijd
        // uit te lezen); de gemeten verschuiving geldt daarna voor alle vensters boven andere apps
        fun fixOverlayPosition(wm: android.view.WindowManager, view: android.view.View, params: android.view.WindowManager.LayoutParams, wantedY: Int) {
            view.postDelayed({
                if (!view.isAttachedToWindow) return@postDelayed
                val loc = IntArray(2)
                view.getLocationOnScreen(loc)
                val error = wantedY - loc[1]
                if (error != 0) {
                    params.y += error
                    try { wm.updateViewLayout(view, params) } catch (_: Exception) {}
                }
                val shift = params.y - wantedY
                if (shift != measuredShift) { measuredShift = shift; onShiftMeasured?.invoke() }
            }, 300) // pas na het plaatsen en opmeten van het venster
        }

        const val POLICY_KEY = "policy_control"
        // Voor alle apps: ook boven Waze/Flitsmeister (half of volledig) geen Android-balk; het PandaOS-menu vervangt hem
        const val HIDE_BARS = "immersive.full=*"
        const val PANEL_LOCK_KEY = "jancar_sysui_panel_disable_touch"
        const val RADIO_CAMERA = "com.jancar.hd2cam"
        const val VOLUME_BAR_OVERSCAN = -110 // px: haalt de systeembalk én de volumebalk van de radio uit beeld
    }

    fun canWrite(): Boolean =
        activity.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) == PackageManager.PERMISSION_GRANTED

    // In welke tabel staat de paneel-instelling van Jancar (global, system of secure)? null = bestaat niet
    private fun panelLockTable(): String? = when {
        Settings.Global.getString(resolver, PANEL_LOCK_KEY) != null -> "global"
        Settings.System.getString(resolver, PANEL_LOCK_KEY) != null -> "system"
        Settings.Secure.getString(resolver, PANEL_LOCK_KEY) != null -> "secure"
        else -> null
    }

    private fun panelLockValue(): String? = when (panelLockTable()) {
        "global" -> Settings.Global.getString(resolver, PANEL_LOCK_KEY)
        "system" -> Settings.System.getString(resolver, PANEL_LOCK_KEY)
        "secure" -> Settings.Secure.getString(resolver, PANEL_LOCK_KEY)
        else -> null
    }

    // Bovenrand (overscan) van het scherm uitlezen via de verborgen DisplayInfo; null = niet uit te lezen
    fun overscanTop(): Int? = try {
        val infoClass = Class.forName("android.view.DisplayInfo")
        val info = infoClass.getDeclaredConstructor().newInstance()
        val display = activity.windowManager.defaultDisplay
        display.javaClass.getMethod("getDisplayInfo", infoClass).invoke(display, info)
        infoClass.getField("overscanTop").getInt(info)
    } catch (_: Throwable) {
        if (prefs.contains("overscanTop")) prefs.getInt("overscanTop", 0) else null
    }

    private fun cameraAppState(): String = try {
        val pm = activity.packageManager
        pm.getApplicationInfo(RADIO_CAMERA, 0)
        when (pm.getApplicationEnabledSetting(RADIO_CAMERA)) {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED_USER -> "off"
            else -> {
                val policy = activity.getSystemService(DevicePolicyManager::class.java)
                val admin = ComponentName(activity, PandaAdminReceiver::class.java)
                val hidden = try { policy?.isApplicationHidden(admin, RADIO_CAMERA) == true } catch (_: Exception) { false }
                if (hidden) "off" else "on"
            }
        }
    } catch (_: PackageManager.NameNotFoundException) { "missing" }

    fun stateJson(): String {
        val policy = Settings.Global.getString(resolver, POLICY_KEY)
        val top = overscanTop()
        val isOwner = activity.getSystemService(DevicePolicyManager::class.java)?.isDeviceOwnerApp(activity.packageName) == true
        return JSONObject()
            .put("canWrite", canWrite())
            .put("deviceOwner", isOwner)
            .put("systemBarHidden", policy?.let { it.contains("nl.pandaos.launcher") || it.contains("immersive.full=*") } == true)
            .put("policy", policy ?: JSONObject.NULL)
            .put("volumeBarHidden", if (top == null) JSONObject.NULL else top <= VOLUME_BAR_OVERSCAN)
            .put("overscanTop", top ?: JSONObject.NULL)
            .put("panelLockTable", panelLockTable() ?: JSONObject.NULL)
            .put("panelLocked", panelLockValue()?.let { it == "1" || it == "true" } ?: JSONObject.NULL)
            .put("radioCamera", cameraAppState())
            .toString()
    }

    private fun result(ok: Boolean, error: String? = null): String =
        JSONObject().put("ok", ok).put("error", error ?: JSONObject.NULL).toString()

    // Systeembalk van de radio verbergen terwijl PandaOS voorgrond is (immersive); terug = null
    fun setSystemBarHidden(hidden: Boolean): String {
        if (!canWrite()) return result(false, "no-permission")
        return try {
            Settings.Global.putString(resolver, POLICY_KEY, if (hidden) HIDE_BARS else null)
            DiagLog.add("info", "Systeembalk radio ${if (hidden) "verborgen" else "terug"}")
            result(true)
        } catch (e: Exception) { result(false, e.message) }
    }

    // Overscan bovenaan: -110 haalt de volumebalk van de radio uit beeld (zoals `wm overscan 0,-110,0,0`).
    // Via de verborgen IWindowManager.setOverscan; werkt alleen met WRITE_SECURE_SETTINGS.
    fun setVolumeBarHidden(hidden: Boolean): String {
        if (!canWrite()) return result(false, "no-permission")
        val top = if (hidden) VOLUME_BAR_OVERSCAN else 0
        return try {
            val wmGlobal = Class.forName("android.view.WindowManagerGlobal")
            val wms = wmGlobal.getMethod("getWindowManagerService").invoke(null)!!
            val method = wms.javaClass.getMethod("setOverscan",
                Int::class.javaPrimitiveType, Int::class.javaPrimitiveType, Int::class.javaPrimitiveType,
                Int::class.javaPrimitiveType, Int::class.javaPrimitiveType)
            method.invoke(wms, 0, 0, top, 0, 0) // display 0, links, boven, rechts, onder
            prefs.edit().putInt("overscanTop", top).apply()
            DiagLog.add("info", "Overscan radio bovenaan $top")
            result(true)
        } catch (e: Throwable) {
            val cause = (e as? java.lang.reflect.InvocationTargetException)?.targetException ?: e
            DiagLog.add("error", "Overscan zetten mislukt: ${cause.javaClass.simpleName} ${cause.message}")
            result(false, "${cause.javaClass.simpleName}: ${cause.message}")
        }
    }

    // Paneel van de radio op slot (Jancar-instelling, alleen als die bestaat)
    fun setPanelLocked(locked: Boolean): String {
        if (!canWrite()) return result(false, "no-permission")
        val value = if (locked) "1" else "0"
        return try {
            when (panelLockTable()) {
                "global" -> Settings.Global.putString(resolver, PANEL_LOCK_KEY, value)
                "system" -> Settings.System.putString(resolver, PANEL_LOCK_KEY, value)
                "secure" -> Settings.Secure.putString(resolver, PANEL_LOCK_KEY, value)
                else -> return result(false, "missing")
            }
            DiagLog.add("info", "Paneel radio ${if (locked) "op slot" else "vrij"}")
            result(true)
        } catch (e: Exception) { result(false, e.message) }
    }

    // Camera-app van de radio: alleen als apparaateigenaar te verbergen; anders de app-info openen
    fun setRadioCameraEnabled(enabled: Boolean): String {
        val policy = activity.getSystemService(DevicePolicyManager::class.java)
        if (policy?.isDeviceOwnerApp(activity.packageName) != true) return result(false, "not-owner")
        return try {
            val ok = policy.setApplicationHidden(ComponentName(activity, PandaAdminReceiver::class.java), RADIO_CAMERA, !enabled)
            DiagLog.add("info", "Camera-app radio ${if (enabled) "aan" else "uit"}: $ok")
            result(ok)
        } catch (e: Exception) { result(false, e.message) }
    }

    // --- Datum en tijd (Settings > Display > Tijd) ---
    // Tijd automatisch via internet (NTP over wifi): Settings.Global.AUTO_TIME, kan met WRITE_SECURE_SETTINGS.
    // Tijdzone en tijd zelf zetten kan een gewone app niet (SET_TIME_ZONE / SET_TIME zijn systeemrechten);
    // als apparaateigenaar wel (DevicePolicyManager.setTimeZone/setTime, Android 9+). Anders: Android-datuminstellingen openen.
    fun timeJson(): String {
        val policy = activity.getSystemService(DevicePolicyManager::class.java)
        val isOwner = policy?.isDeviceOwnerApp(activity.packageName) == true
        return JSONObject()
            .put("now", System.currentTimeMillis())
            .put("zone", java.util.TimeZone.getDefault().id)
            .put("autoTime", Settings.Global.getInt(resolver, Settings.Global.AUTO_TIME, 0) == 1)
            .put("autoZone", Settings.Global.getInt(resolver, Settings.Global.AUTO_TIME_ZONE, 0) == 1)
            .put("canWrite", canWrite())
            .put("deviceOwner", isOwner)
            .toString()
    }

    fun setAutoTime(on: Boolean): String {
        if (!canWrite()) return result(false, "no-permission")
        return try {
            Settings.Global.putInt(resolver, Settings.Global.AUTO_TIME, if (on) 1 else 0)
            DiagLog.add("info", "Automatische tijd ${if (on) "aan" else "uit"}")
            result(true)
        } catch (e: Exception) { result(false, e.message) }
    }

    // Tijdzone automatisch (Android gebruikt hiervoor het mobiele netwerk; zonder simkaart blijft de zone staan)
    fun setAutoTimeZone(on: Boolean): String {
        if (!canWrite()) return result(false, "no-permission")
        return try {
            Settings.Global.putInt(resolver, Settings.Global.AUTO_TIME_ZONE, if (on) 1 else 0)
            DiagLog.add("info", "Automatische tijdzone ${if (on) "aan" else "uit"}")
            result(true)
        } catch (e: Exception) { result(false, e.message) }
    }

    fun setTimeZone(id: String): String {
        if (id !in java.util.TimeZone.getAvailableIDs()) return result(false, "unknown-zone")
        // Android weigert een tijdzone zolang "automatische tijdzone" aan staat (die werkt toch niet zonder simkaart)
        if (canWrite()) try { Settings.Global.putInt(resolver, Settings.Global.AUTO_TIME_ZONE, 0) } catch (_: Exception) {}
        val policy = activity.getSystemService(DevicePolicyManager::class.java)
        val admin = ComponentName(activity, PandaAdminReceiver::class.java)
        if (policy?.isDeviceOwnerApp(activity.packageName) == true && android.os.Build.VERSION.SDK_INT >= 28) {
            return try {
                val ok = policy.setTimeZone(admin, id)
                DiagLog.add("info", "Tijdzone $id (apparaateigenaar): $ok")
                result(ok, if (ok) null else "refused")
            } catch (e: Exception) { result(false, e.message) }
        }
        // Zonder apparaateigenaar: proberen (lukt alleen als de radio SET_TIME_ZONE toestaat)
        return try {
            activity.getSystemService(android.app.AlarmManager::class.java).setTimeZone(id)
            DiagLog.add("info", "Tijdzone $id gezet")
            result(true)
        } catch (e: SecurityException) { result(false, "not-allowed") } catch (e: Exception) { result(false, e.message) }
    }

    fun setTime(millis: Long): String {
        val policy = activity.getSystemService(DevicePolicyManager::class.java)
        if (policy?.isDeviceOwnerApp(activity.packageName) != true || android.os.Build.VERSION.SDK_INT < 28) return result(false, "not-allowed")
        if (canWrite()) try { Settings.Global.putInt(resolver, Settings.Global.AUTO_TIME, 0) } catch (_: Exception) {}
        return try {
            val ok = policy.setTime(ComponentName(activity, PandaAdminReceiver::class.java), millis)
            DiagLog.add("info", "Tijd gezet (apparaateigenaar): $ok")
            result(ok, if (ok) null else "refused")
        } catch (e: Exception) { result(false, e.message) }
    }

    // --- Taal van Android (Settings > Display > Taal) ---
    // Vraagt CHANGE_CONFIGURATION: geeft Android niet aan apps, wel eenmalig via de laptop:
    //   adb shell pm grant nl.pandaos.launcher android.permission.CHANGE_CONFIGURATION
    // Daarna via de (verborgen) ActivityManager-dienst, zoals de taalinstelling van Android zelf doet.
    fun languageJson(): String = JSONObject()
        .put("language", java.util.Locale.getDefault().toLanguageTag())
        .put("canChange", activity.checkSelfPermission("android.permission.CHANGE_CONFIGURATION") == PackageManager.PERMISSION_GRANTED)
        .toString()

    fun setLanguage(tag: String): String {
        if (activity.checkSelfPermission("android.permission.CHANGE_CONFIGURATION") != PackageManager.PERMISSION_GRANTED) return result(false, "no-permission")
        return try {
            val am = Class.forName("android.app.ActivityManager").getMethod("getService").invoke(null)!!
            val config = am.javaClass.getMethod("getConfiguration").invoke(am) as android.content.res.Configuration
            config.setLocales(android.os.LocaleList(java.util.Locale.forLanguageTag(tag)))
            try { config.javaClass.getField("userSetLocale").setBoolean(config, true) } catch (_: Throwable) {}
            am.javaClass.getMethod("updatePersistentConfiguration", android.content.res.Configuration::class.java).invoke(am, config)
            DiagLog.add("info", "Taal Android: $tag")
            result(true)
        } catch (e: Throwable) {
            val cause = (e as? java.lang.reflect.InvocationTargetException)?.targetException ?: e
            DiagLog.add("error", "Taal zetten mislukt: ${cause.javaClass.simpleName} ${cause.message}")
            result(false, "${cause.javaClass.simpleName}: ${cause.message}")
        }
    }

    // Alles terug zoals de radio het had
    fun reset(): String {
        if (!canWrite()) return result(false, "no-permission")
        val errors = listOf(
            JSONObject(setSystemBarHidden(false)),
            JSONObject(setVolumeBarHidden(false)),
            if (panelLockTable() != null) JSONObject(setPanelLocked(false)) else JSONObject().put("ok", true),
        ).filter { !it.getBoolean("ok") }.map { it.optString("error") }
        return result(errors.isEmpty(), errors.joinToString().ifEmpty { null })
    }
}
