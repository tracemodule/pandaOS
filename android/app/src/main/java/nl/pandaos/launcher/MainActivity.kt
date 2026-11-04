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
    private lateinit var can: CanMonitor // CAN-monitor in Settings > Voertuig
    private lateinit var updates: UpdateInstaller // software-updates uit GitHub Releases
    private var pendingCameraRequest: PermissionRequest? = null // wacht op de Android-cameratoestemming

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        DiagLog.init(this) // diagnose: crashes en gebeurtenissen van de launcher
        if (webViewTooOld()) return // uitleg op het scherm in plaats van een zwart scherm
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG) // chrome://inspect op de laptop

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebAppPathHandler())
            .build()

        media = MediaWatcher(this) { call -> callWeb(call) }
        radio = RadioConnectivity(this) { call -> callWeb(call) }.also { it.start() }
        can = CanMonitor(this)
        updates = UpdateInstaller(this) { call -> callWeb(call) }
        // Nieuwe of verdwenen melding: het PandaOS-paneel werkt zijn lijst bij
        MediaListenerService.onChange = { runOnUiThread { callWeb("notificationsChanged()") } }

        webView = WebView(this).apply {
            setBackgroundColor(0xFF000000.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // localStorage: instellingen en app-koppelingen
            settings.mediaPlaybackRequiresUserGesture = false // piep van de snelheidswaarschuwing
            settings.setGeolocationEnabled(true)
            addJavascriptInterface(PandaBridge(this@MainActivity, media, radio, can, updates), "PandaAndroid")

            webViewClient = object : WebViewClient() {
                // Webapp vastgelopen of afgesloten door Android: vastleggen en opnieuw laden
                override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                    DiagLog.add("error", "Webapp gestopt (" + (if (detail.didCrash()) "crash" else "geheugen") + "), opnieuw geladen")
                    recreate()
                    return true
                }

                override fun onPageFinished(view: WebView, url: String) {
                    media.resend() // de webapp is (opnieuw) geladen: laten zien wat er speelt
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

        webView.loadUrl(BuildConfig.DEV_URL.ifEmpty { "https://${WebViewAssetLoader.DEFAULT_DOMAIN}/index.html" })
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
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
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val delta = when (event.keyCode) {
            KeyEvent.KEYCODE_VOLUME_UP -> 1
            KeyEvent.KEYCODE_VOLUME_DOWN -> -1
            else -> return super.dispatchKeyEvent(event)
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
    }

    override fun onDestroy() {
        if (!::media.isInitialized) { super.onDestroy(); return }
        media.stop()
        radio.stop()
        can.stop()
        MediaListenerService.onChange = null
        super.onDestroy()
    }

    override fun onPause() {
        super.onPause()
        resumed = false
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) { hideSystemBars(); return } // na terugkeer uit een Android-app weer volledig scherm
        // Focus kwijt terwijl PandaOS vooraan blijft (geen onPause): er schuift iets over PandaOS heen. Op de
        // Golf-radio is dat het meldingenpaneel van de fabrikant, dat niet als Android-statusbalk binnenkomt
        // (watchSystemBars ziet het dan niet). Met het PandaOS-paneel gekozen: dat paneel dichtdoen en het onze openen.
        if (!pandaPanel || SystemClock.uptimeMillis() < ignoreFocusLossUntil) return
        window.decorView.postDelayed({
            if (resumed && !hasWindowFocus() && pandaPanel && SystemClock.uptimeMillis() >= ignoreFocusLossUntil) {
                collapseSystemPanel()
                callWeb("openPanel()")
                DiagLog.add("info", "Paneel van het systeem vervangen door het PandaOS-paneel")
            }
        }, 400)
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
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        window.decorView.setOnApplyWindowInsetsListener { view, insets ->
            if (pandaPanel && insets.isVisible(WindowInsets.Type.statusBars())) {
                hideSystemBars()
                // Alleen bij een veeg van bovenaf (niet van onderaf, dan wil je naar het startscherm/de taakbalk)
                val recent = SystemClock.uptimeMillis() - lastTouchDownAt < 1500
                if (recent && lastTouchDownY < resources.displayMetrics.density * 48) callWeb("openPanel()")
            }
            view.onApplyWindowInsets(insets)
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
                or android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION)
        }
    }

    // Als apparaateigenaar: PandaOS blijft altijd het startscherm, ook na een update (Android vergeet de keuze
    // anders bij het vervangen van de app en neemt dan het eigen startscherm)
    private fun keepAsHomeScreen() {
        val policy = getSystemService(android.app.admin.DevicePolicyManager::class.java) ?: return
        if (!policy.isDeviceOwnerApp(packageName)) return
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
        private const val REQUEST_LOCATION = 1
        private const val REQUEST_CAMERA = 2
        const val MIN_WEBVIEW = 111 // Chrome-versie van het standaard bouwdoel van Vite 8 (chrome111)

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
