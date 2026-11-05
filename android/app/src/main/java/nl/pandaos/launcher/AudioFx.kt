package nl.pandaos.launcher

import android.content.Context
import android.content.Intent
import android.media.audiofx.Equalizer
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

// Klank voor alle geluid van de radio (Muziek > Audio-instellingen > Toon).
// Android-equalizer op de algemene uitgang (sessie 0): werkt voor elke app die geluid maakt, op apparaten die dat
// toestaan. De zes PandaOS-banden (sub, bas, laag-midden, midden, hoog-midden, hoog) worden verdeeld over de
// banden die het apparaat heeft. Balans en fader kent Android 9 niet: dat kan alleen de geluidsapp van de radio.
//
// Bronnen (Audio-instellingen > Bronnen): de apps van de radio voor FM/DAB, Bluetooth-muziek, USB, AV-in en
// Spotify, herkend aan pakketnaam of naam (verschilt per radio).
class AudioFx(private val context: Context) {
    private var eq: Equalizer? = null

    // Middenfrequentie (Hz) van de zes PandaOS-banden
    private val pandaBands = doubleArrayOf(60.0, 150.0, 400.0, 1000.0, 3000.0, 10000.0)

    private fun equalizer(): Equalizer? {
        eq?.let { return it }
        return try {
            Equalizer(1000, 0).also { eq = it }
        } catch (e: Throwable) {
            Log.w(TAG, "Equalizer op sessie 0 niet beschikbaar: ${e.message}")
            null
        }
    }

    // Zes waarden in dB (-6 … +6). Elke apparaatband krijgt de waarde van de dichtstbijzijnde PandaOS-band
    // (op een logaritmische schaal), begrensd op wat de band aankan.
    fun apply(levelsDb: DoubleArray): Boolean {
        val e = equalizer() ?: return false
        return try {
            val range = e.bandLevelRange // millibel
            val flat = levelsDb.all { it == 0.0 }
            e.enabled = !flat
            for (band in 0 until e.numberOfBands) {
                val centerHz = e.getCenterFreq(band.toShort()) / 1000.0
                val nearest = pandaBands.indices.minByOrNull { Math.abs(Math.log(pandaBands[it]) - Math.log(centerHz.coerceAtLeast(1.0))) } ?: 0
                val mb = (levelsDb[nearest] * 100).toInt().coerceIn(range[0].toInt(), range[1].toInt())
                e.setBandLevel(band.toShort(), mb.toShort())
            }
            true
        } catch (ex: Throwable) {
            Log.w(TAG, "Equalizer instellen mislukt: ${ex.message}")
            false
        }
    }

    fun stateJson(): String {
        val e = equalizer()
        val json = JSONObject()
        json.put("eq", e != null)
        if (e != null) {
            try {
                json.put("bands", e.numberOfBands.toInt())
                val freqs = JSONArray()
                for (b in 0 until e.numberOfBands) freqs.put(e.getCenterFreq(b.toShort()) / 1000)
                json.put("freqs", freqs)
                json.put("enabled", e.enabled)
            } catch (_: Throwable) { }
        }
        json.put("balance", false) // Android 9 heeft geen balans/fader voor alle geluid
        json.put("radioSoundApp", radioSoundIntent() != null)
        return json.toString()
    }

    // De geluidsapp van de radio (Jancar: com.jancar.audiosettings), voor balans/fader en de eigen equalizer
    fun radioSoundIntent(): Intent? {
        val pm = context.packageManager
        val known = listOf("com.jancar.audiosettings", "com.jancar.sound", "com.android.audiosettings")
        for (pkg in known) pm.getLaunchIntentForPackage(pkg)?.let { return it }
        return try {
            Intent().setClassName("com.jancar.audiosettings", "com.jancar.audiosettings.ui.activity.MainActivity")
                .takeIf { pm.resolveActivity(it, 0) != null }
        } catch (_: Throwable) { null }
    }

    // Bronnen: per soort de eerste app die past (pakketnaam of naam)
    fun sourcesJson(): String {
        val pm = context.packageManager
        val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val apps = pm.queryIntentActivities(launcher, 0).map {
            it.activityInfo.packageName to (it.loadLabel(pm)?.toString() ?: it.activityInfo.packageName)
        }.distinctBy { it.first }
        val kinds = listOf(
            "radio" to Regex("""\b(fm|am|dab\+?|radio|tuner)\b|jancar\.radio|\.radio$|\.fm$|\.dab""", RegexOption.IGNORE_CASE),
            "bluetooth" to Regex("""bt ?music|btmusic|bluetooth ?music|a2dp|jancar\.(bt|bluetooth)""", RegexOption.IGNORE_CASE),
            "usb" to Regex("""\busb\b|jancar\.(media|music|player)|\bmedia ?player\b|\bmusic ?player\b""", RegexOption.IGNORE_CASE),
            "avin" to Regex("""av ?in|\baux\b|avin|jancar\.(av|aux)""", RegexOption.IGNORE_CASE),
            "spotify" to Regex("""^com\.spotify\.music$""", RegexOption.IGNORE_CASE),
        )
        val out = JSONArray()
        for ((kind, pattern) in kinds) {
            val hits = apps.filter { (pkg, label) -> pkg != context.packageName && (pattern.containsMatchIn(pkg) || pattern.containsMatchIn(label)) }
            for ((pkg, label) in hits.take(2)) {
                out.put(JSONObject().put("kind", kind).put("package", pkg).put("name", label))
            }
        }
        return out.toString()
    }

    fun release() { try { eq?.release() } catch (_: Throwable) { }; eq = null }

    companion object { private const val TAG = "PandaAudioFx" }
}
