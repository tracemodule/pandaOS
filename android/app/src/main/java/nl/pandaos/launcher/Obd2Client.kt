package nl.pandaos.launcher

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.Random
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// OBD2 via een ELM327-adapter (Bluetooth Classic, SPP/RFCOMM) voor de PandaOS OBD-app (client/src/store/apps/ObdApp.tsx).
// Auto: VW Golf 6 (2009-2012, benzine), protocol ISO 15765-4 CAN 11/500. Veel adapters zijn goedkope klonen: daarom
// drie manieren om de socket te openen, ruime time-outs en een vergevingsgezinde parser.
//  - Alleen lezen: modus 01 (live waarden), 03 (opgeslagen foutcodes) en 07 (wachtende foutcodes).
//  - Modus 04 (foutcodes wissen) is BEWUST niet gebouwd: dat zet ook de readiness-monitors terug en hoort bij de garage.
//  - Adres "demo": geen Bluetooth, een gesimuleerde Golf 6 1.4 TSI, zodat de app op de emulator te testen is.
// Naar de webapp: DOM-event 'pandaos-obd' (detail = dezelfde JSON als obdState), hoogstens ~2 keer per seconde.
// Logboek (DiagLog): toestanden en fouten, apparaatnamen wel, MAC-adressen alleen gemaskeerd (AA:BB:…:EE).
@SuppressLint("MissingPermission")
object Obd2Client {

    const val DEMO = "demo"
    private const val PREFS = "pandaos_obd"
    private val SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private val BACKOFF = longArrayOf(5_000, 10_000, 30_000)
    private const val TIMEOUT = 2_500L
    private const val TIMEOUT_FIRST = 6_000L
    private const val TIMEOUT_DTC = 4_000L
    private const val MIN_CYCLE = 300L
    private const val DISPATCH_GAP = 500L
    private val LIKELY_OBD = Regex("obd|elm|v-?link|vgate|icar|konnwei|veepeak|obdlink|kiwi|scan", RegexOption.IGNORE_CASE)
    private val MAC = Regex("([0-9A-Fa-f]{2}):([0-9A-Fa-f]{2})(:[0-9A-Fa-f]{2}){3}:([0-9A-Fa-f]{2})")

    // Bluetooth-profielen van de radio-kant (Android 9, verborgen constanten)
    private const val PROFILE_A2DP_SINK = 11
    private const val PROFILE_AVRCP_CONTROLLER = 12
    private const val PROFILE_HEADSET_CLIENT = 16

    private val handler = Handler(Looper.getMainLooper())
    @Volatile private var appContext: Context? = null
    @Volatile private var js: ((String) -> Unit)? = null
    private val profiles = ConcurrentHashMap<Int, BluetoothProfile>()

    // ---------------- Toestand (alles onder lock) ----------------

    private val lock = Any()
    private var state = "idle"           // idle | connecting | initializing | connected | error
    private var deviceName: String? = null
    private var deviceAddress: String? = null
    private var protocol: String? = null
    private var error: String? = null
    private var supported: List<String> = emptyList()
    private val values = LinkedHashMap<String, Double?>()
    private var dtc: JSONObject? = null
    private var updatedAt = 0L
    private var demo = false
    private var session: Session? = null

    private val VALUE_KEYS = listOf("rpm", "speed", "coolant", "load", "intakeTemp", "throttle", "fuel", "ambient",
        "fuelRate", "voltage", "distanceSinceClear")

    init { VALUE_KEYS.forEach { values[it] = null } }

    // Aanroepen vanuit MainActivity.onCreate (ook na een herstart van de activiteit: dan alleen de nieuwe webview)
    fun start(context: Context, js: (String) -> Unit) {
        this.js = js
        if (appContext != null) { scheduleDispatch(); return }
        appContext = context.applicationContext
        listenProfiles()
        val prefs = prefs() ?: return
        val last = prefs.getString("lastAddress", "").orEmpty()
        if (prefs.getBoolean("autoConnect", false) && last.isNotEmpty()) {
            DiagLog.add("info", "OBD2: automatisch verbinden met ${prefs.getString("lastName", "") ?: ""}")
            connect(last)
        }
    }

    private fun prefs() = appContext?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun adapter(): BluetoothAdapter? = try {
        appContext?.getSystemService(BluetoothManager::class.java)?.adapter
    } catch (_: Exception) { null }

    // AA:BB:…:EE (nooit een volledig MAC-adres in het logboek)
    private fun mask(address: String?): String = if (address == null) "?" else
        MAC.replace(address) { "${it.groupValues[1]}:${it.groupValues[2]}:…:${it.groupValues[4]}" }

    private fun safe(e: Throwable): String = mask(e.message ?: e.javaClass.simpleName)

    // ---------------- Naar de webapp ----------------

    private val dispatchPending = AtomicBoolean(false)
    @Volatile private var lastDispatch = 0L

    private val dispatchRunnable = Runnable {
        dispatchPending.set(false)
        lastDispatch = SystemClock.elapsedRealtime()
        val json = stateJson()
        js?.invoke("window.dispatchEvent(new CustomEvent('pandaos-obd',{detail:$json}))")
    }

    // Hoogstens één event per DISPATCH_GAP; het laatste event heeft altijd de nieuwste toestand
    private fun scheduleDispatch() {
        if (!dispatchPending.compareAndSet(false, true)) return
        val wait = max(0L, DISPATCH_GAP - (SystemClock.elapsedRealtime() - lastDispatch))
        handler.postDelayed(dispatchRunnable, wait)
    }

    // window.PandaAndroid.obdState
    fun stateJson(): String = synchronized(lock) {
        val v = JSONObject()
        values.forEach { (k, value) -> v.put(k, value ?: JSONObject.NULL) }
        JSONObject()
            .put("state", state)
            .put("device", if (deviceAddress == null) JSONObject.NULL else
                JSONObject().put("name", deviceName ?: "").put("address", deviceAddress))
            .put("protocol", protocol ?: JSONObject.NULL)
            .put("error", error ?: JSONObject.NULL)
            .put("supported", JSONArray(supported))
            .put("values", v)
            .put("dtc", dtc ?: JSONObject.NULL)
            .put("updatedAt", updatedAt)
            .put("demo", demo)
            .toString()
    }

    // Toestand wijzigen; alleen als de sessie nog de huidige is (een oude thread mag niets meer veranderen)
    private inline fun update(s: Session?, block: () -> Unit): Boolean {
        synchronized(lock) {
            if (s != null && session !== s) return false
            block()
            updatedAt = System.currentTimeMillis()
        }
        scheduleDispatch()
        return true
    }

    private fun clearValuesLocked() { VALUE_KEYS.forEach { values[it] = null } }

    private fun setState(s: Session, newState: String, newError: String? = null) {
        var changed = false
        update(s) {
            changed = state != newState || error != newError
            state = newState; error = newError
        }
        if (changed) DiagLog.add(if (newState == "error") "warn" else "info",
            "OBD2: $newState${if (newError != null) " ($newError)" else ""}")
    }

    // ---------------- Instellingen ----------------

    // {"autoConnect":bool,"lastAddress":"..","lastName":".."}
    fun settingsJson(): String {
        val p = prefs()
        return JSONObject()
            .put("autoConnect", p?.getBoolean("autoConnect", false) ?: false)
            .put("lastAddress", p?.getString("lastAddress", "").orEmpty())
            .put("lastName", p?.getString("lastName", "").orEmpty())
            .toString()
    }

    private fun autoConnect(): Boolean = prefs()?.getBoolean("autoConnect", false) ?: false

    fun setAutoConnect(on: Boolean) {
        prefs()?.edit()?.putBoolean("autoConnect", on)?.apply()
        DiagLog.add("info", "OBD2: automatisch verbinden ${if (on) "aan" else "uit"}")
    }

    // ---------------- Apparaten ----------------

    // [{"name":"OBDII","address":"00:1D:..","likelyObd":true}, ..., {"name":"Demo","address":"demo","likelyObd":true}]
    fun listDevicesJson(): String {
        val array = JSONArray()
        try {
            val bonded = adapter()?.bondedDevices.orEmpty()
            bonded.map { (it.name ?: it.address) to it.address }
                .sortedWith(compareByDescending<Pair<String, String>> { LIKELY_OBD.containsMatchIn(it.first) }.thenBy { it.first.lowercase() })
                .forEach { (name, address) ->
                    array.put(JSONObject().put("name", name).put("address", address).put("likelyObd", LIKELY_OBD.containsMatchIn(name)))
                }
        } catch (e: Exception) { DiagLog.add("warn", "OBD2: gekoppelde apparaten niet leesbaar: ${safe(e)}") }
        array.put(JSONObject().put("name", "Demo").put("address", DEMO).put("likelyObd", true))
        return array.toString()
    }

    private fun nameOf(address: String): String {
        if (address.equals(DEMO, ignoreCase = true)) return "Demo"
        return try {
            adapter()?.bondedDevices?.firstOrNull { it.address.equals(address, ignoreCase = true) }?.name
        } catch (_: Exception) { null } ?: address
    }

    // ---------------- Verbinden / verbreken ----------------

    fun connect(rawAddress: String) {
        val address = rawAddress.trim().let { if (it.equals(DEMO, ignoreCase = true)) DEMO else it.uppercase() }
        if (address.isEmpty()) return
        if (address != DEMO && !BluetoothAdapter.checkBluetoothAddress(address)) {
            DiagLog.add("warn", "OBD2: ongeldig adres"); return
        }
        val name = nameOf(address)
        prefs()?.edit()?.putString("lastAddress", address)?.putString("lastName", name)?.apply()
        val newSession: Session
        val old: Session?
        synchronized(lock) {
            val current = session
            if (current != null && current.address == address && state != "error" && state != "idle") return
            old = current
            newSession = Session(address, name, address == DEMO)
            session = newSession
            if (deviceAddress != address) { dtc = null }
            state = "connecting"; error = null; protocol = null; supported = emptyList()
            deviceName = name; deviceAddress = address; demo = newSession.demo
            clearValuesLocked()
            updatedAt = System.currentTimeMillis()
        }
        old?.cancel()
        DiagLog.add("info", "OBD2: verbinden met $name (${mask(address)})")
        scheduleDispatch()
        Thread(newSession, "PandaOS-OBD2").apply { isDaemon = true }.start()
    }

    fun disconnect() {
        val old: Session?
        synchronized(lock) {
            old = session
            session = null
            state = "idle"; error = null; protocol = null; supported = emptyList()
            deviceName = null; deviceAddress = null; demo = false
            clearValuesLocked()
            updatedAt = System.currentTimeMillis()
        }
        if (old != null) {
            old.cancel()
            DiagLog.add("info", "OBD2: verbroken door gebruiker (${old.name})")
        }
        scheduleDispatch()
    }

    // Foutcodes (03 en 07) lezen; het resultaat komt in state.dtc
    fun readDtc() {
        val s = synchronized(lock) { session?.takeIf { state == "connected" } }
        if (s == null) { DiagLog.add("info", "OBD2: foutcodes lezen kan alleen met verbinding"); return }
        s.dtcRequested.set(true)
    }

    // ---------------- Bluetooth-info (telefoon + OBD2 tegelijk) ----------------

    private fun listenProfiles() {
        val ctx = appContext ?: return
        val adapter = adapter() ?: return
        for (p in listOf(PROFILE_A2DP_SINK, PROFILE_HEADSET_CLIENT, PROFILE_AVRCP_CONTROLLER)) {
            try {
                adapter.getProfileProxy(ctx, object : BluetoothProfile.ServiceListener {
                    override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) { profiles[profile] = proxy }
                    override fun onServiceDisconnected(profile: Int) { profiles.remove(profile) }
                }, p)
            } catch (_: Throwable) { /* profiel bestaat niet op dit apparaat */ }
        }
    }

    // {"adapterEnabled":true,"bonded":3,"connectedProfiles":{"a2dpSink":["iPhone"],"headsetClient":[..],"avrcpController":[..]},"obdConnected":false}
    fun bluetoothInfoJson(): String {
        val o = JSONObject()
        val adapter = adapter()
        try { o.put("adapterEnabled", adapter?.isEnabled == true) } catch (_: Throwable) { o.put("adapterEnabled", false) }
        try { o.put("bonded", adapter?.bondedDevices?.size ?: 0) } catch (_: Throwable) { o.put("bonded", 0) }
        val connected = JSONObject()
        for ((key, p) in listOf("a2dpSink" to PROFILE_A2DP_SINK, "headsetClient" to PROFILE_HEADSET_CLIENT,
            "avrcpController" to PROFILE_AVRCP_CONTROLLER)) {
            val names = JSONArray()
            try {
                profiles[p]?.connectedDevices?.forEach { names.put(it.name ?: "onbekend") }
            } catch (_: Throwable) {}
            if (names.length() == 0) {
                // Geen proxy (nog niet klaar of niet toegestaan): dan alleen of er iets verbonden is
                try {
                    if (adapter?.getProfileConnectionState(p) == BluetoothProfile.STATE_CONNECTED) names.put("(verbonden)")
                } catch (_: Throwable) {}
            }
            connected.put(key, names)
        }
        o.put("connectedProfiles", connected)
        o.put("obdConnected", synchronized(lock) { state == "connected" && !demo })
        return o.toString()
    }

    // ---------------- Sessie (één thread per verbinding) ----------------

    private class ObdException(message: String) : Exception(message)

    // Eén antwoord van de ELM327: datalijnen (hex, zonder spaties), foutmelding, of time-out
    private class Reply(val lines: List<String>, val error: String?, val timedOut: Boolean, val raw: String) {
        val ok: Boolean get() = !timedOut && error == null && lines.isNotEmpty()
    }

    private val ERRORS = listOf("UNABLE TO CONNECT", "CAN ERROR", "BUS ERROR", "BUS BUSY", "DATA ERROR", "BUFFER FULL",
        "FB ERROR", "RX ERROR", "LV RESET", "ACT ALERT", "NO DATA", "STOPPED", "ERROR")
    private val HEX_LINE = Regex("^([0-9A-F]:)?[0-9A-F]+$")

    private class Session(val address: String, val name: String, val demo: Boolean) : Runnable {
        @Volatile var cancelled = false
        @Volatile var socket: BluetoothSocket? = null
        @Volatile var thread: Thread? = null
        val dtcRequested = AtomicBoolean(false)
        var input: InputStream? = null
        var output: OutputStream? = null
        var protocolNum = -1
        var supportedPids: Set<Int> = emptySet() // alleen door de sessie-thread gebruikt
        var reachedConnected = false

        fun alive() = !cancelled && synchronized(lock) { session === this }

        fun cancel() {
            cancelled = true
            closeSocket()
            thread?.interrupt()
        }

        fun closeSocket() {
            try { socket?.close() } catch (_: Exception) {}
            socket = null; input = null; output = null
        }

        override fun run() {
            thread = Thread.currentThread()
            var attempt = 0
            while (alive()) {
                reachedConnected = false
                try {
                    if (demo) runDemo(this) else runElm(this)
                    if (!alive()) break
                    throw ObdException("Verbinding gestopt")
                } catch (e: Throwable) {
                    if (!alive()) break
                    val msg = when (e) {
                        is ObdException -> e.message ?: "Fout"
                        is IOException -> if (reachedConnected) "Verbinding met de adapter verbroken" else "Adapter niet bereikbaar"
                        is SecurityException -> "Geen toestemming voor Bluetooth"
                        is InterruptedException -> "Onderbroken"
                        else -> "Fout: ${e.javaClass.simpleName}"
                    }
                    DiagLog.add("warn", "OBD2 ($name): $msg${if (e !is ObdException) " — ${safe(e)}" else ""}")
                    closeSocket()
                    if (reachedConnected) attempt = 0
                    update(this) { clearValuesLocked(); protocol = null }
                    if (!autoConnect()) { setState(this, "error", msg); break }
                    val wait = BACKOFF[min(attempt, BACKOFF.size - 1)]
                    attempt++
                    setState(this, "error", "$msg — opnieuw over ${wait / 1000} s")
                    try { Thread.sleep(wait) } catch (_: InterruptedException) { break }
                    if (!alive()) break
                    setState(this, "connecting")
                } finally {
                    if (!alive()) closeSocket()
                }
            }
            closeSocket()
        }
    }

    // ---------------- ELM327 ----------------

    private fun runElm(s: Session) {
        val adapter = adapter() ?: throw ObdException("Geen Bluetooth op dit apparaat")
        if (!adapter.isEnabled) throw ObdException("Bluetooth staat uit")
        setState(s, "connecting")
        val device = adapter.getRemoteDevice(s.address)
        openSocket(s, adapter, device)
        if (!s.alive()) return
        setState(s, "initializing")
        initElm(s)
        if (!s.alive()) return
        s.reachedConnected = true
        setState(s, "connected")
        s.dtcRequested.set(true) // na verbinden één keer de foutcodes lezen (alleen lezen)
        pollLoop(s)
    }

    // Drie manieren: gewone SPP-socket, onveilige SPP-socket, en direct kanaal 1 (verborgen methode) voor klonen
    private fun openSocket(s: Session, adapter: BluetoothAdapter, device: BluetoothDevice) {
        val ways = listOf<Pair<String, () -> BluetoothSocket>>(
            "secure" to { device.createRfcommSocketToServiceRecord(SPP) },
            "insecure" to { device.createInsecureRfcommSocketToServiceRecord(SPP) },
            "kanaal 1" to {
                device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType).invoke(device, 1) as BluetoothSocket
            },
        )
        var last: Throwable? = null
        for ((label, make) in ways) {
            if (!s.alive()) return
            try { adapter.cancelDiscovery() } catch (_: Exception) {}
            var socket: BluetoothSocket? = null
            try {
                socket = make()
                s.socket = socket
                socket.connect()
                if (!s.alive()) { socket.close(); return }
                s.input = socket.inputStream
                s.output = socket.outputStream
                DiagLog.add("info", "OBD2: Bluetooth-socket open ($label) met ${s.name}")
                return
            } catch (e: Throwable) {
                last = (e as? java.lang.reflect.InvocationTargetException)?.targetException ?: e
                try { socket?.close() } catch (_: Exception) {}
                s.socket = null
                if (!s.alive()) return
                DiagLog.add("info", "OBD2: socket ($label) mislukt: ${safe(last!!)}")
                try { Thread.sleep(300) } catch (_: InterruptedException) { return }
            }
        }
        throw IOException("Geen Bluetooth-verbinding met ${s.name}: ${last?.let { safe(it) } ?: "onbekend"}")
    }

    private fun initElm(s: Session) {
        // ATZ: reset; klonen hebben soms meer dan een seconde nodig
        var reset = command(s, "ATZ", TIMEOUT)
        if (reset.timedOut && reset.raw.isBlank()) reset = command(s, "ATZ", TIMEOUT)
        if (reset.timedOut && reset.raw.isBlank()) throw ObdException("Adapter antwoordt niet")
        Thread.sleep(1_000)
        drain(s)
        val version = reset.raw.lines().map { it.trim() }.firstOrNull { it.contains("ELM", ignoreCase = true) }
        DiagLog.add("info", "OBD2: adapter ${version ?: "(geen versie)"}")
        for (cmd in listOf("ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSP0")) {
            val r = command(s, cmd, TIMEOUT)
            if (!r.raw.contains("OK")) DiagLog.add("info", "OBD2: $cmd gaf geen OK (${r.raw.trim().take(30)})")
        }
        // 0100: protocol zoeken (SEARCHING... kan seconden duren)
        var first = command(s, "0100", TIMEOUT_FIRST)
        var mask0 = pidBytes(first, 0x00)
        if (mask0 == null && s.alive()) {
            Thread.sleep(500); drain(s)
            first = command(s, "0100", TIMEOUT_FIRST)
            mask0 = pidBytes(first, 0x00)
        }
        if (mask0 == null) throw ObdException(when {
            first.error == "UNABLE TO CONNECT" || first.error == "NO DATA" -> "Auto antwoordt niet (contact aan?)"
            first.error != null -> "Auto antwoordt niet (${first.error})"
            else -> "Geen antwoord op 0100"
        })
        val dpn = command(s, "ATDPN", TIMEOUT).raw.uppercase().replace(">", "").trim()
        s.protocolNum = dpn.lastOrNull()?.let { Character.digit(it, 16) } ?: -1
        val protocolName = PROTOCOLS[s.protocolNum]
        // Ondersteunde PID's: 0100 (01-20), 0120 (21-40), 0140 (41-60)
        val sup = sortedSetOf<Int>()
        addMask(sup, 0x00, mask0)
        for (base in listOf(0x20, 0x40)) {
            if (base !in sup) break
            val bytes = pidBytes(command(s, "01%02X".format(base), TIMEOUT), base) ?: break
            addMask(sup, base, bytes)
        }
        val list = listOf("0100") + sup.map { "01%02X".format(it) }
        update(s) { protocol = protocolName; supported = list }
        s.supportedPids = sup
        DiagLog.add("info", "OBD2: protocol ${protocolName ?: "onbekend ($dpn)"}, ${sup.size} PID's ondersteund")
    }

    private val PROTOCOLS = mapOf(
        1 to "SAE J1850 PWM", 2 to "SAE J1850 VPW", 3 to "ISO 9141-2", 4 to "ISO 14230-4 KWP (5 baud init)",
        5 to "ISO 14230-4 KWP (fast init)", 6 to "ISO 15765-4 CAN (11/500)", 7 to "ISO 15765-4 CAN (29/500)",
        8 to "ISO 15765-4 CAN (11/250)", 9 to "ISO 15765-4 CAN (29/250)", 10 to "SAE J1939 CAN (29/250)",
        11 to "USER1 CAN (11/125)", 12 to "USER2 CAN (11/50)",
    )

    // Bit 7 van byte A = PID base+1, ... bit 0 van byte D = PID base+32
    private fun addMask(set: MutableSet<Int>, base: Int, bytes: IntArray) {
        for (i in 0 until min(32, bytes.size * 8)) {
            if ((bytes[i / 8] shr (7 - i % 8)) and 1 == 1) set.add(base + i + 1)
        }
    }

    // ---- Lezen/schrijven ----

    private fun drain(s: Session) {
        val input = s.input ?: throw IOException("Socket dicht")
        var n = input.available()
        while (n > 0) { input.skip(n.toLong()); n = input.available() }
    }

    // Commando sturen en lezen tot de '>'-prompt (of time-out)
    private fun command(s: Session, cmd: String, timeoutMs: Long): Reply {
        val input = s.input ?: throw IOException("Socket dicht")
        val output = s.output ?: throw IOException("Socket dicht")
        drain(s)
        output.write("$cmd\r".toByteArray(Charsets.US_ASCII))
        output.flush()
        val sb = StringBuilder()
        val deadline = SystemClock.elapsedRealtime() + timeoutMs
        var prompt = false
        val buf = ByteArray(256)
        while (!prompt) {
            if (!s.alive()) throw InterruptedException()
            val n = input.available()
            if (n > 0) {
                val r = input.read(buf, 0, min(n, buf.size))
                if (r < 0) throw IOException("Einde van de stroom")
                for (i in 0 until r) {
                    val ch = buf[i].toInt() and 0xFF
                    if (ch == '>'.code) { prompt = true; break }
                    if (ch != 0) sb.append(ch.toChar())
                }
            } else {
                if (SystemClock.elapsedRealtime() >= deadline) break
                Thread.sleep(10)
            }
        }
        return parse(cmd, sb.toString(), !prompt)
    }

    // Robuust: spaties weg, "SEARCHING..." en "BUS INIT: ...OK" weg, echo weg, foutmeldingen herkennen
    private fun parse(cmd: String, raw: String, timedOut: Boolean): Reply {
        val lines = ArrayList<String>()
        var err: String? = null
        val echo = cmd.uppercase().replace(" ", "")
        for (part in raw.uppercase().split('\r', '\n')) {
            var line = part.replace("SEARCHING...", "").replace("BUS INIT: ...OK", "").replace("BUS INIT:...OK", "").trim()
            if (line.isEmpty()) continue
            if (line == "?") { err = err ?: "?"; continue }
            val found = ERRORS.firstOrNull { line.contains(it) }
            if (found != null) { err = err ?: found; continue }
            line = line.replace(" ", "")
            if (line == echo) continue
            if (HEX_LINE.matches(line)) lines.add(line)
        }
        // Data wint van een losse foutregel (bijv. één ECU met NO DATA en één met antwoord)
        return Reply(lines, if (lines.isEmpty()) err else null, timedOut && lines.isEmpty(), raw)
    }

    private fun hexBytes(hex: String): IntArray {
        val n = hex.length / 2
        return IntArray(n) { Integer.parseInt(hex.substring(it * 2, it * 2 + 2), 16) }
    }

    // Modus 01: databytes na "41 <pid>" van de eerste ECU die antwoordt
    private fun pidBytes(reply: Reply, pid: Int): IntArray? {
        val prefix = "41%02X".format(pid)
        for (line in reply.lines) {
            val l = if (line.length > 2 && line[1] == ':') line.substring(2) else line
            if (l.startsWith(prefix) && l.length >= prefix.length + 2) return hexBytes(l.substring(prefix.length))
        }
        return null
    }

    // ---- Live waarden ----

    private class Pid(val pid: Int, val key: String, val bytes: Int, val calc: (IntArray) -> Double)

    private val PIDS = mapOf(
        0x0C to Pid(0x0C, "rpm", 2) { ((it[0] * 256 + it[1]) / 4.0).roundToInt().toDouble() },
        0x0D to Pid(0x0D, "speed", 1) { it[0].toDouble() },
        0x05 to Pid(0x05, "coolant", 1) { it[0] - 40.0 },
        0x04 to Pid(0x04, "load", 1) { round1(it[0] * 100.0 / 255) },
        0x0F to Pid(0x0F, "intakeTemp", 1) { it[0] - 40.0 },
        0x11 to Pid(0x11, "throttle", 1) { round1(it[0] * 100.0 / 255) },
        0x2F to Pid(0x2F, "fuel", 1) { round1(it[0] * 100.0 / 255) },
        0x46 to Pid(0x46, "ambient", 1) { it[0] - 40.0 },
        0x5E to Pid(0x5E, "fuelRate", 2) { round2((it[0] * 256 + it[1]) / 20.0) },
        // MAF (g/s) -> geschat verbruik in L/h: MAF*3600 / (14.7 lucht/brandstof * 745 g/L benzine)
        0x10 to Pid(0x10, "fuelRate", 2) { round2((it[0] * 256 + it[1]) / 100.0 * 3600 / (14.7 * 745)) },
        0x42 to Pid(0x42, "voltage", 2) { round2((it[0] * 256 + it[1]) / 1000.0) },
        0x31 to Pid(0x31, "distanceSinceClear", 2) { (it[0] * 256 + it[1]).toDouble() },
    )
    private const val ATRV = -1 // spanning via de adapter zelf (pin 16, accu)

    private fun round1(x: Double) = (x * 10).roundToInt() / 10.0
    private fun round2(x: Double) = (x * 100).roundToInt() / 100.0

    private fun pollLoop(s: Session) {
        val sup = s.supportedPids
        val fast = listOf(0x0C, 0x0D).filter { it in sup }
        val alternate = listOf(0x11, 0x04).filter { it in sup }
        val fuelRate = when { 0x5E in sup -> 0x5E; 0x10 in sup -> 0x10; else -> null }
        val slow = listOf(0x05, 0x0F, 0x2F, 0x46).filter { it in sup } +
            listOf(if (0x42 in sup) 0x42 else ATRV) + listOf(0x31).filter { it in sup }
        val fails = HashMap<String, Int>()
        var cycle = 0
        var timeouts = 0
        var silentCycles = 0
        var carSilent = false
        while (s.alive()) {
            val started = SystemClock.elapsedRealtime()
            if (s.dtcRequested.getAndSet(false)) readDtcElm(s)
            val plan = ArrayList<Int>(fast)
            if (alternate.isNotEmpty()) plan.add(alternate[cycle % alternate.size])
            if (fuelRate != null && cycle % 2 == 0) plan.add(fuelRate)
            plan.add(slow[cycle % slow.size])
            var answered = 0
            var asked = 0
            for (pid in plan) {
                if (!s.alive()) return
                val (key, value, reply) = if (pid == ATRV) {
                    val r = command(s, "ATRV", TIMEOUT)
                    val v = Regex("(\\d+(\\.\\d+)?)").find(r.raw)?.value?.toDoubleOrNull()
                    Triple("voltage", v?.let { round2(it) }, r)
                } else {
                    asked++
                    val def = PIDS.getValue(pid)
                    val r = command(s, "01%02X".format(pid), TIMEOUT)
                    val bytes = pidBytes(r, pid)
                    val v = if (bytes != null && bytes.size >= def.bytes) def.calc(bytes) else null
                    if (v != null) answered++
                    Triple(def.key, v, r)
                }
                if (reply.timedOut) {
                    timeouts++
                    if (timeouts >= 3) throw IOException("Adapter antwoordt niet meer")
                } else timeouts = 0
                if (value != null) {
                    fails[key] = 0
                    setValue(s, key, value)
                } else {
                    val f = (fails[key] ?: 0) + 1
                    fails[key] = f
                    if (f >= 3) setValue(s, key, null)
                }
            }
            // Contact uit of ECU slaapt: de adapter blijft wel verbonden (pin 16 heeft altijd stroom)
            if (asked > 0 && answered == 0) silentCycles++ else silentCycles = 0
            if (silentCycles >= 5 && !carSilent) {
                carSilent = true
                DiagLog.add("info", "OBD2: auto antwoordt niet meer (contact uit?)")
                update(s) { error = "Auto antwoordt niet (contact uit?)"; VALUE_KEYS.filter { it != "voltage" }.forEach { values[it] = null } }
            } else if (silentCycles == 0 && carSilent) {
                carSilent = false
                DiagLog.add("info", "OBD2: auto antwoordt weer")
                update(s) { error = null }
            }
            cycle++
            val spent = SystemClock.elapsedRealtime() - started
            val gap = if (carSilent) 2_000L else MIN_CYCLE
            if (spent < gap) Thread.sleep(gap - spent)
        }
    }

    private fun setValue(s: Session, key: String, value: Double?) {
        val same = synchronized(lock) { values[key] == value }
        if (!same) update(s) { values[key] = value }
    }

    // ---- Foutcodes (modus 03 en 07; modus 04 = wissen bestaat hier bewust niet) ----

    private fun readDtcElm(s: Session) {
        val stored = command(s, "03", TIMEOUT_DTC)
        val pending = command(s, "07", TIMEOUT_DTC)
        val can = s.protocolNum in 6..12
        fun result(r: Reply, mode: Int): List<String>? = when {
            r.ok -> parseDtcs(r, mode, can, s.protocolNum)
            r.error == "NO DATA" -> emptyList() // sommige ECU's: geen codes = geen antwoord
            else -> null
        }
        val st = result(stored, 0x43)
        val pe = result(pending, 0x47)
        if (st == null && pe == null) {
            DiagLog.add("warn", "OBD2: foutcodes niet leesbaar (${stored.error ?: if (stored.timedOut) "time-out" else "?"})")
            return
        }
        update(s) {
            val prev = dtc
            dtc = JSONObject()
                .put("stored", JSONArray(st ?: jsonList(prev?.optJSONArray("stored"))))
                .put("pending", JSONArray(pe ?: jsonList(prev?.optJSONArray("pending"))))
                .put("readAt", System.currentTimeMillis())
        }
        DiagLog.add("info", "OBD2: foutcodes gelezen: opgeslagen ${st?.joinToString().orEmpty().ifEmpty { "geen" }}, " +
            "wachtend ${pe?.joinToString().orEmpty().ifEmpty { "geen" }}")
    }

    private fun jsonList(a: JSONArray?): List<String> = if (a == null) emptyList() else List(a.length()) { a.optString(it) }

    // CAN: "43 NN AABB AABB.." (NN = aantal), meerdere frames als "00A" + "0:..." "1:..."; andere protocollen:
    // "43 AABB CCDD EEFF" per regel (3 codes, aangevuld met 0000)
    private fun parseDtcs(reply: Reply, mode: Int, can: Boolean, protocolNum: Int): List<String> {
        data class Msg(val hex: StringBuilder, val length: Int)
        val messages = ArrayList<Msg>()
        var current: Msg? = null
        for (line in reply.lines) {
            if (line.length == 3) {
                val m = Msg(StringBuilder(), Integer.parseInt(line, 16))
                messages.add(m); current = m
            } else if (line.length > 2 && line[1] == ':') {
                var m = current
                if (m == null) { m = Msg(StringBuilder(), -1); messages.add(m); current = m }
                m.hex.append(line.substring(2))
            } else {
                current = null
                messages.add(Msg(StringBuilder(line), -1))
            }
        }
        val codes = LinkedHashSet<String>()
        for (m in messages) {
            var hex = m.hex.toString()
            if (m.length > 0 && hex.length > m.length * 2) hex = hex.substring(0, m.length * 2)
            val bytes = hexBytes(hex)
            if (bytes.isEmpty() || bytes[0] != mode) continue
            var data = bytes.drop(1)
            val isCan = can || (protocolNum < 0 && data.size % 2 == 1)
            if (isCan && data.isNotEmpty()) {
                val count = data[0]
                data = data.drop(1)
                if (count * 2 <= data.size) data = data.take(count * 2)
            }
            var i = 0
            while (i + 1 < data.size) {
                val a = data[i]; val b = data[i + 1]
                if (a != 0 || b != 0) codes.add(decodeDtc(a, b))
                i += 2
            }
        }
        return codes.toList()
    }

    // Bits 7-6: P/C/B/U, bits 5-4: eerste cijfer, rest: drie hex-cijfers
    private fun decodeDtc(a: Int, b: Int): String =
        "${"PCBU"[a shr 6]}${(a shr 4) and 3}${"%X".format(a and 0x0F)}${"%02X".format(b)}"

    // ---------------- Demo: Golf 6 1.4 TSI ----------------

    private val DEMO_SUPPORTED = listOf("0100", "0104", "0105", "010C", "010D", "010F", "0110", "0111", "0120",
        "012F", "0131", "0140", "0142", "0146")

    private fun runDemo(s: Session) {
        setState(s, "connecting")
        Thread.sleep(600)
        if (!s.alive()) return
        setState(s, "initializing")
        Thread.sleep(900)
        if (!s.alive()) return
        update(s) { protocol = "ISO 15765-4 CAN (11/500)"; supported = DEMO_SUPPORTED }
        s.reachedConnected = true
        setState(s, "connected")
        s.dtcRequested.set(true)

        val rnd = Random()
        val ambient = 8.0
        var coolant = 20.0
        var fuel = 62.0
        var distance = 1_234.0
        var speed = 0.0
        var target = 0.0
        var phase = 0            // 0 stationair, 1 optrekken, 2 constant, 3 afremmen
        var phaseLeft = 8.0
        var dtcAt = SystemClock.elapsedRealtime() + 700
        val dt = 0.25
        fun noise(x: Double) = (rnd.nextDouble() * 2 - 1) * x
        while (s.alive()) {
            if (s.dtcRequested.getAndSet(false)) dtcAt = SystemClock.elapsedRealtime() + 700
            if (dtcAt > 0 && SystemClock.elapsedRealtime() >= dtcAt) {
                dtcAt = 0
                update(s) {
                    dtc = JSONObject().put("stored", JSONArray(listOf("P0420"))).put("pending", JSONArray())
                        .put("readAt", System.currentTimeMillis())
                }
            }
            // Rit: stationair -> optrekken -> constant -> (verder optrekken | afremmen) -> ...
            phaseLeft -= dt
            when (phase) {
                0 -> if (phaseLeft <= 0) { phase = 1; target = 30.0 + rnd.nextInt(71) }
                1 -> if (speed >= target - 1) { phase = 2; phaseLeft = 8.0 + rnd.nextInt(13) }
                2 -> if (phaseLeft <= 0) {
                    if (target < 85 && rnd.nextDouble() < 0.4) { phase = 1; target = min(100.0, target + 15 + rnd.nextInt(30)) }
                    else { phase = 3; target = if (rnd.nextDouble() < 0.6) 0.0 else 30.0 + rnd.nextInt(21) }
                }
                3 -> if (speed <= target + 1) {
                    if (target == 0.0) { phase = 0; phaseLeft = 6.0 + rnd.nextInt(7); speed = 0.0 }
                    else { phase = 2; phaseLeft = 6.0 + rnd.nextInt(10) }
                }
            }
            val diff = target - speed
            val rate = if (diff > 0) 6.0 else 7.0 // km/h per seconde
            val step = min(abs(diff), rate * dt * (0.4 + 0.6 * min(1.0, abs(diff) / 15)))
            speed = (speed + Math.signum(diff) * step + if (phase == 2) noise(0.3) else 0.0).coerceIn(0.0, 100.0)
            val ratio = when { speed < 18 -> 110.0; speed < 32 -> 68.0; speed < 50 -> 46.0; speed < 68 -> 35.0; speed < 85 -> 29.0; else -> 25.0 }
            val idle = 750 + max(0.0, 60 - coolant) * 4 // koude motor draait hoger stationair
            var rpm = if (speed < 1) idle + noise(15.0) else max(idle, speed * ratio + if (phase == 1) 200.0 else 0.0) + noise(20.0)
            rpm = rpm.coerceIn(750.0, 3000.0)
            val throttle = when (phase) { 1 -> 28 + rnd.nextDouble() * 15; 2 -> 16 + speed * 0.08; 3 -> 11.8; else -> 12.5 } + noise(0.4)
            val load = when (phase) { 1 -> 62 + rnd.nextDouble() * 15; 2 -> 30 + speed * 0.15; 3 -> 4.0; else -> 21.0 } + noise(1.0)
            val fuelRate = if (phase == 3 && speed > 20) 0.0 else rpm * load / 100 * 0.0042 + if (coolant < 60) 0.3 else 0.0
            coolant = min(90.0, coolant + (90.4 - coolant) * 0.009 * dt)
            fuel = max(0.0, fuel - fuelRate * dt / 3600 / 55 * 100) // tank 55 L
            distance += speed * dt / 3600
            update(s) {
                values["rpm"] = rpm.roundToInt().toDouble()
                values["speed"] = speed.roundToInt().toDouble()
                values["coolant"] = coolant.roundToInt().toDouble()
                values["load"] = round1(load.coerceIn(0.0, 100.0))
                values["intakeTemp"] = (ambient + 12 + (coolant - 20) * 0.15).roundToInt().toDouble()
                values["throttle"] = round1(throttle.coerceIn(0.0, 100.0))
                values["fuel"] = round1(fuel)
                values["ambient"] = ambient
                values["fuelRate"] = round2(max(0.0, fuelRate))
                values["voltage"] = round2(14.1 + noise(0.03))
                values["distanceSinceClear"] = distance.toInt().toDouble()
            }
            Thread.sleep((dt * 1000).toLong())
        }
    }
}
