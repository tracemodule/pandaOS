package nl.pandaos.launcher

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.window.OnBackInvokedDispatcher
import androidx.webkit.WebViewAssetLoader
import java.io.IOException

// PandaOS als startscherm: één WebView met de PandaOS-webapp, volledig scherm.
// De webapp staat in assets/web (uit client/dist) en wordt geserveerd als https://appassets.androidplatform.net/,
// zodat absolute paden als /app-icons/... en localStorage gewoon werken.
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var media: MediaWatcher
    private lateinit var radio: RadioConnectivity // wifi en Bluetooth voor de eigen Settings-schermen
    private lateinit var can: CanMonitor // CAN-monitor (app in PandaOS)
    lateinit var links: CanLinks // CAN-koppelingen: regel/broadcast van de radio -> functie in PandaOS
    private lateinit var updates: UpdateInstaller // software-updates uit GitHub Releases
    lateinit var signals: CarSignals // achteruit en volume van de radio zelf
    lateinit var overlay: PandaOverlay // menu en volumecontainer van PandaOS boven andere apps
    private var pendingCameraRequest: PermissionRequest? = null // wacht op de Android-cameratoestemming

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        DiagLog.init(this) // diagnose: crashes en gebeurtenissen van de launcher
        logStartReason(savedInstanceState != null)
        if (webViewTooOld()) return // uitleg op het scherm in plaats van een zwart scherm
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // Android 11+: PandaOS altijd over het hele scherm, ook als de systeembalken verschijnen (bijv. als een app half
        // naast PandaOS de focus heeft). De balken liggen dan doorzichtig over PandaOS heen; PandaOS krimpt niet en
        // de dock blijft onderaan. (Op de radio, Android 9, verandert hier niets.)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            @Suppress("DEPRECATION")
            window.statusBarColor = android.graphics.Color.TRANSPARENT
            @Suppress("DEPRECATION")
            window.navigationBarColor = android.graphics.Color.TRANSPARENT
            window.attributes = window.attributes.also {
                it.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            }
        }
        // chrome://inspect en tools/pandaos.mjs op de laptop: debug-build of Ontwikkelaarsmodus (Instellingen > Software)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG || developerMode(this))

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebAppPathHandler())
            .build()

        media = MediaWatcher(this) { call -> callWeb(call) }
        // Muziek van andere apps en de telefoon volgen vraagt de meldingen-toegang; met WRITE_SECURE_SETTINGS zet
        // PandaOS die zelf aan (anders via Instellingen > Rechten)
        if (!media.hasAccess() && checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) == PackageManager.PERMISSION_GRANTED)
            PermissionsCenter(this).enableNotificationAccess()
        radio = RadioConnectivity(this) { call -> callWeb(call) }.also { it.start() }
        links = CanLinks(this) { call -> callWeb(call) }
        can = CanMonitor(this) { source, text -> links.check(source, text) }
        applyCanLinks()
        updates = UpdateInstaller(this) { call -> callWeb(call) }
        signals = CarSignals(this) { call -> callWeb(call) }.also { it.start() }
        // Radio FM/AM/DAB van de radio (Jancar): zender en RDS naar de Radio-app als DOM-event 'pandaos-radio'
        JancarRadio.start(this) { js -> runOnUiThread { if (::webView.isInitialized) webView.evaluateJavascript(js, null) } }
        voice = VoiceInput(this,
            onPartial = { callWeb("voiceInput(${org.json.JSONObject().put("state", "partial").put("text", it)})") },
            onFinal = { callWeb("voiceInput(${org.json.JSONObject().put("state", "final").put("text", it)})") },
            onState = { state, error -> callWeb("voiceInput(${org.json.JSONObject().put("state", state).put("error", error ?: "")})") },
        )
        if (intent?.getBooleanExtra(EXTRA_REQUEST_MIC, false) == true) requestMicrophone()
        // Nieuwe of verdwenen melding: het PandaOS-paneel werkt zijn lijst bij
        MediaListenerService.onChange = { runOnUiThread { callWeb("notificationsChanged()") } }

        val pandaBridge = PandaBridge(this, media, radio, can, updates)
        val startUrl = BuildConfig.DEV_URL.ifEmpty { "https://${WebViewAssetLoader.DEFAULT_DOMAIN}/index.html" }
        overlay = PandaOverlay(this, assetLoader, pandaBridge, startUrl)
        webView = WebView(this).apply {
            setBackgroundColor(0xFF000000.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // localStorage: instellingen en app-koppelingen
            settings.mediaPlaybackRequiresUserGesture = false // piep van de snelheidswaarschuwing
            settings.setGeolocationEnabled(true)
            addJavascriptInterface(pandaBridge, "PandaAndroid")

            webViewClient = object : WebViewClient() {
                // Webapp vastgelopen of afgesloten door Android: vastleggen en opnieuw laden
                override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                    DiagLog.add("error", "Webapp gestopt (" + (if (detail.didCrash()) "crash" else "geheugen") + "), opnieuw geladen")
                    recreate()
                    return true
                }

                override fun onPageFinished(view: WebView, url: String) {
                    media.resend() // de webapp is (opnieuw) geladen: laten zien wat er speelt
                    // Stand van vóór de start (licht, deuren ...) uit het logboek overnemen; even wachten tot de webapp luistert
                    if (!url.contains("#overlay")) view.postDelayed({ links.replayLastState() }, 3000)
                }

                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assetLoader.shouldInterceptRequest(request.url)

                // Alleen bij de dev-server (eigen certificaat van Vite) en alleen in een debug-build
                @SuppressLint("WebViewClientOnReceivedSslError")
                override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                    if (BuildConfig.DEBUG && BuildConfig.DEV_URL.isNotEmpty() && error.url.startsWith(BuildConfig.DEV_URL)) {
                        handler.proceed()
                    } else {
                        handler.cancel()
                    }
                }
            }
            webChromeClient = object : WebChromeClient() {
                // Camerabeeld voor de achteruitrijcamera (getUserMedia). Eerst de Android-toestemming, dan doorgeven.
                override fun onPermissionRequest(request: PermissionRequest) {
                    runOnUiThread {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE !in request.resources) {
                            request.deny()
                        } else if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                            request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                        } else {
                            pendingCameraRequest = request
                            requestPermissions(arrayOf(Manifest.permission.CAMERA), REQUEST_CAMERA)
                        }
                    }
                }

                // GPS voor de webapp (navigator.geolocation); de Android-toestemming wordt bij het starten gevraagd
                override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                    callback.invoke(origin, hasLocationPermission(), false)
                }
            }
        }
        setContentView(webView)
        hideSystemBars()
        watchSystemBars()
        keepAsHomeScreen()
        disableBack()

        if (!hasLocationPermission()) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), REQUEST_LOCATION)
        }

        webView.loadUrl(startUrl)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_MIC) {
            val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
            DiagLog.add("info", "Microfoon voor spraakinvoer: ${if (granted) "toegestaan" else "geweigerd"}")
            callWeb("voiceInput(${org.json.JSONObject().put("state", if (granted) "ready" else "error").put("error", if (granted) "" else "permission")})")
            return
        }
        // Rechten-pagina en Telefoon/Agenda/Berichten: opnieuw inlezen
        if (requestCode == PermissionsCenter.REQUEST_CODE) { callWeb("permissionsChanged()"); return }
        if (requestCode == REQUEST_CAMERA) {
            val request = pendingCameraRequest ?: return
            pendingCameraRequest = null
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
                request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
            } else {
                request.deny()
            }
            return
        }
        // Opnieuw laden, zodat de webapp de GPS-toestemming meteen krijgt
        if (requestCode == REQUEST_LOCATION && hasLocationPermission()) webView.reload()
    }

    // VOL+/VOL- regelen het PandaOS-volume (stap 1, popup 3 seconden) in plaats van het Android-volume.
    // Ingedrukt houden herhaalt de stap.
    // Kent PandaOS het meestervolume van de radio (0-40, uit het logboek), dan laten we de knop gewoon door naar de
    // radio, net als in CarPlay en andere apps; PandaOS toont daarna het nieuwe meestervolume.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val delta = when (event.keyCode) {
            KeyEvent.KEYCODE_VOLUME_UP -> 1
            KeyEvent.KEYCODE_VOLUME_DOWN -> -1
            else -> return super.dispatchKeyEvent(event)
        }
        if (::signals.isInitialized && signals.masterVolume >= 0) {
            if (event.action == KeyEvent.ACTION_DOWN) callWeb("volumeKey()")
            return super.dispatchKeyEvent(event)
        }
        if (event.action == KeyEvent.ACTION_DOWN) callWeb("stepVolume($delta)")
        return true
    }

    // Ook na terugkomen uit het toegangsscherm: dan begint het volgen van media meteen
    override fun onResume() {
        super.onResume()
        resumed = true
        if (!::media.isInitialized) { if (!webViewTooOld()) recreate(); return } // WebView inmiddels bijgewerkt
        media.start()
        overlay.stop() // PandaOS vooraan: eigen menu en volume
        RadioSystem(this).reapply() // systeembalk van de radio weer verbergen als de radio hem heeft teruggezet
        signals.keepMediaVolumeFull()
    }

    override fun onDestroy() {
        if (::overlay.isInitialized) overlay.stop() // geen achtergebleven overlay als Android PandaOS opnieuw opbouwt
        if (!::media.isInitialized) { super.onDestroy(); return }
        media.stop()
        radio.stop()
        can.stop()
        signals.stop()
        MediaListenerService.onChange = null
        super.onDestroy()
    }

    // Waarom start PandaOS (opnieuw)? Zo weten we na een rit of Android PandaOS heeft opgeruimd (geheugen), of het
    // scherm opnieuw is opgebouwd. Alleen vastleggen, verder verandert er niets (6-11-2026).
    private fun logStartReason(recreated: Boolean) {
        val prefs = getSharedPreferences(LIFE_PREFS, MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val lastStop = prefs.getLong("lastStop", 0L)
        val away = if (lastStop > 0) " na ${(now - lastStop) / 1000} s in de achtergrond" else ""
        val lastTrim = prefs.getInt("lastTrim", 0)
        val reason = when {
            recreated -> "Android bouwde het PandaOS-scherm opnieuw op$away"
            activityCreatedBefore -> "PandaOS-scherm opnieuw gestart in hetzelfde proces$away"
            lastStop > 0 && prefs.getBoolean("inBackground", false) ->
                "Nieuw proces: Android had PandaOS opgeruimd$away" + (if (lastTrim > 0) " (laatste geheugenwaarschuwing: $lastTrim)" else "")
            else -> "Nieuw proces (opstarten van de radio of na een update)"
        }
        DiagLog.add("info", "Start: $reason")
        activityCreatedBefore = true
        prefs.edit().putBoolean("inBackground", false).putInt("lastTrim", 0).apply()
    }

    override fun onStop() {
        super.onStop()
        getSharedPreferences(LIFE_PREFS, MODE_PRIVATE).edit()
            .putLong("lastStop", System.currentTimeMillis()).putBoolean("inBackground", true).apply()
    }

    override fun onStart() {
        super.onStart()
        getSharedPreferences(LIFE_PREFS, MODE_PRIVATE).edit().putBoolean("inBackground", false).apply()
    }

    // Geheugenwaarschuwingen van Android (vaak de aanloop naar opruimen); alleen bij een nieuw, hoger niveau
    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        val prefs = getSharedPreferences(LIFE_PREFS, MODE_PRIVATE)
        if (level > prefs.getInt("lastTrim", 0)) {
            prefs.edit().putInt("lastTrim", level).apply()
            DiagLog.add("info", "Geheugenwaarschuwing van Android: niveau $level")
        }
    }

    override fun onPause() {
        super.onPause()
        resumed = false
        // Andere app vooraan: PandaOS-menu (veeg omlaag) en PandaOS-volumecontainer boven die app
        if (::overlay.isInitialized) overlay.start()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemBars() // na terugkeer uit een Android-app weer volledig scherm
            // Camera-app van de radio weer weg: achteruit voorbij (als we achteruit zelf zo afgeleid hadden)
            if (reverseFromOverlay) { reverseFromOverlay = false; signals.setReverse(false, "camera-app van de radio weg") }
            // Op PandaOS getikt terwijl een app half naast PandaOS stond: Android zet die app achter PandaOS
            // (ook als je de app met het kruisje van Android sloot: dan krijgt PandaOS de focus terug)
            if (halfAppOpen) { halfAppOpen = false; halfControls.hide(); callWeb("halfAppClosed()") }
            return
        }
        // Focus kwijt terwijl PandaOS vooraan blijft (geen onPause): er schuift een venster over PandaOS heen.
        // Op de Golf-radio kan dat twee dingen zijn (gezien op 5 november 2026):
        //  1. het meldingenpaneel van de fabrikant, na een veeg vanaf de bovenrand → PandaOS-paneel openen
        //  2. de camera-app van de radio (com.jancar.hd2cam) bij achteruit, zonder aanraking → achteruit tonen
        // Alleen een veeg vanaf de bovenrand telt als paneel; anders opende het paneel bij het inschakelen van R.
        // App half naast PandaOS kreeg de focus: even later is hij getekend, dan het vlak weg en de knoppen erop
        if (halfAppOpen) { window.decorView.postDelayed({ halfControls.reveal() }, 600); return }
        if (SystemClock.uptimeMillis() < ignoreFocusLossUntil || !::signals.isInitialized || halfAppOpen) return
        window.decorView.postDelayed({
            if (!resumed || hasWindowFocus() || halfAppOpen || SystemClock.uptimeMillis() < ignoreFocusLossUntil) return@postDelayed
            val swipedFromTop = SystemClock.uptimeMillis() - lastTouchDownAt < 1500 &&
                lastTouchDownY >= 0 && lastTouchDownY < resources.displayMetrics.density * 60
            when {
                swipedFromTop && pandaPanel -> {
                    collapseSystemPanel()
                    callWeb("openPanel()")
                    DiagLog.add("info", "Paneel van het systeem vervangen door het PandaOS-paneel")
                }
                !swipedFromTop && signals.backcarKnown && !signals.reverseActive -> {
                    // Deze radio stuurt achteruit-broadcasts; een venster dat zonder aanraking over PandaOS komt is
                    // dan vrijwel zeker de achteruitcamera (de broadcast voor het begin kennen we nog niet)
                    reverseFromOverlay = true
                    signals.setReverse(true, "camera-app van de radio verscheen")
                }
                else -> DiagLog.add("info", "Venster over PandaOS zonder veeg van boven (niet als paneel behandeld)")
            }
        }, 400)
    }
    private var reverseFromOverlay = false
    // Android-app half naast PandaOS (PandaBridge.launchAppHalf): focus kwijt is dan die app, niet de camera of het paneel
    @Volatile var halfAppOpen = false
    val halfControls by lazy { HalfAppControls(this) }

    // Knop "sluiten" op de halve app: PandaOS weer vooraan, auto over het hele scherm
    fun closeHalfApp() {
        halfAppOpen = false
        halfControls.hide()
        callWeb("halfAppClosed()")
        startActivity(android.content.Intent(this, MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
    }

    // Knop "volledig scherm" op de halve app (of vanuit de webapp)
    fun fullscreenHalfApp(packageName: String): Boolean {
        val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return false
        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        halfAppOpen = false
        halfControls.hide()
        callWeb("halfAppClosed()")
        // Volgende keer half openen: dan een nieuwe taak (deze taak blijft volledig scherm)
        getSharedPreferences("pandaos_half", MODE_PRIVATE).edit().putString(packageName, "full").apply()
        val bundle = android.app.ActivityOptions.makeBasic().toBundle().apply { putInt("android.activity.windowingMode", 1) }
        try { startActivity(intent, bundle) } catch (_: Exception) { startActivity(intent) }
        return true
    }

    // Koppelingen gewijzigd: broadcasts van koppelingen ontvangen en (met koppelingen) op de achtergrond meelezen
    fun applyCanLinks() {
        can.setExtraActions(links.broadcastActions)
        can.setBackground(!links.isEmpty)
    }

    // Spraakinvoer (webtoetsenbord via PandaBridge)
    lateinit var voice: VoiceInput

    fun requestMicrophone() {
        if (voice.hasPermission()) return
        ignoreFocusLoss(10_000) // toestemmingsvenster is geen meldingenpaneel of camera
        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_MIC)
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        if (intent.getBooleanExtra(EXTRA_REQUEST_MIC, false)) requestMicrophone()
    }

    // Eigen schermen van Android die PandaOS zelf opent zonder pauze (keuzelijst van toetsenborden): niet vervangen
    fun ignoreFocusLoss(millis: Long = 15_000) { ignoreFocusLossUntil = SystemClock.uptimeMillis() + millis }
    private var ignoreFocusLossUntil = 0L
    private var resumed = false

    // Meldingenpaneel dichtdoen. Mag omdat de launcher op targetSdk 28 staat (vanaf targetSdk 31 niet meer).
    @Suppress("DEPRECATION")
    private fun collapseSystemPanel() {
        try { sendBroadcast(android.content.Intent(android.content.Intent.ACTION_CLOSE_SYSTEM_DIALOGS)) } catch (_: Exception) {}
        try {
            val service = getSystemService("statusbar")
            service?.javaClass?.getMethod("collapsePanels")?.invoke(service)
        } catch (_: Exception) { /* niet toegestaan op dit apparaat */ }
    }

    // Roept window.PandaOS aan in de webapp (client/src/services/androidBridge.ts)
    private fun callWeb(call: String) {
        if (!::webView.isInitialized) return // te oude WebView: geen webapp geladen
        webView.evaluateJavascript("window.PandaOS && window.PandaOS.$call", null)
        if (::overlay.isInitialized && OVERLAY_CALLS.any { call.startsWith(it) }) overlay.callWeb(call)
    }

    // PandaOS weer naar voren, eventueel met een tabblad van Instellingen open (vanuit het menu boven een andere app)
    fun bringToFront(settingsTab: String?) {
        halfAppOpen = false
        halfControls.hide()
        overlay.stop()
        startActivity(android.content.Intent(this, MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
        if (settingsTab != null) callWeb("openSettingsTab(${org.json.JSONObject.quote(settingsTab)})")
    }

    private fun hasLocationPermission() =
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    // --- PandaOS-paneel in plaats van de Android-balk ---
    // Met het PandaOS-paneel gekozen tonen we de systeembalken niet tijdelijk (overlay die de volgende veeg
    // afvangt), maar echt (BEHAVIOR_DEFAULT). Dan merken we dat ze verschijnen, verbergen ze meteen weer en openen
    // bij een veeg van bovenaf het PandaOS-paneel. Ingesteld vanuit PandaBridge.setSystemPanelBlocked.
    private var pandaPanel = false
    private var lastTouchDownY = -1f
    private var lastTouchDownAt = 0L

    fun setPandaPanel(enabled: Boolean) {
        pandaPanel = enabled
        hideSystemBars()
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
            lastTouchDownY = event.y
            lastTouchDownAt = SystemClock.uptimeMillis()
        }
        return super.dispatchTouchEvent(event)
    }

    private fun watchSystemBars() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            // Android 9 (radio): geen ruimte vrijhouden voor balken die verschijnen als een app half naast PandaOS
            // de focus heeft; PandaOS blijft over het hele scherm en de dock op zijn plek
            window.decorView.setOnApplyWindowInsetsListener { view, insets ->
                @Suppress("DEPRECATION")
                view.onApplyWindowInsets(insets.consumeSystemWindowInsets())
            }
            return
        }
        window.decorView.setOnApplyWindowInsetsListener { view, insets ->
            if (pandaPanel && insets.isVisible(WindowInsets.Type.statusBars())) {
                hideSystemBars()
                // Alleen bij een veeg van bovenaf (niet van onderaf, dan wil je naar het startscherm/de taakbalk)
                val recent = SystemClock.uptimeMillis() - lastTouchDownAt < 1500
                if (recent && lastTouchDownY < resources.displayMetrics.density * 48) callWeb("openPanel()")
            }
            // Geen ruimte vrijhouden voor de balken: PandaOS vult altijd het hele scherm (de balken liggen er doorzichtig
            // overheen als een app half naast PandaOS de focus heeft), zodat de dock niet verschuift
            view.onApplyWindowInsets(WindowInsets.CONSUMED)
        }
    }

    private fun hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = if (pandaPanel) WindowInsetsController.BEHAVIOR_DEFAULT
                    else WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                or android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                // Indeling altijd over het hele scherm, ook als de balken verschijnen (app half naast PandaOS):
                // PandaOS krimpt dan niet en de dock blijft onderaan
                or android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
        }
    }

    // Als apparaateigenaar: PandaOS blijft altijd het startscherm, ook na een update (Android vergeet de keuze
    // anders bij het vervangen van de app en neemt dan het eigen startscherm)
    private fun keepAsHomeScreen() {
        val policy = getSystemService(android.app.admin.DevicePolicyManager::class.java) ?: return
        if (!policy.isDeviceOwnerApp(packageName)) return
        // Zelf een ander startscherm gekozen (Settings > Apps > Startscherm): PandaOS niet terugzetten
        if (getSharedPreferences("pandaos_home", MODE_PRIVATE).getString("home", packageName) != packageName) return
        try {
            val filter = android.content.IntentFilter(android.content.Intent.ACTION_MAIN).apply {
                addCategory(android.content.Intent.CATEGORY_HOME)
                addCategory(android.content.Intent.CATEGORY_DEFAULT)
            }
            policy.addPersistentPreferredActivity(
                android.content.ComponentName(this, PandaAdminReceiver::class.java), filter,
                android.content.ComponentName(this, MainActivity::class.java),
            )
        } catch (_: Exception) { /* niet toegestaan: de gewone startscherm-keuze blijft gelden */ }
    }

    // --- Te oude WebView ---
    // De webapp is gebouwd voor Chrome/WebView $MIN_WEBVIEW of nieuwer (standaarddoel van Vite). Op de Golf-radio stond
    // eerst WebView 66 (2018): dan bleef het scherm zwart. Nu tonen we wat er aan de hand is en hoe je het oplost.
    private fun webViewTooOld(): Boolean {
        val version = WebView.getCurrentWebViewPackage()?.versionName
        val major = version?.substringBefore('.')?.toIntOrNull()
        if (major == null || major >= MIN_WEBVIEW) return false
        DiagLog.add("error", "WebView $version is te oud (minimaal $MIN_WEBVIEW)")
        val density = resources.displayMetrics.density
        fun button(text: String, onClick: () -> Unit) = android.widget.Button(this).apply {
            this.text = text
            isAllCaps = false
            textSize = 18f
            setOnClickListener { onClick() }
        }
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setBackgroundColor(0xFF000000.toInt())
            val pad = (32 * density).toInt()
            setPadding(pad, pad, pad, pad)
            addView(android.widget.TextView(this@MainActivity).apply {
                text = "PandaOS heeft een nieuwere WebView nodig"
                textSize = 26f
                setTextColor(0xFFFFFFFF.toInt())
                gravity = android.view.Gravity.CENTER
            })
            addView(android.widget.TextView(this@MainActivity).apply {
                text = "Op deze radio staat Android System WebView $version. PandaOS werkt vanaf versie $MIN_WEBVIEW.\n" +
                    "Installeer een nieuwe Android System WebView (Play Store of APK) en kies hem eventueel bij " +
                    "Ontwikkelaarsopties → WebView-implementatie. Daarna start PandaOS vanzelf."
                textSize = 18f
                setTextColor(0xFFBBBBBB.toInt())
                gravity = android.view.Gravity.CENTER
                setPadding(0, (16 * density).toInt(), 0, (24 * density).toInt())
            })
            addView(button("WebView bijwerken (Play Store)") {
                val market = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("market://details?id=com.google.android.webview"))
                try { startActivity(market) } catch (_: Exception) {
                    startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW,
                        android.net.Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.webview")))
                }
            })
            addView(button("Ontwikkelaarsopties openen") {
                try { startActivity(android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)) }
                catch (_: Exception) { startActivity(android.content.Intent(android.provider.Settings.ACTION_SETTINGS)) }
            })
            addView(button("Opnieuw proberen") { recreate() })
        }
        setContentView(layout)
        return true
    }

    // Een startscherm sluit je niet met de terugknop
    private fun disableBack() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { }
        }
    }

    @Deprecated("Alleen voor Android 12 en ouder")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        // niets: PandaOS blijft open
    }

    // Serveert assets/web. Onbekende paden zonder bestandsextensie krijgen index.html (zoals een webserver).
    private inner class WebAppPathHandler : WebViewAssetLoader.PathHandler {
        override fun handle(path: String): WebResourceResponse? {
            val file = path.ifEmpty { "index.html" }
            return try {
                WebResourceResponse(mimeType(file), null, assets.open("web/$file"))
            } catch (_: IOException) {
                if (!file.substringAfterLast('/').contains('.')) {
                    WebResourceResponse("text/html", "utf-8", assets.open("web/index.html"))
                } else null
            }
        }
    }

    companion object {
        const val DEV_PREFS = "pandaos-developer"
        const val LIFE_PREFS = "pandaos-lifecycle"
        @Volatile private var activityCreatedBefore = false
        fun developerMode(context: android.content.Context): Boolean =
            context.getSharedPreferences(DEV_PREFS, android.content.Context.MODE_PRIVATE).getBoolean("developer", false)
        private const val REQUEST_LOCATION = 1
        private const val REQUEST_CAMERA = 2
        private const val REQUEST_MIC = 3
        const val EXTRA_REQUEST_MIC = "requestMicrophone" // vanuit het Android-toetsenbord
        // Wat de overlay ook moet weten: volume en meldingen
        private val OVERLAY_CALLS = listOf("radioVolume(", "systemVolume(", "volumeKey(", "notificationsChanged(")
        const val MIN_WEBVIEW = 100 // bouwdoel van de webapp (build.target chrome100 in client/vite.config.ts)

        // Module-scripts weigert de WebView zonder het juiste type
        private fun mimeType(file: String) = when (file.substringAfterLast('.').lowercase()) {
            "html" -> "text/html"
            "js", "mjs" -> "text/javascript"
            "css" -> "text/css"
            "json" -> "application/json"
            "svg" -> "image/svg+xml"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "webp" -> "image/webp"
            "glb" -> "model/gltf-binary"
            "gltf" -> "model/gltf+json"
            "bin" -> "application/octet-stream"
            "wasm" -> "application/wasm"
            "mp3" -> "audio/mpeg"
            "wav" -> "audio/wav"
            "woff2" -> "font/woff2"
            "woff" -> "font/woff"
            "ttf" -> "font/ttf"
            else -> "application/octet-stream"
        }
    }
}
