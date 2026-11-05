package nl.pandaos.launcher

import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView

// Knoppen rechtsboven op een app die half naast de auto staat (Nav/Energy, PandaBridge.launchAppHalf):
// [sluiten] [volledig scherm]. Doorzichtig over de app heen, in plaats van de grijze balk van Android (die valt net
// boven het scherm). Een venster boven andere apps (SYSTEM_ALERT_WINDOW), net als PandaOverlay.
class HalfAppControls(private val activity: MainActivity) {
    private val wm = activity.applicationContext.getSystemService(WindowManager::class.java)
    private val density = activity.resources.displayMetrics.density
    private var view: View? = null
    private var cover: View? = null
    private var pending: (() -> Unit)? = null

    // Tijdens het openen: een vlak in de kleur van het rechterpaneel over het app-gebied, zodat je niets ziet van wat
    // Android onderweg toont (grijze balk met icoon en kruisje, startscherm). reveal() haalt het weg en zet de knoppen.
    fun prepare(packageName: String, left: Int, top: Int, right: Int, bottom: Int, color: Int) {
        hide()
        if (!Settings.canDrawOverlays(activity)) return
        val shade = View(activity).apply { setBackgroundColor(color) }
        val params = WindowManager.LayoutParams(
            right - left, bottom - top,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.OPAQUE,
        ).apply { gravity = Gravity.TOP or Gravity.START; x = left; y = top + RadioSystem.overlayShift(activity) }
        try { wm.addView(shade, params); cover = shade; RadioSystem.fixOverlayPosition(wm, shade, params, top) } catch (_: Exception) {}
        pending = { show(packageName, right, top) }
        shade.postDelayed({ reveal() }, 3000) // uiterlijk na 3 s, ook als de app de focus niet krijgt
    }

    // De app staat klaar: vlak weg, knoppen erop
    fun reveal() {
        val next = pending ?: return
        pending = null
        cover?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        cover = null
        next()
    }

    private fun show(packageName: String, appRight: Int, appTop: Int) {
        view?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        view = null
        if (!Settings.canDrawOverlays(activity)) return
        val size = (40 * density).toInt()
        fun button(label: String, description: String, onTap: () -> Unit) = TextView(activity).apply {
            text = label
            contentDescription = description
            textSize = 18f
            setTextColor(0xFFFFFFFF.toInt())
            gravity = Gravity.CENTER
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(0x99000000.toInt()) }
            layoutParams = LinearLayout.LayoutParams(size, size).apply { marginStart = (8 * density).toInt() }
            setOnClickListener { onTap() }
        }
        val row = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(button("✕", "Sluiten") { activity.closeHalfApp() })
            addView(button("⛶", "Volledig scherm") { activity.fullscreenHalfApp(packageName) })
        }
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            val margin = (10 * density).toInt()
            x = appRight - 2 * size - (8 * density).toInt() - margin
            y = maxOf(appTop, 0) + margin + RadioSystem.overlayShift(activity)
        }
        try { wm.addView(row, params); view = row; RadioSystem.fixOverlayPosition(wm, row, params, maxOf(appTop, 0) + (10 * density).toInt()) } catch (e: Exception) { DiagLog.add("error", "Knoppen half venster: ${e.message}") }
    }

    fun hide() {
        pending = null
        cover?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        cover = null
        view?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        view = null
    }
}
