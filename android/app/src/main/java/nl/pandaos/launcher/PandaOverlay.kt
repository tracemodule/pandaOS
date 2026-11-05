package nl.pandaos.launcher

import android.annotation.SuppressLint
import android.graphics.PixelFormat
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

// PandaOS boven andere apps (CarPlay, Spotify, Waze ...), zolang PandaOS zelf niet vooraan staat:
//  - een smalle veegstrook bovenaan: omlaag vegen opent het PandaOS-menu (zelfde menu als in PandaOS);
//  - de PandaOS-volumecontainer zodra het volume verandert (knop van de radio, stuurknoppen).
// Het menu en de container zijn de webapp zelf (index.html#overlay) in een tweede, doorzichtige WebView; het venster
// groeit alleen mee als er iets te zien is, verder gaan aanrakingen gewoon naar de app eronder.
// Vraagt "boven andere apps tonen" (SYSTEM_ALERT_WINDOW); eenmalig via de laptop:
//   adb shell appops set nl.pandaos.launcher SYSTEM_ALERT_WINDOW allow
class PandaOverlay(
    private val activity: MainActivity,
    private val assetLoader: WebViewAssetLoader,
    private val bridge: Any,
    private val startUrl: String,
) {
    private val wm = activity.applicationContext.getSystemService(WindowManager::class.java)
    private val density = activity.resources.displayMetrics.density
    private var strip: View? = null
    private var web: WebView? = null
    private var webParams: WindowManager.LayoutParams? = null
    private var mode = "off"
    private var stripLayout: WindowManager.LayoutParams? = null

    // Verschuiving (overscan) gemeten: de veegstrook op het zichtbare scherm zetten
    fun applyShift() {
        val view = strip ?: return
        val params = stripLayout ?: return
        val y = RadioSystem.overlayShift(activity)
        if (params.y == y) return
        params.y = y
        try { wm.updateViewLayout(view, params) } catch (_: Exception) {}
    }

    fun canShow(): Boolean = Settings.canDrawOverlays(activity)

    private fun baseParams(touchable: Boolean) = WindowManager.LayoutParams(
        0, 0,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            (if (touchable) 0 else WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE),
        PixelFormat.TRANSLUCENT,
    ).apply { gravity = Gravity.TOP or Gravity.START }

    // PandaOS gaat naar de achtergrond: strook en (lege) WebView klaarzetten
    @SuppressLint("ClickableViewAccessibility", "SetJavaScriptEnabled")
    fun start() {
        if (mode != "off") return
        if (!canShow()) { DiagLog.add("info", "Overlay boven andere apps: geen toestemming (SYSTEM_ALERT_WINDOW)"); return }
        try {
            if (web == null) {
                web = WebView(activity).apply {
                    setBackgroundColor(0)
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    addJavascriptInterface(bridge, "PandaAndroid")
                    webViewClient = object : WebViewClient() {
                        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                            assetLoader.shouldInterceptRequest(request.url)
                    }
                    loadUrl("$startUrl#overlay")
                }
            }
            val params = baseParams(false).apply { width = 1; height = 1 }
            wm.addView(web, params)
            webParams = params

            val edge = (STRIP_DP * density).toInt()
            strip = View(activity).apply {
                var startY = -1f
                var startX = 0f
                setOnTouchListener { _, e ->
                    when (e.actionMasked) {
                        MotionEvent.ACTION_DOWN -> { startY = e.rawY; startX = e.rawX }
                        MotionEvent.ACTION_MOVE -> if (startY >= 0) {
                            val dy = e.rawY - startY
                            if (dy > OPEN_DP * density && dy > Math.abs(e.rawX - startX)) { startY = -1f; setMode("panel") }
                        }
                        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> startY = -1f
                    }
                    true
                }
            }
            // Scherm altijd liggend: apps die staand willen (ANWB Onderweg) draaien het radioscherm anders om
            val stripParams = baseParams(true).apply {
                width = WindowManager.LayoutParams.MATCH_PARENT; height = edge
                y = RadioSystem.overlayShift(activity)
                screenOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            }
            wm.addView(strip, stripParams)
            stripLayout = stripParams
            RadioSystem.fixOverlayPosition(wm, strip!!, stripParams, 0)
            RadioSystem.onShiftMeasured = { applyShift() }
            mode = "idle"
        } catch (e: Exception) {
            DiagLog.add("error", "Overlay starten mislukt: ${e.message}")
            stop()
        }
    }

    // PandaOS weer vooraan: overlay weg (PandaOS heeft zijn eigen menu en volume)
    fun stop() {
        try { strip?.let { wm.removeView(it) } } catch (_: Exception) {}
        try { if (webParams != null) web?.let { wm.removeView(it) } } catch (_: Exception) {}
        if (mode != "off") web?.evaluateJavascript("window.PandaOS && window.PandaOS.overlayMode && window.PandaOS.overlayMode('idle')", null)
        strip = null
        webParams = null
        mode = "off"
    }

    // idle = alleen de strook, volume = container bovenaan, panel = het menu (hele scherm)
    fun setMode(next: String) {
        val params = webParams ?: return
        val view = web ?: return
        if (mode == "off" || next == mode) return
        // Volume verandert terwijl het menu open is: het menu blijft (het heeft zelf een volumeschuif)
        if (next == "volume" && mode == "panel") return
        mode = next
        val screen = activity.resources.displayMetrics
        when (next) {
            "panel" -> {
                params.width = WindowManager.LayoutParams.MATCH_PARENT; params.height = screen.heightPixels
                params.x = 0; params.y = RadioSystem.overlayShift(activity)
                params.flags = params.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
            }
            "volume" -> {
                params.width = (VOLUME_W_DP * density).toInt().coerceAtMost(screen.widthPixels)
                params.height = (VOLUME_H_DP * density).toInt()
                params.x = (screen.widthPixels - params.width) / 2; params.y = (VOLUME_TOP_DP * density).toInt() + RadioSystem.overlayShift(activity)
                params.flags = params.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
            }
            else -> {
                params.width = 1; params.height = 1; params.x = 0; params.y = 0
                params.flags = params.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
            }
        }
        try { wm.updateViewLayout(view, params) } catch (_: Exception) {}
        view.evaluateJavascript("window.PandaOS && window.PandaOS.overlayMode && window.PandaOS.overlayMode('$next')", null)
    }

    // Gebeurtenissen van de launcher (volume, meldingen) ook naar de overlay
    fun callWeb(call: String) {
        if (mode == "off") return
        web?.evaluateJavascript("window.PandaOS && window.PandaOS.${call.substringBefore('(')} && window.PandaOS.$call", null)
    }

    companion object {
        const val STRIP_DP = 20 // hoogte van de veegstrook bovenaan (dp); tikken daar gaan niet naar de app eronder
        const val OPEN_DP = 40
        const val VOLUME_W_DP = 560
        const val VOLUME_H_DP = 96
        const val VOLUME_TOP_DP = 24
    }
}
