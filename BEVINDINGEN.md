# Bevindingen op de radio (Jancar UJC201, VW Golf 6)

Onderzocht met de laptop op 5 en 6 november 2026 (PandaOS 1.3.9). Wat hiervan in 1.4.0 is opgelost staat bij
**Status 1.4.0** per onderdeel. Geen persoonlijke gegevens in dit bestand.

## Volumes van de radio

De radio bewaart de 4 volumes niet in de Android-instellingen (system/global/secure) en niet in getprop, maar in de
eigen audiodienst van Jancar (`com.jancar.services/.audio.AudioService`).

| Schuif in radio-instellingen | Naam in log | Intern id | Bereik | Waarde (5-11) |
|---|---|---|---|---|
| Meestervolume | VOLUME_MASTER | 10 | 0-40 | 13-17 |
| Bluetooth-volume | VOLUME_BLUETOOTH | 12 | 0-40 | 19 |
| Mediavolume bij achteruitrijden | VOLUME_MEDIA_CCD | 15 | 0-100 % | 50 |
| Navigatievolume | VOLUME_NAVIGATION | (11 in vol_navi) | 0-100 | 100 |

Uitlezen via het logboek (READ_LOGS); de regel komt alleen bij een wijziging:

```
IVIAudioManager.java(167):onVolumeChanged: VOLUME_BLUETOOTH : 22
AudioService.java(1527):setParam: VOLUME_MEDIA_CCD to 56##56
AudioService.java(1527):setParam: VOLUME_NAVIGATION to 85##85
```

Zetten: geen Android-instelling. Eenvoudig: volumepagina van de radio openen
(`com.jancar.audiosettings/.ui.activity.VolumeActivity`). Eigen schuiven: binden aan `com.jancar.services/.audio.AudioService`
(geen vereiste permissie) en de Jancar-SDK (`com.jancar.sdk.audio.IVIAudio`, `setParam`) nabouwen. Nog niet onderzocht
of een gewone app dit mag.

**Volume te zacht:** er zitten twee volumes achter elkaar: Android-mediavolume (STREAM_MUSIC) en het meestervolume
(0-40). PandaOS zette STREAM_MUSIC (stond op 53). **Status 1.4.0:** op een Jancar-radio houdt PandaOS STREAM_MUSIC op
100 en regelt alleen het meestervolume (ook als de waarde nog onbekend is: dan in stappen).

## Jancar: de softwarelaag van de radio

| Onderdeel | App / dienst |
|---|---|
| Geluid, volumes, equalizer, balans | `com.jancar.audiosettings`, AudioService in `com.jancar.services` (versterkerchip BD37534) |
| Radio FM/AM, DAB | `com.jancar.radio`, RadioService, DABService |
| Bluetooth bellen/muziek | `com.jancar.bluetooth`, `com.jancar.btservice` |
| Muziek, video, foto's | `com.jancar.music`, `.video`, `.gallery`, MediaService |
| Achteruitcamera, AV-in | `com.jancar.hd2cam`, `com.jancar.avin`, backcar_daemon |
| Stuurknoppen leren | `com.jancar.steeringwheelkeys` |
| Systeembalk, paneel, volumebalk | `com.android.systemui` = ivi-systemui (Jancar 2.1.8) |
| Instellingen + fabrieksmenu | `com.jancar.settings` |
| Autosignalen (licht, achteruit) | CarService in `com.jancar.services` |
| Updates | `com.jancar.ota` |

Niet van Jancar: CAN-app `com.can.activity` (ivi-canbus 1.0.3494), CarPlay (`com.autochips.*`), chip MediaTek/AutoChips AC8257.
Diensten in `com.jancar.services` (zonder vereiste permissie): AudioService, CarService, RadioService, DABService,
MediaService, NavigationService, ClusterService, VoiceService, AVInService, SystemService, MainService.

## Equalizer en geluidseffecten

Schermen van `com.jancar.audiosettings`: EQFragment (equalizer, EqMode), EffectFragment (loudness e.d.), AreaFragment
(balans/fader), CarAudioFragment/AdvanceFragment (basfilter/subwoofer), VolumeFragment/VolumeActivity (de 4 volumes),
DefaultVolumeSetActivity (volume bij opstarten). Alles via `AudioService.setParam` → `AudioBD37534 setParam id N to X`.
Per schuif nog bepalen welk id/logregel erbij hoort. Snelle route: `com.jancar.audiosettings/.ui.activity.MainActivity`.

## Volumebalk en systeembalk van de radio

- De volumebalk komt van ivi-systemui (ty=DISPLAY_OVERLAY, bovenin, ±108 px), alleen bij de echte volumeknop. Geen
  instelling om hem uit te zetten. Oplossing: `wm overscan 0,-110,0,0` (nadeel: in andere apps valt de bovenste strook weg).
- Vanuit PandaOS faalde dat in 1.3.9 (`NoSuchMethodException: setOverscan`, Android 9 blokkeert verborgen API's).
  **Status 1.4.0:** PandaOS geeft de verborgen API's vrij (meta-reflectie, `VMRuntime.setHiddenApiExemptions`); nog
  testen op de radio.
- Systeembalk verbergen (`policy_control immersive.full=*`) werkt, maar stond na een herstart weer op null.
  **Status 1.4.0:** PandaOS zet hem bij start en bij terugkomst opnieuw als de schakelaar aan staat.
- Terugdraaien: `settings put global policy_control null`, `wm overscan reset`.
- PandaOS-veegstrook was te smal. **Status 1.4.0:** 32 dp.

## Achteruitrijcamera

- `com.jancar.hd2cam` opent in R een eigen venster over het hele scherm en houdt camera 8 (achteruit) en 9 altijd open.
- **hd2cam NIET uitzetten:** zonder hd2cam geeft Android Auto een groen beeld en CarPlay "Backcar Activate – CarPlay
  screen cannot start" (getest 6-11). **Status 1.4.0:** Radio-instellingen waarschuwt nu in plaats van "uitzetten via
  App-info".
- PandaOS probeerde camera 12 ("Function not implemented"). RearCamera.tsx probeert nu camera 8 eerst en vult de lijst
  ook als het mislukt. Zolang hd2cam camera 8 vasthoudt, toont de radio in R zijn eigen camerascherm. Nog uitzoeken:
  kan hd2cam het beeld delen (remote preview surface, CameraOperation8 … mRemotePreviewSurface)?
- In R pakt de CAN-app (`com.can.activity`, parkeersensoren) kort de focus met een onzichtbaar venster.

## Bluetooth-muziek (iPhone)

- Jancar's A2dpSinkStreamHandler pauzeert zelf (AVRCP) als Bluetooth geen audiofocus heeft. De focus gaat pas naar
  Bluetooth als de bron van de radio op A2DP staat.
- Werkt: `com.jancar.bluetooth/.activity.BluetoothMusicActivity` openen → bron BLUETOOTH_A2DP → terug naar PandaOS,
  muziek blijft spelen. **Status 1.4.0:** PandaOS doet dit zelf bij afspelen van Bluetooth-muziek.
- Draadloos CarPlay neemt de wifi en het geluid over. `settings put global CarplayAutoConnectSwitch 0` zet automatisch
  verbinden uit (terug: 1). **Status 1.4.0:** schakelaar in Radio-instellingen en `pandaos.mjs carplay-auto`.
- Op de radio staat ook Android Auto (`com.google.android.projection.sink`).

## CarPlay en Android Auto: muziekbalk

- Tijdens CarPlay is er geen mediasessie met titel. CarPlay-dienst geeft alleen speelstatus door; iAP2-nummergegevens
  worden niet afgehandeld ("Unhandled message IAP2_PLAYBACK_STATE_UPDATE"). CarplayArtwork bestaat, nog niet bekeken.
- Broadcasts (niet beschermd):

| | Status (radio → apps) | Bediening (apps → radio) |
|---|---|---|
| CarPlay | `action.android.carplay.send` (KEY_CARPLAY_SEND_STATUS: MAIN_AUDIO_START/STOP …), `com.jancar.carplay_connected/_disconnect/_show/_hidden` | `action.jancar.carplay_receive` (KEY_CARPLAY_RECEIVE_COMMAND) |
| Android Auto | `action.android.auto.send` (KEY_ANDROID_AUTO_SEND_STATUS: CONNECTED, DISCONNECT, HIDDEN, AUDIO_START, AUDIO_STOP), `com.google.android.projection.android_auto_start/_end`, `autochips.intent.action.AA_STARTED` | `action.android.auto.receive` (KEY_ANDROID_AUTO_RECEIVE_COMMAND: ENTER, EXIT, mediatoetsen) |

  De letterlijke sleutelnamen staan niet los in de APK. **Status 1.4.0:** PandaOS ontvangt deze broadcasts, logt alle
  extra's ("Projectie: …" in het diagnoselogboek) en toont "Speelt via CarPlay/Android Auto" met Openen (tik op de
  naam). Bediening gaat voorlopig via de mediatoetsen van Android. Nog testen: heeft Android Auto een mediasessie
  met titel (`adb shell dumpsys media_session`)?

## Wifi/Bluetooth aan-uit in PandaOS

Gemeld als "werkt niet" (6-11). Vermoedelijk zet `com.jancar.btservice` Bluetooth terug, en kan de MediaTek-ROM
wifi-schakelen door apps blokkeren. **Status 1.4.0:** PandaOS kijkt na het schakelen of het gelukt is; zo niet, dan
een melding en de Android-instellingen. Testen: `adb logcat -d | findstr /i "BluetoothManagerService enable disable btservice"`
en `adb shell settings get global bluetooth_on`.

## Overige vondsten

- CAN-kastje: radio ingesteld op Simple-Volkswagen-Golf MK6-2009~2012-All, maar `connection_state=Protocol niet
  verbonden`: er komt geen CAN-data binnen.
- `tools/pandaos.mjs` (1.3.9): adb-pad, naam van de meldingen-dienst en het `apks`-filter zijn in 1.4.0 verbeterd.

## Radio (Jancar) – te onderzoeken in 1.4.0

PandaOS 1.4.0 heeft een eigen Radio-app (FM/AM/DAB, `RadioApp.tsx`) bovenop de tuner van Jancar (`com.jancar.radio`,
RadioService/DABService in `com.jancar.services`). Er is geen gedocumenteerde API; `JancarRadio.kt` werkt in lagen:
mediasessie van de radio-app (als die er is), het logboek (frequentie, band, PS, RT, voorkeuzes) en de radio-app
openen (zet de bron op radio). Afstemmen gaat via **geraden** broadcasts (`com.jancar.radio.action.SET_FREQ` e.d.,
extra's `freq`/`frequency`/`band`): niet geverifieerd. Bij de volgende laptoptest vastleggen, terwijl de radio speelt:

- `adb shell dumpsys media_session` – heeft `com.jancar.radio` (of RadioService) een sessie, met welke titel/artiest/
  extra's en welke acties (skipToNext = zoeken)?
- `adb logcat -d | findstr /i "radio freq rds dab"` – het echte formaat van frequentie, band, PS-naam, radiotekst en
  voorkeuzes (en bij welke tag/klasse). Ook even van zender wisselen, zoeken en een voorkeuze opslaan.
- `adb shell dumpsys package com.jancar.radio` – activiteiten (aparte FM/AM/DAB-schermen?), receivers met hun
  intent-filters (bestaat er een echte afstem-actie?) en services. Zelfde voor `com.jancar.services` (RadioService,
  DABService: welke AIDL/binder, `com.jancar.sdk.radio`?).
- In het diagnoselogboek van PandaOS: de regels `Radio-log:` (één voorbeeld per nieuwe vorm van een radioregel, max.
  200), `Radio-sessie:`, `Radio-bediening: ... via session/mediakey` en `Radio: afstemmen op ... bevestigd/niet
  bevestigd` (na een tik op een zender in de Radio-app).
- Controleren: zet het openen van de radio-app (Radio-app > tegel of "Radio openen") de bron echt op radio, en komt
  PandaOS na 700 ms terug zonder dat het geluid stopt?
