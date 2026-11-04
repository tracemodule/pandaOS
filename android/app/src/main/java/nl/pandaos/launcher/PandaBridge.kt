package nl.pandaos.launcher

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.bluetooth.BluetoothAdapter
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.provider.Settings
import android.util.Base64
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

// window.PandaAndroid in de webapp. De namen moeten gelijk blijven aan wat de webkant aanroept
// (client/src/store/appLinks.ts en de Wi-Fi-tab in SettingsApp.tsx).
// Let op: @JavascriptInterface-methodes draaien niet op de UI-thread; activiteiten starten gaat via runOnUiThread.
class PandaBridge(
    private val activity: Activity,
    private val media: MediaWatcher,
    private val radio: RadioConnectivity,
    private val can: CanMonitor,
    private val updates: UpdateInstaller,
) {

    // --- Diagnose (Settings > Software > Diagnose, "Probleem melden"): zie DiagLog ---

    // {"device":{..radio en toestemmingen..},"entries":[..gebeurtenissen en fouten van de launcher..]}
    @JavascriptInterface
    fun getNativeDiagnostics(): String =
        JSONObject().put("device", JSONObject(DiagLog.deviceJson(activity))).put("entries", JSONArray(DiagLog.entriesJson())).toString()

    // Rapport opslaan en delen via Android (WhatsApp, Gmail ...); geeft het pad terug
    @JavascriptInterface
    fun shareDiagnosticReport(text: String): String = DiagLog.share(activity, text)

    @JavascriptInterface
    fun clearNativeDiagnostics() = DiagLog.clear()

    // --- Software-updates (Settings > Software): zie UpdateInstaller ---

    // {"version":"1.1.0","code":10100}
    @JavascriptInterface
    fun getAppVersion(): String = updates.versionJson()

    // APK downloaden en installeren; voortgang via window.PandaOS.updateStatus
    @JavascriptInterface
    fun installUpdate(url: String) = updates.install(url)

    // Laatste installatiefout (leeg = geen)
    @JavascriptInterface
    fun getUpdateError(): String = updates.takeLastError()


    // --- CAN-monitor (Settings > Voertuig > CAN-bus) ---

    // onlyCan = alleen regels die op de auto/het CAN-kastje lijken; false = het hele logboek
    @JavascriptInterface
    fun canMonitorStart(onlyCan: Boolean) = activity.runOnUiThread { can.start(onlyCan); can.setOnlyCan(onlyCan) }

    @JavascriptInterface
    fun canMonitorStop() = activity.runOnUiThread { can.stop() }

    @JavascriptInterface
    fun getCanMonitor(): String = can.state()

    @JavascriptInterface
    fun canMonitorClear() = can.clear()

    // ---------------- CAN-koppelen en Verbinding (CAN-monitor) ----------------

    @JavascriptInterface
    fun canLinksGet(): String = (activity as? MainActivity)?.links?.json() ?: "[]"

    @JavascriptInterface
    fun canLinksSave(json: String): Boolean {
        val main = activity as? MainActivity ?: return false
        val ok = main.links.save(json)
        if (ok) activity.runOnUiThread { main.applyCanLinks() }
        return ok
    }

    // Leren: begin (handeling doen) en uitslag (regels die er nieuw bijkwamen)
    @JavascriptInterface
    fun canLearnStart() = can.learnStart()

    @JavascriptInterface
    fun canLearnResult(): String = can.learnResult()

    @JavascriptInterface
    fun canConnectionInfo(): String = can.connectionInfo()

    // Geeft het pad van het opgeslagen bestand terug
    @JavascriptInterface
    fun canMonitorSave(): String = can.save()

    // --- Media van andere apps (Spotify, YouTube ...) ---

    // Mag PandaOS zien wat er speelt? (meldingen-toegang, zie MediaListenerService)
    @JavascriptInterface
    fun hasMediaAccess(): Boolean = media.hasAccess()

    // Opent het Android-scherm waar je PandaOS meldingen-toegang geeft
    @JavascriptInterface
    fun openMediaAccessSettings() {
        activity.runOnUiThread {
            activity.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    // play, pause, next, prev
    @JavascriptInterface
    fun mediaCommand(cmd: String) {
        activity.runOnUiThread { media.command(cmd) }
    }

    // --- Bluetooth en wifi (Settings > Bluetooth / Wi-Fi): eigen PandaOS-schermen, zie RadioConnectivity ---
    // Een telefoon als muziek-/belbron verbinden lukt alleen als de radio dat toestaat; anders doet de
    // Bluetooth-app van de radio dat (te koppelen in Settings > Apps).

    // targetSdk 28: de oude Bluetooth-toestemmingen gelden, die zijn al bij installatie gegeven
    @JavascriptInterface
    fun hasBluetoothPermission(): Boolean = true

    @JavascriptInterface
    fun requestBluetoothPermission() {}

    @JavascriptInterface
    fun getBluetoothState(): String = radio.bluetoothState()

    @JavascriptInterface
    fun setBluetoothEnabled(on: Boolean): Boolean = radio.setBluetoothEnabled(on)

    @JavascriptInterface
    fun startBluetoothScan(): Boolean = radio.startDiscovery()

    @JavascriptInterface
    fun pairBluetooth(address: String): Boolean = radio.pair(address)

    @JavascriptInterface
    fun forgetBluetooth(address: String): Boolean = radio.unpair(address)

    // true = gelukt; false = de radio staat dit apps niet toe
    @JavascriptInterface
    fun connectBluetooth(address: String, connect: Boolean): Boolean = radio.connect(address, connect)

    // Zichtbaar maken voor je telefoon: Android vraagt zelf om bevestiging
    @JavascriptInterface
    fun makeBluetoothDiscoverable() {
        activity.runOnUiThread {
            activity.startActivity(Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE)
                .putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, 120).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    @JavascriptInterface
    fun openBluetoothSettings() {
        activity.runOnUiThread {
            activity.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    @JavascriptInterface
    fun getWifiState(): String = radio.wifiState()

    @JavascriptInterface
    fun setWifiEnabled(on: Boolean): Boolean = radio.setWifiEnabled(on)

    @JavascriptInterface
    fun startWifiScan(): Boolean = radio.startWifiScan()

    // Wachtwoord leeg = opgeslagen of open netwerk
    @JavascriptInterface
    fun connectWifi(ssid: String, password: String): Boolean = radio.connectWifi(ssid, password)

    @JavascriptInterface
    fun forgetWifi(ssid: String): Boolean = radio.forgetWifi(ssid)

    // --- PandaOS-toetsenbord in Android-apps (PandaKeyboardService) ---

    private val keyboardId get() = ComponentName(activity, PandaKeyboardService::class.java).flattenToShortString()

    // Licht/donker van PandaOS, zodat het toetsenbord in Android-apps dezelfde kleuren heeft
    @JavascriptInterface
    fun setUiTheme(dark: Boolean) = PandaKeyboardService.setDark(activity, dark)

    // Spraakinvoer voor het webtoetsenbord. Zonder microfoontoestemming eerst het Android-venster; daarna
    // komt voiceInput({state:'ready'}) en tikt de gebruiker opnieuw op de microfoon.
    @JavascriptInterface
    fun startVoiceInput(language: String): String {
        val main = activity as? MainActivity ?: return "unavailable"
        PandaKeyboardService.setLanguage(activity, language)
        if (!main.voice.hasPermission()) { activity.runOnUiThread { main.requestMicrophone() }; return "permission" }
        if (!main.voice.isAvailable()) return "unavailable"
        main.voice.start(language)
        return "ok"
    }

    @JavascriptInterface
    fun stopVoiceInput() { (activity as? MainActivity)?.voice?.stop() }

    // "enabled" = aangezet in Android; "default" = het toetsenbord dat nu verschijnt
    @JavascriptInterface
    fun getKeyboardState(): String {
        val enabled = Settings.Secure.getString(activity.contentResolver, Settings.Secure.ENABLED_INPUT_METHODS).orEmpty()
        val current = Settings.Secure.getString(activity.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD).orEmpty()
        val full = ComponentName(activity, PandaKeyboardService::class.java).flattenToString()
        return JSONObject()
            .put("enabled", enabled.split(':').any { it == keyboardId || it == full })
            .put("default", current == keyboardId || current == full)
            .toString()
    }

    // PandaOS-toetsenbord standaard maken. Als apparaateigenaar meteen; anders het Android-scherm openen
    // (aanzetten) en daarna de keuzelijst van Android (kiezen).
    @JavascriptInterface
    fun usePandaKeyboard(): Boolean {
        if (isDeviceOwner()) {
            try {
                policy!!.setPermittedInputMethods(admin, null) // alle toetsenborden toegestaan
                policy!!.setSecureSetting(admin, Settings.Secure.DEFAULT_INPUT_METHOD, keyboardId)
                if (JSONObject(getKeyboardState()).getBoolean("default")) return true
            } catch (_: Exception) { /* niet toegestaan op deze Android-versie: via de schermen hieronder */ }
        }
        val enabled = JSONObject(getKeyboardState()).getBoolean("enabled")
        activity.runOnUiThread {
            if (!enabled) {
                activity.startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } else {
                (activity as? MainActivity)?.ignoreFocusLoss() // keuzelijst is geen meldingenpaneel
                activity.getSystemService(InputMethodManager::class.java)?.showInputMethodPicker()
            }
        }
        return false
    }

    // --- PandaOS-paneel (veeg omlaag): Android-paneel blokkeren en meldingen ---

    private val admin get() = ComponentName(activity, PandaAdminReceiver::class.java)
    private val policy get() = activity.getSystemService(DevicePolicyManager::class.java)

    // Is PandaOS apparaateigenaar? Alleen dan kan het Android-paneel uit (zie PandaAdminReceiver)
    @JavascriptInterface
    fun isDeviceOwner(): Boolean = policy?.isDeviceOwnerApp(activity.packageName) == true

    // true = Android-paneel uit (alleen het PandaOS-paneel); false = Android-paneel weer aan
    @JavascriptInterface
    fun setSystemPanelBlocked(blocked: Boolean): Boolean {
        // Ook zonder apparaateigenaar: de Android-balk na een veeg van bovenaf meteen vervangen door het PandaOS-paneel
        activity.runOnUiThread { (activity as? MainActivity)?.setPandaPanel(blocked) }
        if (!isDeviceOwner()) return false
        return try { policy!!.setStatusBarDisabled(admin, blocked) } catch (_: Exception) { false }
    }

    // Apparaateigenaar opheffen (eerst het Android-paneel weer aan)
    @JavascriptInterface
    fun clearDeviceOwner(): Boolean {
        if (!isDeviceOwner()) return false
        return try {
            policy!!.setStatusBarDisabled(admin, false)
            // Vaste startscherm-keuze van PandaOS weg, anders blijft PandaOS ook na het opheffen geforceerd
            try { policy!!.clearPackagePersistentPreferredActivities(admin, activity.packageName) } catch (_: Exception) {}
            DiagLog.add("info", "Apparaateigenaar opgeheven")
            policy!!.clearDeviceOwnerApp(activity.packageName)
            true
        } catch (_: Exception) { false }
    }

    @JavascriptInterface
    fun getNotifications(): String = MediaListenerService.notificationsJson()

    @JavascriptInterface
    fun openNotification(key: String): Boolean = MediaListenerService.open(key)

    @JavascriptInterface
    fun dismissNotification(key: String) = MediaListenerService.dismiss(key)

    @JavascriptInterface
    fun dismissAllNotifications() = MediaListenerService.dismissAll()

    // --- Schermhelderheid (Settings > Display) ---

    // Mag PandaOS de helderheid van het hele scherm regelen (ook in Spotify, Maps ...)? Anders alleen binnen PandaOS.
    @JavascriptInterface
    fun canSetSystemBrightness(): Boolean = Settings.System.canWrite(activity)

    // Opent het Android-scherm "Systeeminstellingen aanpassen" voor PandaOS
    @JavascriptInterface
    fun openBrightnessPermission() {
        activity.runOnUiThread {
            activity.startActivity(
                Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:${activity.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }

    // Helderheid 10-100 %: met toestemming systeembreed (achtergrondverlichting), anders alleen dit venster
    @JavascriptInterface
    fun setBrightness(percent: Int) {
        val fraction = percent.coerceIn(1, 100) / 100f
        activity.runOnUiThread {
            val attrs = activity.window.attributes
            if (Settings.System.canWrite(activity)) {
                val resolver = activity.contentResolver
                Settings.System.putInt(resolver, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
                Settings.System.putInt(resolver, Settings.System.SCREEN_BRIGHTNESS, (fraction * 255).toInt().coerceAtLeast(3))
                attrs.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
            } else {
                attrs.screenBrightness = fraction
            }
            activity.window.attributes = attrs
        }
    }

    // --- Apps ---

    // JSON-lijst met pakketnamen van alle startbare apps, bijv. ["com.spotify.music","com.waze"]
    @JavascriptInterface
    fun getInstalledApps(): String {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val packages = activity.packageManager.queryIntentActivities(intent, 0)
            .map { it.activityInfo.packageName }
            .filter { it != activity.packageName }
            .distinct()
            .sorted()
        return JSONArray(packages).toString()
    }

    // Zelfde lijst met naam erbij, voor het app-menu en "Andere app" in Settings > Apps:
    // [{"package":"com.spotify.music","name":"Spotify"}, ...], gesorteerd op naam
    @JavascriptInterface
    fun getInstalledAppList(): String {
        val pm = activity.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val apps = pm.queryIntentActivities(intent, 0)
            .filter { it.activityInfo.packageName != activity.packageName }
            .distinctBy { it.activityInfo.packageName }
            .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
            .sortedBy { it.second.lowercase() }
        val list = JSONArray()
        apps.forEach { (pkg, name) -> list.put(JSONObject().put("package", pkg).put("name", name)) }
        return list.toString()
    }

    // Pictogram van een app als data-URL (PNG, 96 x 96); leeg als de app niet bestaat
    @JavascriptInterface
    fun getAppIcon(packageName: String): String {
        return try {
            val drawable = activity.packageManager.getApplicationIcon(packageName)
            val size = 96
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            drawable.setBounds(0, 0, size, size)
            drawable.draw(canvas)
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        } catch (_: PackageManager.NameNotFoundException) {
            ""
        }
    }

    // Opent de Play Store bij een app (om hem te installeren); zonder Play Store de webpagina
    @JavascriptInterface
    fun openPlayStore(packageName: String) {
        activity.runOnUiThread {
            val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                activity.startActivity(market)
            } catch (_: ActivityNotFoundException) {
                activity.startActivity(
                    Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$packageName&hl=nl"))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            }
        }
    }

    // Start een Android-app volledig scherm. false = niet geïnstalleerd (de webkant opent dan de PandaOS-versie)
    @JavascriptInterface
    fun launchApp(packageName: String): Boolean {
        val intent = activity.packageManager.getLaunchIntentForPackage(packageName) ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        activity.runOnUiThread { activity.startActivity(intent) }
        return true
    }

    // Een webpagina kan zelf geen wifi-netwerken zien; daarom de wifi-instellingen van Android openen
    @JavascriptInterface
    fun openWifiSettings() {
        activity.runOnUiThread {
            activity.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
    // ---------------- Ontwikkelaarsopties en WebView (Settings > Software, app Ontwikkelaarsopties) ----------------

    @JavascriptInterface
    fun openDeveloperSettings() {
        activity.runOnUiThread {
            try {
                activity.startActivity(Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Exception) {
                activity.startActivity(Intent(Settings.ACTION_DEVICE_INFO_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }
    }

    // {"package":"com.google.android.webview","version":"138.0.7204.181","major":138,"minimum":111}
    @JavascriptInterface
    fun getWebViewInfo(): String {
        val info = android.webkit.WebView.getCurrentWebViewPackage()
        return JSONObject()
            .put("package", info?.packageName ?: "")
            .put("version", info?.versionName ?: "")
            .put("major", info?.versionName?.substringBefore('.')?.toIntOrNull() ?: 0)
            .put("minimum", MainActivity.MIN_WEBVIEW)
            .toString()
    }

    // WebView bijwerken: de Play Store-pagina van de gebruikte WebView (Google of Chrome), anders de webpagina
    @JavascriptInterface
    fun openWebViewUpdate() {
        val pkg = android.webkit.WebView.getCurrentWebViewPackage()?.packageName?.takeIf { it.isNotEmpty() } ?: "com.google.android.webview"
        activity.runOnUiThread {
            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: ActivityNotFoundException) {
                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }
    }

    // ---------------- Optimalisatie (PandaOS-paneel) ----------------

    // Geheugen: {"totalMb":6400,"availableMb":3100}
    @JavascriptInterface
    fun getMemoryInfo(): String {
        val am = activity.getSystemService(android.app.ActivityManager::class.java)
        val mem = android.app.ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        return JSONObject().put("totalMb", mem.totalMem / 1_048_576).put("availableMb", mem.availMem / 1_048_576).toString()
    }

    // Apps op de achtergrond sluiten (zoals 'Alles sluiten' bij recente apps). Nooit PandaOS zelf, het toetsenbord,
    // of apps van de radio die de auto/Bluetooth/CarPlay regelen. Spelende muziek (voorgronddienst) blijft door Android
    // zelf beschermd. Geeft {"closed":12,"freedMb":420} terug.
    @JavascriptInterface
    fun closeBackgroundApps(): String {
        val am = activity.getSystemService(android.app.ActivityManager::class.java)
        val before = android.app.ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }.availMem
        val keep = Regex("can|mcu|carinfo|canbus|syu|microntek|bluetooth|\\.bt|carplay|zlink|autokit|carlink|inputmethod|launcher|systemui|android\\.webview|chrome", RegexOption.IGNORE_CASE)
        val currentIme = Settings.Secure.getString(activity.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD).orEmpty().substringBefore('/')
        val launchable = activity.packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
            .map { it.activityInfo.packageName }.toSet()
        var closed = 0
        for (pkg in launchable) {
            if (pkg == activity.packageName || pkg == currentIme || keep.containsMatchIn(pkg)) continue
            try { am.killBackgroundProcesses(pkg); closed++ } catch (_: Exception) {}
        }
        Thread.sleep(300)
        val after = android.app.ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }.availMem
        val freed = ((after - before) / 1_048_576).coerceAtLeast(0)
        DiagLog.add("info", "Optimalisatie: $closed apps gesloten, $freed MB vrij")
        return JSONObject().put("closed", closed).put("freedMb", freed).toString()
    }

    // ---------------- Volume van de radio (Android-mediavolume) ----------------

    @JavascriptInterface
    fun getSystemVolume(): Int = (activity as? MainActivity)?.signals?.volumePercent() ?: -1

    @JavascriptInterface
    fun stepSystemVolume(delta: Int): Int = (activity as? MainActivity)?.signals?.stepVolume(delta) ?: -1

    @JavascriptInterface
    fun setSystemVolume(percent: Int) { (activity as? MainActivity)?.signals?.setVolumePercent(percent) }

    // Achteruit zoals de launcher hem nu ziet (bij het opnieuw laden van de webapp)
    @JavascriptInterface
    fun isReverseActive(): Boolean = (activity as? MainActivity)?.signals?.reverseActive ?: false

    // ---------------- Startscherm (Settings > Apps > Startscherm) ----------------
    // Welk startscherm de Home-knop opent: PandaOS of dat van de radio. Als apparaateigenaar zet PandaOS het meteen
    // vast; anders opent Android zijn eigen keuzescherm (of het radiomenu "Selectie van het startvenster").

    private fun homeIntent() = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)

    // [{"package":"..","activity":"..","name":"..","default":true,"pandaos":false}]
    @JavascriptInterface
    fun getHomeApps(): String {
        val pm = activity.packageManager
        val current = pm.resolveActivity(homeIntent(), PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo
        val array = JSONArray()
        pm.queryIntentActivities(homeIntent(), 0)
            .filter { it.activityInfo.packageName != "com.android.settings" } // terugvalscherm van Android zelf
            .distinctBy { it.activityInfo.packageName }
            .forEach { info ->
                val a = info.activityInfo
                array.put(JSONObject()
                    .put("package", a.packageName).put("activity", a.name)
                    .put("name", info.loadLabel(pm).toString())
                    .put("default", current?.packageName == a.packageName && current.name == a.name)
                    .put("pandaos", a.packageName == activity.packageName))
            }
        return array.toString()
    }

    // Startscherm kiezen. true = meteen ingesteld (apparaateigenaar); false = Android-keuzescherm geopend.
    @JavascriptInterface
    fun setHomeApp(pkg: String): Boolean {
        activity.getSharedPreferences("pandaos_home", android.content.Context.MODE_PRIVATE).edit().putString("home", pkg).apply()
        DiagLog.add("info", "Startscherm gekozen: $pkg")
        if (isDeviceOwner()) {
            try {
                val target = activity.packageManager.queryIntentActivities(homeIntent(), 0).firstOrNull { it.activityInfo.packageName == pkg }?.activityInfo
                    ?: return false
                policy!!.clearPackagePersistentPreferredActivities(admin, activity.packageName)
                val filter = android.content.IntentFilter(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_HOME); addCategory(Intent.CATEGORY_DEFAULT)
                }
                policy!!.addPersistentPreferredActivity(admin, filter, ComponentName(target.packageName, target.name))
                return true
            } catch (_: Exception) { /* niet toegestaan: via het keuzescherm hieronder */ }
        }
        openHomeSettings()
        return false
    }

    // Android-scherm 'Startscherm-app' (Standaard-apps); anders de gewone instellingen
    @JavascriptInterface
    fun openHomeSettings() {
        activity.runOnUiThread {
            try { activity.startActivity(Intent(Settings.ACTION_HOME_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            catch (_: Exception) {
                try { activity.startActivity(Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                catch (_: Exception) { activity.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            }
        }
    }

    // Een ander startscherm één keer openen (bijv. even naar het scherm van de radio)
    @JavascriptInterface
    fun openHomeApp(pkg: String): Boolean {
        val target = activity.packageManager.queryIntentActivities(homeIntent(), 0).firstOrNull { it.activityInfo.packageName == pkg }?.activityInfo
            ?: return false
        return try {
            activity.startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
                .setComponent(ComponentName(target.packageName, target.name)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (_: Exception) { false }
    }
}
