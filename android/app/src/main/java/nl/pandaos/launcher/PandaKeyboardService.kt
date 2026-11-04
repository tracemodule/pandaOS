package nl.pandaos.launcher

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.inputmethodservice.InputMethodService
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

// Het PandaOS-toetsenbord als echt Android-toetsenbord (invoermethode), zodat het ook in Android-apps verschijnt
// (Chrome, YouTube, Maps ...). Zelfde indeling en kleuren als het toetsenbord in de webapp
// (client/src/components/settings/Keyboard.tsx + _keyboard.scss): links het letterblok in een raster van halve
// toetsen, rechts het numpad. Licht/donker volgt PandaOS (PandaBridge.setUiTheme -> SharedPreferences).
class PandaKeyboardService : InputMethodService() {

    private enum class Shift { OFF, ONCE, LOCK }

    private var shift = Shift.OFF
    private var symbols = false
    private var lastShiftTap = 0L
    private var root: LinearLayout? = null
    private val handler = Handler(Looper.getMainLooper())

    private val letterRows = listOf(
        listOf("q", "w", "e", "r", "t", "y", "u", "i", "o", "p"),
        listOf("a", "s", "d", "f", "g", "h", "j", "k", "l"),
        listOf("z", "x", "c", "v", "b", "n", "m", "-", ",", "."),
    )
    private val symbolRows = listOf(
        listOf("!", "@", "#", "$", "%", "^", "&", "*", "(", ")"),
        listOf("-", "/", ":", ";", "'", "\"", "€", "£", "+"),
        listOf("_", "=", "[", "]", "{", "}", "<", ">", "?", "~"),
    )

    // Kleuren zoals in _keyboard.scss
    private data class Palette(val bg: Int, val text: Int, val special: Int, val specialPressed: Int, val charPressed: Int, val active: Int)
    private val light = Palette(0xFFEFEFEF.toInt(), 0xFF333333.toInt(), 0xFFE0E0E0.toInt(), 0xFFC9C9C9.toInt(), 0x14000000, 0xFFC4C4C4.toInt())
    private val dark = Palette(0xFF1A1A1A.toInt(), 0xFFFFFFFF.toInt(), 0xFF424242.toInt(), 0xFF5A5A5A.toInt(), 0x1AFFFFFF, 0xFF636363.toInt())
    private val palette get() = if (isDark(this)) dark else light

    override fun onCreateInputView(): View = LinearLayout(this).also { root = it; build() }

    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        shift = Shift.OFF
        symbols = false
        build() // thema kan veranderd zijn
    }

    // ---------- Opbouw ----------

    private fun dp(value: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics).toInt()

    private fun build() {
        val container = root ?: return
        val p = palette
        container.removeAllViews()
        container.orientation = LinearLayout.HORIZONTAL
        container.setBackgroundColor(p.bg)
        container.setPadding(dp(20f), dp(14f), dp(20f), dp(12f))

        // Letterblok (links): 4 rijen van 24 halve kolommen
        val letters = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val rows = if (symbols) symbolRows else letterRows
        letters.addView(row { r ->
            rows[0].forEach { r.key(label(it), 2f) { typeChar(it) } }
            r.special("", 4f, icon = R.drawable.ic_kb_backspace, repeat = true) { backspace() }
        })
        letters.addView(row { r ->
            r.spacer(1f)
            rows[1].forEach { r.key(label(it), 2f) { typeChar(it) } }
            r.special("Enter", 5f) { enter() }
        })
        letters.addView(row { r ->
            r.spacer(2f)
            rows[2].forEach { r.key(label(it), 2f) { typeChar(it) } }
            r.spacer(2f)
        })
        letters.addView(row { r ->
            r.special("", 4f, icon = R.drawable.ic_kb_shift, active = shift != Shift.OFF, underline = shift == Shift.LOCK) { toggleShift() }
            r.special("", 2f, icon = R.drawable.ic_kb_mic) { /* spraakinvoer: nog niet, zoals in de webapp */ }
            r.special("", 10f) { commit(" ") }
            r.special(if (symbols) "abc" else "? # &", 4f) { symbols = !symbols; build() }
            r.special("", 2f, icon = R.drawable.ic_kb_left) { sendKey(KeyEvent.KEYCODE_DPAD_LEFT) }
            r.special("", 2f, icon = R.drawable.ic_kb_right) { sendKey(KeyEvent.KEYCODE_DPAD_RIGHT) }
        })
        container.addView(letters, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

        // Ruimte tussen letterblok en numpad
        container.addView(View(this), LinearLayout.LayoutParams(dp(40f), 1))

        // Numpad (rechts): 1-9 en de 0 onder de 8
        val numpad = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9")).forEach { digits ->
            numpad.addView(row { r -> digits.forEach { d -> r.key(d, 1f) { commit(d) } } })
        }
        numpad.addView(row { r -> r.spacer(1f); r.key("0", 1f) { commit("0") }; r.spacer(1f) })
        container.addView(numpad, LinearLayout.LayoutParams(dp(210f), LinearLayout.LayoutParams.WRAP_CONTENT))
    }

    private fun label(char: String) = if (!symbols && shift != Shift.OFF && char.length == 1 && char[0].isLetter()) char.uppercase() else char

    // Een rij toetsen; elke toets krijgt een gewicht (aantal halve kolommen)
    private fun row(fill: (LinearLayout) -> Unit): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48f)).also { it.bottomMargin = dp(8f) }
        fill(this)
    }

    private fun LinearLayout.spacer(weight: Float) = addView(View(context), LinearLayout.LayoutParams(0, 1, weight))

    // Teken-toets: geen achtergrond, lichte markering bij indrukken (zoals de webapp)
    private fun LinearLayout.key(text: String, weight: Float, onPress: () -> Unit) =
        addView(makeKey(text, special = false, onPress = onPress), keyParams(weight))

    // Speciale toets: grijs afgerond blok met kleiner label
    private fun LinearLayout.special(text: String, weight: Float, icon: Int? = null, active: Boolean = false, underline: Boolean = false,
                                     repeat: Boolean = false, onPress: () -> Unit) =
        addView(makeKey(text, special = true, icon = icon, active = active, underline = underline, repeat = repeat, onPress = onPress), keyParams(weight))

    private fun keyParams(weight: Float) = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, weight).also {
        it.marginStart = dp(4f)
        it.marginEnd = dp(4f)
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun makeKey(text: String, special: Boolean, icon: Int? = null, active: Boolean = false, underline: Boolean = false,
                        repeat: Boolean = false, onPress: () -> Unit): View {
        val p = palette
        val normal = if (special) (if (active) p.active else p.special) else 0x00000000
        val pressed = if (special) p.specialPressed else p.charPressed
        val shape = GradientDrawable().apply { cornerRadius = dp(4f).toFloat(); setColor(normal) }
        // Caps lock: streep onderaan de shift-toets (zoals box-shadow inset in de webapp)
        val background = if (underline) android.graphics.drawable.LayerDrawable(arrayOf(shape,
            GradientDrawable().apply { setColor(p.text) })).apply {
            setLayerInset(1, 0, dp(45f), 0, 0)
        } else shape
        val view: View = if (icon != null) ImageView(this).apply {
            setImageResource(icon)
            setColorFilter(p.text)
            scaleType = ImageView.ScaleType.CENTER
        } else TextView(this).apply {
            this.text = text
            gravity = Gravity.CENTER
            setTextColor(p.text)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, if (special) 15f else 22f)
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        }
        return view.apply {
            this.background = background
            // Reageert bij aanraken (niet pas bij loslaten), net als de webapp; wistoets herhaalt bij vasthouden
            var repeater: Runnable? = null
            setOnTouchListener { _, event ->
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        shape.setColor(pressed)
                        onPress()
                        if (repeat) {
                            repeater = object : Runnable {
                                override fun run() { onPress(); handler.postDelayed(this, 60) }
                            }.also { handler.postDelayed(it, 400) }
                        }
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                        shape.setColor(normal)
                        repeater?.let { handler.removeCallbacks(it) }
                        repeater = null
                    }
                }
                true
            }
        }
    }

    // ---------- Invoer ----------

    private fun commit(text: String) { currentInputConnection?.commitText(text, 1) }

    private fun typeChar(char: String) {
        commit(label(char))
        if (shift == Shift.ONCE) { shift = Shift.OFF; build() }
    }

    private fun backspace() {
        val ic = currentInputConnection ?: return
        if (ic.getSelectedText(0).isNullOrEmpty()) ic.deleteSurroundingText(1, 0) else ic.commitText("", 1)
    }

    // Enter: de actie van het veld (zoeken, ga, volgende, klaar), anders een gewone Enter
    private fun enter() {
        val action = (currentInputEditorInfo?.imeOptions ?: 0) and EditorInfo.IME_MASK_ACTION
        val noEnterAction = (currentInputEditorInfo?.imeOptions ?: 0) and EditorInfo.IME_FLAG_NO_ENTER_ACTION != 0
        if (!noEnterAction && action != EditorInfo.IME_ACTION_NONE && action != EditorInfo.IME_ACTION_UNSPECIFIED) {
            currentInputConnection?.performEditorAction(action)
        } else {
            sendKey(KeyEvent.KEYCODE_ENTER)
        }
    }

    private fun sendKey(code: Int) {
        val ic = currentInputConnection ?: return
        ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
        ic.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
    }

    // Shift: enkele tik = volgende letter hoofdletter, dubbele tik = caps lock, nogmaals = uit
    private fun toggleShift() {
        val now = System.currentTimeMillis()
        val doubleTap = now - lastShiftTap < 400
        lastShiftTap = now
        shift = when {
            shift == Shift.LOCK -> Shift.OFF
            shift == Shift.ONCE && doubleTap -> Shift.LOCK
            shift == Shift.ONCE -> Shift.OFF
            else -> Shift.ONCE
        }
        build()
    }

    companion object {
        private const val PREFS = "pandaos_ui"
        private const val KEY_DARK = "dark"

        fun isDark(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_DARK, false)

        fun setDark(context: Context, dark: Boolean) =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_DARK, dark).apply()
    }
}
