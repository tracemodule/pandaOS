package nl.pandaos.launcher

import android.Manifest
import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Looper
import android.provider.CalendarContract
import android.provider.CallLog
import android.provider.ContactsContract
import android.telephony.TelephonyManager
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

// Gegevens van je telefoon voor Telefoon, Agenda en Berichten in PandaOS.
// Android bewaart wat de telefoon via Bluetooth deelt in de gewone opslag van Android: contacten (PBAP) in
// Contacten, gesprekken in de Gesprekslijst. Agenda komt niet via Bluetooth, wel via een Google-account op de radio;
// berichten alleen als de radio ze bewaart. Welke opslag de radio echt vult, laat PhoneData.sources() zien
// (diagnose). Elke lijst vraagt zijn eigen recht (Instellingen > Rechten).
class PhoneData(private val activity: Activity) {

    private val resolver get() = activity.contentResolver
    private fun has(permission: String) = activity.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    // [{"name":"Jan","numbers":[{"label":"mobiel","number":"06..."}],"source":"phone|google|radio"}]
    // Standaard alleen contacten van de telefoon (Bluetooth-telefoonboek, PBAP) en van de radio zelf; die van een
    // Google-account op de radio alleen met includeGoogle (Instellingen > Bluetooth).
    fun contactsJson(includeGoogle: Boolean = false): String {
        if (!has(Manifest.permission.READ_CONTACTS)) return "[]"
        val byName = LinkedHashMap<String, JSONArray>()
        val sources = HashMap<String, String>()
        try {
            resolver.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER,
                    ContactsContract.CommonDataKinds.Phone.TYPE, ContactsContract.CommonDataKinds.Phone.LABEL,
                    ContactsContract.RawContacts.ACCOUNT_TYPE),
                if (includeGoogle) null else "(${ContactsContract.RawContacts.ACCOUNT_TYPE} IS NULL OR ${ContactsContract.RawContacts.ACCOUNT_TYPE} NOT LIKE 'com.google%')",
                null, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " COLLATE NOCASE ASC")?.use { c ->
                while (c.moveToNext() && byName.size < 2000) {
                    val name = c.getString(0) ?: continue
                    val number = c.getString(1) ?: continue
                    val label = ContactsContract.CommonDataKinds.Phone.getTypeLabel(activity.resources, c.getInt(2), c.getString(3)).toString()
                    val account = c.getString(4) ?: ""
                    sources.getOrPut(name) { when {
                        Regex("bluetooth|pbap", RegexOption.IGNORE_CASE).containsMatchIn(account) -> "phone"
                        account.startsWith("com.google") -> "google"
                        else -> "radio"
                    } }
                    val numbers = byName.getOrPut(name) { JSONArray() }
                    var duplicate = false
                    for (i in 0 until numbers.length()) if (numbers.getJSONObject(i).getString("number").replace(" ", "") == number.replace(" ", "")) duplicate = true
                    if (!duplicate) numbers.put(JSONObject().put("label", label).put("number", number))
                }
            }
        } catch (e: Exception) { DiagLog.add("error", "Contacten lezen: ${e.message}") }
        val out = JSONArray()
        byName.forEach { (name, numbers) -> out.put(JSONObject().put("name", name).put("numbers", numbers).put("source", sources[name] ?: "radio")) }
        return out.toString()
    }

    // [{"name":"Jan","number":"06...","type":"incoming|outgoing|missed","time":1700000000000}]
    // Soort uit de Gesprekslijst: 2 = uitgaand; 3 gemist, 5 geweigerd en 6 geblokkeerd = gemist (rood); de rest
    // (1 inkomend, 4 voicemail, 7 elders beantwoord) = inkomend
    fun recentsJson(): String {
        if (!has(Manifest.permission.READ_CALL_LOG)) return "[]"
        val out = JSONArray()
        try {
            resolver.query(CallLog.Calls.CONTENT_URI,
                arrayOf(CallLog.Calls.CACHED_NAME, CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE),
                null, null, CallLog.Calls.DATE + " DESC")?.use { c ->
                while (c.moveToNext() && out.length() < 100) {
                    val type = when (c.getInt(2)) {
                        CallLog.Calls.OUTGOING_TYPE -> "outgoing"
                        CallLog.Calls.MISSED_TYPE, CallLog.Calls.REJECTED_TYPE, CallLog.Calls.BLOCKED_TYPE -> "missed"
                        else -> "incoming"
                    }
                    val number = c.getString(1) ?: ""
                    out.put(JSONObject().put("name", c.getString(0) ?: number).put("number", number).put("type", type).put("time", c.getLong(3)))
                }
            }
        } catch (e: Exception) { DiagLog.add("error", "Gesprekslijst lezen: ${e.message}") }
        return out.toString()
    }

    // Afspraken van nu tot over `days` dagen: [{"title","start","end","allDay","location","calendar","color"}]
    fun calendarJson(days: Int): String {
        if (!has(Manifest.permission.READ_CALENDAR)) return "[]"
        val out = JSONArray()
        val now = System.currentTimeMillis()
        val begin = now - 12L * 3600_000
        val end = now + days.coerceIn(1, 60) * 86_400_000L
        try {
            val uri = CalendarContract.Instances.CONTENT_URI.buildUpon().also {
                android.content.ContentUris.appendId(it, begin)
                android.content.ContentUris.appendId(it, end)
            }.build()
            resolver.query(uri,
                arrayOf(CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN, CalendarContract.Instances.END,
                    CalendarContract.Instances.ALL_DAY, CalendarContract.Instances.EVENT_LOCATION,
                    CalendarContract.Instances.CALENDAR_DISPLAY_NAME, CalendarContract.Instances.DISPLAY_COLOR),
                null, null, CalendarContract.Instances.BEGIN + " ASC")?.use { c ->
                while (c.moveToNext() && out.length() < 200) {
                    out.put(JSONObject().put("title", c.getString(0) ?: "").put("start", c.getLong(1)).put("end", c.getLong(2))
                        .put("allDay", c.getInt(3) == 1).put("location", c.getString(4) ?: "")
                        .put("calendar", c.getString(5) ?: "").put("color", String.format("#%06X", 0xFFFFFF and c.getInt(6))))
                }
            }
        } catch (e: Exception) { DiagLog.add("error", "Agenda lezen: ${e.message}") }
        return out.toString()
    }

    // Laatste berichten per gesprek: [{"name","number","text","time","incoming","read"}]
    fun messagesJson(): String {
        if (!has(Manifest.permission.READ_SMS)) return "[]"
        val out = JSONArray()
        try {
            resolver.query(Uri.parse("content://sms"), arrayOf("address", "body", "date", "type", "read"),
                null, null, "date DESC")?.use { c ->
                while (c.moveToNext() && out.length() < 300) {
                    val number = c.getString(0) ?: continue
                    out.put(JSONObject().put("number", number).put("name", contactName(number) ?: number)
                        .put("text", c.getString(1) ?: "").put("time", c.getLong(2))
                        .put("incoming", c.getInt(3) == 1).put("read", c.getInt(4) == 1))
                }
            }
        } catch (e: Exception) { DiagLog.add("error", "Berichten lezen: ${e.message}") }
        return out.toString()
    }

    private fun contactName(number: String): String? = try {
        if (!has(Manifest.permission.READ_CONTACTS)) null
        else resolver.query(Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number)),
            arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
    } catch (_: Exception) { null }

    // Recent gesprek verwijderen (vegen in Telefoon > Recent)
    fun deleteCall(number: String, time: Long): Boolean {
        if (!has(Manifest.permission.WRITE_CALL_LOG)) return false
        return try {
            resolver.delete(CallLog.Calls.CONTENT_URI, "${CallLog.Calls.NUMBER}=? AND ${CallLog.Calls.DATE}=?", arrayOf(number, time.toString())) > 0
        } catch (e: Exception) { DiagLog.add("error", "Gesprek verwijderen: ${e.message}"); false }
    }

    // Contact toevoegen vanuit PandaOS: op de radio zelf (geen account), dus zichtbaar bij Contacten en in Android
    fun addContact(name: String, number: String): Boolean {
        if (!has(Manifest.permission.WRITE_CONTACTS) || name.isBlank() || number.isBlank()) return false
        return try {
            val ops = arrayListOf(
                android.content.ContentProviderOperation.newInsert(ContactsContract.RawContacts.CONTENT_URI)
                    .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, null)
                    .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, null).build(),
                android.content.ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                    .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                    .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE)
                    .withValue(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, name.trim()).build(),
                android.content.ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                    .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                    .withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE)
                    .withValue(ContactsContract.CommonDataKinds.Phone.NUMBER, number.trim())
                    .withValue(ContactsContract.CommonDataKinds.Phone.TYPE, ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE).build(),
            )
            resolver.applyBatch(ContactsContract.AUTHORITY, ops)
            true
        } catch (e: Exception) { DiagLog.add("error", "Contact toevoegen: ${e.message}"); false }
    }

    // --- Bellen ---
    // Op de radio (Jancar) deed Android's eigen bellen niets: ACTION_CALL gaat naar Telecom, en Telecom weigert stil op
    // een apparaat zonder telefoonfunctie (geen simkaart, niet "voice capable"). startActivity lukte wel, dus PandaOS
    // dacht dat er gebeld werd. De telefoon hangt hier aan de Bluetooth-app van de fabrikant (com.jancar.bluetooth met
    // com.jancar.btservice), niet aan Android's HFP. Daarom deze volgorde:
    // 1. de Bluetooth-/telefoon-app van de radio, als die tel:-links opent (ACTION_CALL, anders ACTION_DIAL)
    // 2. Android zelf, alleen als het apparaat kan bellen (telefoon met simkaart, emulator)
    // 3. het belscherm van de Bluetooth-app (activiteit met dial/keypad/phone in de naam), nummer als extra's
    // 4. de Bluetooth-app zelf openen (nummer niet ingevuld)
    // preferredPackage = de app bij Instellingen > Apps > Telefoon (of null).
    // Antwoord: {"ok":true,"via":"bt-call|bt-dial|call|dial|bt-dialer|bt-app"} of {"ok":false,"error":"empty|no-dialer|failed"}
    // Privacy: nooit het nummer of een naam loggen (repo en diagnoselogboek zijn openbaar), alleen het aantal cijfers.
    // Ook geen e.message: daar kan de intent met het nummer in staan.
    fun dial(number: String, preferredPackage: String? = null): JSONObject {
        val clean = number.filter { it.isDigit() || it == '+' || it == '*' || it == '#' }
        val what = "nummer (${clean.count { it.isDigit() }} cijfers)"
        if (clean.isEmpty()) return dialFail("empty", "Bellen: geen geldig nummer")
        val uri = Uri.fromParts("tel", clean, null)
        val canCall = has(Manifest.permission.CALL_PHONE)
        val pm = activity.packageManager
        val btPackages = phonePackages(preferredPackage)
        logDialSetupOnce(uri, btPackages, canCall)

        // 1. De Bluetooth-app van de radio opent tel:-links zelf
        for (pkg in btPackages) {
            val actions = listOfNotNull(if (canCall) Intent.ACTION_CALL to "bt-call" else null, Intent.ACTION_DIAL to "bt-dial")
            for ((action, via) in actions) {
                val intent = Intent(action, uri).setPackage(pkg)
                if (pm.resolveActivity(intent, 0) != null && startCallIntent(intent)) return dialOk(via, "$what via $pkg (${action.substringAfterLast('.')})")
            }
        }
        // 2. Android zelf, alleen als dit apparaat echt kan bellen
        if (isVoiceCapable()) {
            val intent = Intent(if (canCall) Intent.ACTION_CALL else Intent.ACTION_DIAL, uri)
            if (pm.resolveActivity(intent, 0) != null && startCallIntent(intent)) return dialOk(if (canCall) "call" else "dial", "$what via Android")
        }
        // 3. Belscherm van de Bluetooth-app; of het nummer wordt ingevuld hangt van die app af
        for (pkg in btPackages) {
            val component = dialerActivity(pkg) ?: continue
            val intent = Intent(Intent.ACTION_DIAL, uri).setComponent(component)
                .putExtra("number", clean).putExtra("phone_number", clean).putExtra("phoneNumber", clean).putExtra("tel", clean)
            if (startCallIntent(intent)) return dialOk("bt-dialer", "$what: belscherm ${component.flattenToShortString()} geopend")
        }
        // 4. Alleen de Bluetooth-app openen
        for (pkg in btPackages) {
            val intent = pm.getLaunchIntentForPackage(pkg) ?: continue
            if (startCallIntent(intent)) return dialOk("bt-app", "$what: Bluetooth-app $pkg geopend, nummer niet ingevuld")
        }
        return dialFail(if (btPackages.isEmpty()) "no-dialer" else "failed",
            "Bellen naar $what mislukt: geen app op de radio die kan bellen (voice capable: ${isVoiceCapable()})")
    }

    private fun dialOk(via: String, log: String) = JSONObject().put("ok", true).put("via", via).also { DiagLog.add("info", "Bellen: $log") }
    private fun dialFail(error: String, log: String) = JSONObject().put("ok", false).put("error", error).also { DiagLog.add("error", log) }

    private fun isVoiceCapable(): Boolean = try {
        (activity.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager)?.isVoiceCapable == true
    } catch (_: Exception) { false }

    // Apps op de radio die bellen via Bluetooth: de gekozen Telefoon-app, Jancar's Bluetooth-app, en apps met
    // bt-phone/bluetooth/handsfree in de naam. Niet de Bluetooth-stack van Android en niet Jancar's btservice (dienst).
    private var installedPhonePackages: List<String>? = null
    private fun phonePackages(preferred: String?): List<String> {
        val pm = activity.packageManager
        val found = installedPhonePackages ?: try {
            val names = pm.getInstalledApplications(0).map { it.packageName }
            val pattern = Regex("bt ?phone|btphone|bluetooth|handsfree|jancar.*\\.bt", RegexOption.IGNORE_CASE)
            (listOf("com.jancar.bluetooth").filter { it in names } +
                names.filter { pattern.containsMatchIn(it) && !it.startsWith("com.android.") && !it.startsWith("com.google.") &&
                    !it.startsWith("android") && !it.contains("service", ignoreCase = true) })
                .distinct().also { installedPhonePackages = it }
        } catch (_: Exception) { emptyList() }
        val systemTelecom = setOf("com.android.server.telecom", "com.android.phone", activity.packageName)
        return (listOfNotNull(preferred?.takeIf { it.isNotBlank() && it !in systemTelecom }) + found).distinct()
    }

    // Belscherm in een app: zichtbare activiteit met dial/keypad in de naam, anders "phone" (niet het gesprek-,
    // muziek- of instellingenscherm)
    private fun dialerActivity(pkg: String): ComponentName? = try {
        val skip = Regex("incall|in_call|calling|talk|music|setting|record|calllog|contact|sms|message|pair|search|device", RegexOption.IGNORE_CASE)
        val usable = (activity.packageManager.getPackageInfo(pkg, PackageManager.GET_ACTIVITIES).activities ?: emptyArray())
            .filter { it.exported && it.permission == null && !skip.containsMatchIn(it.name) }
        (usable.firstOrNull { Regex("dial|keypad|keyboard|numpad", RegexOption.IGNORE_CASE).containsMatchIn(it.name.substringAfterLast('.')) }
            ?: usable.firstOrNull { Regex("phone", RegexOption.IGNORE_CASE).containsMatchIn(it.name.substringAfterLast('.')) })
            ?.let { ComponentName(pkg, it.name) }
    } catch (_: Exception) { null }

    // Eenmalig in het diagnoselogboek: wat deze radio kan, om het bellen op de radio te kunnen uitzoeken
    private var dialSetupLogged = false
    private fun logDialSetupOnce(uri: Uri, btPackages: List<String>, canCall: Boolean) {
        if (dialSetupLogged) return
        dialSetupLogged = true
        try {
            val pm = activity.packageManager
            fun handlers(action: String) = pm.queryIntentActivities(Intent(action, uri), 0)
                .joinToString { "${it.activityInfo.packageName}/${it.activityInfo.name.substringAfterLast('.')}" }.ifEmpty { "geen" }
            DiagLog.add("info", "Bellen: voice capable ${isVoiceCapable()}, recht CALL_PHONE $canCall, " +
                "tel: CALL → ${handlers(Intent.ACTION_CALL)}, DIAL → ${handlers(Intent.ACTION_DIAL)}, " +
                "Bluetooth-apps: ${btPackages.ifEmpty { listOf("geen") }.joinToString()}" +
                btPackages.firstOrNull()?.let { ", belscherm: ${dialerActivity(it)?.flattenToShortString() ?: "geen"}" }.orEmpty())
        } catch (_: Exception) {}
    }

    // Starten op de UI-thread (de bridge roept aan vanaf zijn eigen thread) en wachten op het resultaat
    private fun startCallIntent(intent: Intent): Boolean {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Looper.myLooper() == Looper.getMainLooper()) return tryStart(intent)
        var result = false
        val done = CountDownLatch(1)
        activity.runOnUiThread { result = tryStart(intent); done.countDown() }
        done.await(2, TimeUnit.SECONDS)
        return result
    }

    private fun tryStart(intent: Intent): Boolean = try { activity.startActivity(intent); true } catch (e: Exception) {
        DiagLog.add("warn", "Bellen: ${intent.component?.flattenToShortString() ?: intent.`package` ?: "Android"} weigert (${e.javaClass.simpleName})")
        false
    }

    // Diagnose: welke opslag op deze radio is gevuld, en welke apps van de radio bieden zelf gegevens aan
    // (de Bluetooth-app van de fabrikant kan een eigen telefoonboek hebben)
    fun sourcesJson(): String {
        fun count(uri: Uri, permission: String): Int = if (!has(permission)) -1 else try {
            resolver.query(uri, arrayOf("_id"), null, null, null)?.use { it.count } ?: -1
        } catch (_: Exception) { -1 }
        val providers = JSONArray()
        try {
            for (info in activity.packageManager.getInstalledPackages(PackageManager.GET_PROVIDERS)) {
                for (p in info.providers ?: emptyArray()) {
                    val authority = p.authority ?: continue
                    if (Regex("bt|blue|phone|contact|call|sms|mms|message|calendar|music", RegexOption.IGNORE_CASE).containsMatchIn(authority) &&
                        !authority.startsWith("com.android.") && !authority.startsWith("com.google.")) providers.put(authority)
                }
            }
        } catch (_: Exception) {}
        return JSONObject()
            .put("contacts", count(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, Manifest.permission.READ_CONTACTS))
            .put("calls", count(CallLog.Calls.CONTENT_URI, Manifest.permission.READ_CALL_LOG))
            .put("calendarEvents", count(CalendarContract.Events.CONTENT_URI, Manifest.permission.READ_CALENDAR))
            .put("sms", count(Uri.parse("content://sms"), Manifest.permission.READ_SMS))
            .put("providers", providers)
            .toString()
    }
}
