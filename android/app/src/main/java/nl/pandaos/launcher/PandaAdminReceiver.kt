package nl.pandaos.launcher

import android.app.admin.DeviceAdminReceiver

// Apparaatbeheer voor PandaOS. Als PandaOS "apparaateigenaar" is, mag hij het Android-paneel (omlaag vegen) uitzetten,
// zodat alleen het PandaOS-paneel verschijnt. Eenmalig instellen via ADB (alleen zonder Google-account op het apparaat):
//   adb shell dpm set-device-owner nl.pandaos.launcher/.PandaAdminReceiver
// Opheffen: vanuit PandaOS (PandaAndroid.clearDeviceOwner()) of het apparaat terugzetten naar fabrieksinstellingen.
class PandaAdminReceiver : DeviceAdminReceiver()
