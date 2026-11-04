package nl.pandaos.launcher

import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.ScanResult
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import org.json.JSONArray
import org.json.JSONObject

// Wifi en Bluetooth van de radio, voor de eigen PandaOS-schermen (Settings > Wi-Fi / Bluetooth).
// Zelf verbinden met wifi mag een gewone app alleen als hij voor Android 9 (targetSdk 28) is gemaakt; daarom staat
// de launcher op targetSdk 28 (zie app/build.gradle.kts). Dezelfde drivers als de schermen van de fabrikant.
@SuppressLint("MissingPermission")
@Suppress("DEPRECATION")
class RadioConnectivity(private val activity: Activity, private val send: (String) -> Unit) {

    private val wifi = activity.applicationContext.getSystemService(WifiManager::class.java)
    private val connectivity = activity.getSystemService(ConnectivityManager::class.java)
    private val bluetooth: BluetoothAdapter? = activity.getSystemService(BluetoothManager::class.java)?.adapter

    // Apparaten in de buurt die tijdens het zoeken gevonden zijn (adres -> naam)
    private val nearby = linkedMapOf<String, String>()
    private val profiles = mutableMapOf<Int, BluetoothProfile>()

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val device: BluetoothDevice = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE) ?: return
            when (intent.action) {
                BluetoothDevice.ACTION_FOUND -> nearby[device.address] = device.name ?: device.address
                // Telefoon verbonden of weg: de webapp beslist wat er gebeurt (bijv. CarPlay automatisch openen)
                BluetoothDevice.ACTION_ACL_CONNECTED -> send("bluetoothConnected(${deviceJson(device)})")
                BluetoothDevice.ACTION_ACL_DISCONNECTED -> send("bluetoothDisconnected(${deviceJson(device)})")
            }
        }
    }

    // {"name":"iPhone","address":"..","phone":true}
    private fun deviceJson(device: BluetoothDevice) = JSONObject()
        .put("name", device.name ?: device.address)
        .put("address", device.address)
        .put("phone", device.bluetoothClass?.majorDeviceClass == android.bluetooth.BluetoothClass.Device.Major.PHONE)
        .toString()

    fun start() {
        activity.registerReceiver(receiver, IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
            addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
        })
        // Profielen voor verbonden/verbinden: A2DP/headset (telefoon-kant) en A2DP-sink/headset-client (radio-kant)
        for (profile in listOf(BluetoothProfile.A2DP, BluetoothProfile.HEADSET, PROFILE_A2DP_SINK, PROFILE_HEADSET_CLIENT)) {
            try {
                bluetooth?.getProfileProxy(activity, object : BluetoothProfile.ServiceListener {
                    override fun onServiceConnected(p: Int, proxy: BluetoothProfile) { profiles[p] = proxy }
                    override fun onServiceDisconnected(p: Int) { profiles.remove(p) }
                }, profile)
            } catch (_: Exception) { /* profiel bestaat niet op dit apparaat */ }
        }
    }

    fun stop() {
        try { activity.unregisterReceiver(receiver) } catch (_: Exception) {}
        profiles.forEach { (p, proxy) -> bluetooth?.closeProfileProxy(p, proxy) }
        profiles.clear()
    }

    // ---------------- Wifi ----------------

    fun setWifiEnabled(on: Boolean): Boolean = wifi?.setWifiEnabled(on) ?: false

    fun startWifiScan(): Boolean = wifi?.startScan() ?: false

    // {"enabled":true,"connected":true,"ssid":"Thuis","level":3,"networks":[{"ssid":"Thuis","level":3,"secure":true,"saved":true,"connected":true}]}
    fun wifiState(): String {
        val manager = wifi ?: return JSONObject().put("enabled", false).toString()
        val onWifi = connectivity?.getNetworkCapabilities(connectivity.activeNetwork)
            ?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        val current = if (onWifi) cleanSsid(manager.connectionInfo?.ssid) else null
        val result = JSONObject().put("enabled", manager.isWifiEnabled).put("connected", onWifi)
            .put("ssid", current ?: JSONObject.NULL)
            .put("level", if (onWifi) WifiManager.calculateSignalLevel(manager.connectionInfo?.rssi ?: -100, 5) else 0)
        val saved = savedNetworks().keys
        // Per netwerknaam het sterkste signaal; verborgen netwerken (zonder naam) overslaan
        val networks = manager.scanResults.orEmpty()
            .filter { it.SSID.isNotBlank() }
            .groupBy { it.SSID }
            .map { (ssid, list) -> ssid to list.maxBy { it.level } }
            .sortedWith(compareByDescending<Pair<String, ScanResult>> { it.first == current }.thenByDescending { it.second.level })
        val array = JSONArray()
        networks.forEach { (ssid, scan) ->
            array.put(JSONObject()
                .put("ssid", ssid)
                .put("level", WifiManager.calculateSignalLevel(scan.level, 5))
                .put("secure", security(scan) != Security.OPEN)
                .put("saved", ssid in saved)
                .put("connected", ssid == current))
        }
        return result.put("networks", array).toString()
    }

    // Verbinden: opgeslagen netwerk opnieuw gebruiken, anders toevoegen met het wachtwoord
    fun connectWifi(ssid: String, password: String?): Boolean {
        val manager = wifi ?: return false
        val existing = savedNetworks()[ssid]
        val networkId = if (existing != null && password.isNullOrEmpty()) existing else {
            existing?.let { manager.removeNetwork(it) }
            val scan = manager.scanResults.orEmpty().filter { it.SSID == ssid }.maxByOrNull { it.level }
            val config = WifiConfiguration().apply {
                SSID = "\"$ssid\""
                when (scan?.let { security(it) } ?: if (password.isNullOrEmpty()) Security.OPEN else Security.WPA) {
                    Security.OPEN -> allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
                    Security.WEP -> {
                        allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
                        wepKeys[0] = "\"$password\""
                        wepTxKeyIndex = 0
                    }
                    Security.WPA -> preSharedKey = "\"$password\""
                }
            }
            manager.addNetwork(config)
        }
        if (networkId == -1) return false
        manager.disconnect()
        val ok = manager.enableNetwork(networkId, true)
        manager.reconnect()
        return ok
    }

    fun forgetWifi(ssid: String): Boolean {
        val manager = wifi ?: return false
        val id = savedNetworks()[ssid] ?: return false
        val ok = manager.removeNetwork(id)
        manager.saveConfiguration()
        return ok
    }

    private fun savedNetworks(): Map<String, Int> = try {
        wifi?.configuredNetworks.orEmpty().associate { (cleanSsid(it.SSID) ?: "") to it.networkId }
    } catch (_: SecurityException) { emptyMap() }

    private enum class Security { OPEN, WEP, WPA }
    private fun security(scan: ScanResult): Security = when {
        scan.capabilities.contains("WEP") -> Security.WEP
        scan.capabilities.contains("PSK") || scan.capabilities.contains("SAE") || scan.capabilities.contains("EAP") -> Security.WPA
        else -> Security.OPEN
    }

    private fun cleanSsid(raw: String?) = raw?.trim('"')?.takeIf { it.isNotEmpty() && it != "<unknown ssid>" }

    // ---------------- Bluetooth ----------------

    fun setBluetoothEnabled(on: Boolean): Boolean = bluetooth?.let { if (on) it.enable() else it.disable() } ?: false

    fun startDiscovery(): Boolean {
        val adapter = bluetooth ?: return false
        nearby.clear()
        if (adapter.isDiscovering) adapter.cancelDiscovery()
        return adapter.startDiscovery()
    }

    // {"available":true,"enabled":true,"name":"Radio","discovering":false,"devices":[..gekoppeld..],"nearby":[..]}
    fun bluetoothState(): String {
        val adapter = bluetooth ?: return JSONObject().put("available", false).toString()
        val result = JSONObject().put("available", true).put("enabled", adapter.isEnabled)
            .put("permission", true).put("name", adapter.name ?: "").put("discovering", adapter.isDiscovering)
        val bonded = adapter.bondedDevices.orEmpty()
        val devices = JSONArray()
        bonded.sortedBy { it.name ?: "" }.forEach { device ->
            devices.put(JSONObject().put("name", device.name ?: device.address).put("address", device.address)
                .put("connected", isConnected(device))
                .put("phone", device.bluetoothClass?.majorDeviceClass == android.bluetooth.BluetoothClass.Device.Major.PHONE))
        }
        val bondedAddresses = bonded.map { it.address }.toSet()
        val found = JSONArray()
        nearby.filterKeys { it !in bondedAddresses }.forEach { (address, name) ->
            val bonding = adapter.getRemoteDevice(address).bondState == BluetoothDevice.BOND_BONDING
            found.put(JSONObject().put("name", name).put("address", address).put("pairing", bonding))
        }
        return result.put("devices", devices).put("nearby", found).toString()
    }

    // Koppelen: Android toont zelf de bevestiging met de code (dat mag alleen het systeem)
    fun pair(address: String): Boolean {
        val adapter = bluetooth ?: return false
        adapter.cancelDiscovery()
        return adapter.getRemoteDevice(address).createBond()
    }

    // Vergeten (ontkoppelen): verborgen methode, werkt op vrijwel alle versies
    fun unpair(address: String): Boolean = try {
        val device = bluetooth?.getRemoteDevice(address) ?: return false
        device.javaClass.getMethod("removeBond").invoke(device) as Boolean
    } catch (_: Exception) { false }

    // Verbinden/verbreken als muziek-/belbron: alleen als de radio dat aan apps toestaat (verborgen methodes).
    // Lukt het niet, dan regelt de Bluetooth-dienst/-app van de radio de verbinding (na koppelen meestal vanzelf).
    fun connect(address: String, connect: Boolean): Boolean {
        val device = bluetooth?.getRemoteDevice(address) ?: return false
        var any = false
        for (proxy in profiles.values) {
            try {
                val method = proxy.javaClass.getMethod(if (connect) "connect" else "disconnect", BluetoothDevice::class.java)
                if (method.invoke(proxy, device) as Boolean) any = true
            } catch (_: Exception) { /* niet toegestaan op dit apparaat */ }
        }
        return any
    }

    fun isConnected(device: BluetoothDevice): Boolean = try {
        device.javaClass.getMethod("isConnected").invoke(device) as Boolean
    } catch (_: Exception) { false }

    companion object {
        private const val PROFILE_A2DP_SINK = 11
        private const val PROFILE_HEADSET_CLIENT = 16
    }
}
