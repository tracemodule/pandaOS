package nl.pandaos.launcher

import android.app.Activity
import android.content.Context
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject

// CAN-koppelingen (CAN-monitor > Koppelen): een regel uit het logboek of een broadcast van de radio koppelen aan
// een functie van PandaOS (achteruit, deur linksvoor open, dimlicht aan, snelheid ...). Zelf geleerd in de auto:
// "Leren" → handeling doen (deur open) → de nieuwe regel kiezen. De koppelingen staan op de radio (SharedPreferences)
// en werken altijd, ook als de CAN-monitor dicht is (de monitor leest dan op de achtergrond mee).
//
// Koppeling: {"id":"..","func":"door_fl","action":"on|off|value","match":"tekst in de regel","source":"logcat|broadcast"}
//  - on/off: bevat de regel de tekst, dan gaat de functie aan/uit
//  - value: het eerste getal ná de tekst is de waarde (snelheid, brandstof, temperatuur)
// De webapp vertaalt functies naar de auto in PandaOS (client/src/services/canSignals.ts).
class CanLinks(private val activity: Activity, private val send: (String) -> Unit) {

    private data class Link(val id: String, val func: String, val action: String, val match: String, val source: String)

    @Volatile private var links: List<Link> = load()
    private val lastSent = HashMap<String, Pair<String, Long>>() // func -> (waarde, tijd): niet elke regel doorsturen
    private val number = Regex("-?\\d+(?:[.,]\\d+)?")

    private fun prefs() = activity.getSharedPreferences("pandaos_canlinks", Context.MODE_PRIVATE)

    private fun load(): List<Link> = try {
        val array = JSONArray(prefs().getString("links", "[]"))
        (0 until array.length()).map { i ->
            val o = array.getJSONObject(i)
            Link(o.optString("id"), o.optString("func"), o.optString("action", "on"), o.optString("match"), o.optString("source", "logcat"))
        }.filter { it.match.isNotBlank() && it.func.isNotBlank() }
    } catch (_: Exception) { emptyList() }

    fun json(): String = prefs().getString("links", "[]") ?: "[]"

    fun save(json: String): Boolean = try {
        JSONArray(json) // controleren
        prefs().edit().putString("links", json).apply()
        links = load()
        DiagLog.add("info", "CAN-koppelingen opgeslagen: ${links.size}")
        true
    } catch (_: Exception) { false }

    val isEmpty get() = links.isEmpty()
    val broadcastActions get() = links.filter { it.source == "broadcast" }.map { it.match }.distinct()

    // Bij het opstarten van PandaOS: de stand van vóór de start overnemen (bijv. dimlicht al aan bij het starten van de
    // auto). De monitor leest pas mee vanaf nu; hier eenmalig het logboek dat er al is doorlopen en per functie alleen
    // de laatste regel doorsturen. Het live meelezen (check) verandert niet.
    fun replayLastState() {
        val current = links.filter { it.source == "logcat" }
        if (current.isEmpty()) return
        if (activity.checkSelfPermission(android.Manifest.permission.READ_LOGS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return
        Thread {
            val last = LinkedHashMap<String, String>() // func -> laatste passende regel
            try {
                val process = Runtime.getRuntime().exec(arrayOf("logcat", "-d", "-v", "brief"))
                java.io.BufferedReader(java.io.InputStreamReader(process.inputStream)).use { reader ->
                    while (true) {
                        val line = reader.readLine() ?: break
                        for (link in current) if (line.contains(link.match, ignoreCase = true)) last[link.func] = line
                    }
                }
            } catch (_: Exception) { return@Thread }
            if (last.isEmpty()) return@Thread
            DiagLog.add("info", "Stand bij het opstarten overgenomen: ${last.keys.joinToString()}")
            for (line in last.values) check("logcat", line)
        }.apply { isDaemon = true; start() }
    }

    // Elke regel van de monitor (logcat-regel of naam van de broadcast)
    fun check(source: String, text: String) {
        val current = links
        if (current.isEmpty()) return
        for (link in current) {
            if (link.source != source) continue
            val index = if (source == "broadcast") (if (text.equals(link.match, ignoreCase = true)) 0 else -1)
                else text.indexOf(link.match, ignoreCase = true)
            if (index < 0) continue
            val value: String = when (link.action) {
                "value" -> number.find(text, (index + link.match.length).coerceAtMost(text.length))?.value?.replace(',', '.') ?: continue
                else -> link.action
            }
            // Zelfde waarde binnen 1 s niet opnieuw sturen (snelheid komt soms vele keren per seconde)
            val now = SystemClock.uptimeMillis()
            synchronized(lastSent) {
                val last = lastSent[link.func]
                if (last != null && last.first == "${link.action}:$value" && now - last.second < 1000) return@synchronized null
                lastSent[link.func] = "${link.action}:$value" to now
                Unit
            } ?: continue
            val payload = JSONObject().put("func", link.func).put("action", link.action).put("value", value).put("id", link.id)
            activity.runOnUiThread { send("canSignal($payload)") }
        }
    }
}
