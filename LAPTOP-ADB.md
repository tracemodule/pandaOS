# PandaOS: radio onderzoeken en instellen met de laptop (adb via wifi)

Voor de laptop in de auto. Hoort bij [PANDAOS-OVERDRACHT.md](PANDAOS-OVERDRACHT.md) en [RADIOTEST.md](RADIOTEST.md).
Met Claude Code op de laptop: open de map `pandaOS` in VS Code en zeg
*"Lees LAPTOP-ADB.md en PANDAOS-OVERDRACHT.md, ik ben bij stap X"*. Claude kan dan zelf de adb-commando's draaien en de
logs meelezen.

**Wat je nodig hebt:** laptop met `platform-tools` (adb, ±15 MB) en de radio en laptop op **hetzelfde wifi-netwerk**
(hotspot van je telefoon). Geen Android Studio nodig.

**Belangrijk om te weten**
- Je radio is eigenlijk **Android 9** (sdk 28), ook al zegt hij "15". Daardoor:
  - is er geen "Draadloze foutopsporing met koppelingscode" (dat is Android 11+). Zie stap 2 voor de manieren die op
    Android 9 werken;
  - vraagt Android na stap 4 **nooit meer** om logtoegang (de vraag "eenmalige toegang" bestaat pas vanaf Android 13).
- Alles hieronder is **alleen lezen of PandaOS instellen**. Niets schrijft naar de CAN-bus, de MCU of de poorten.
- Niet doen: fabrieksreset, OTA/MCU/CANBUS-update, `adb shell rm`, iets naar `/dev/...` schrijven.
- **Je Google-account blijft staan.** Alles hieronder werkt met account. Alleen stap 7 (apparaateigenaar) vraagt om
  het account te verwijderen; die stap slaan we voorlopig over.

---

## Snelle route vanaf PandaOS 1.3.9: alles met één hulpprogramma

Vanaf 1.3.9 doet `tools/pandaos.mjs` het meeste werk uit dit document in één keer (nodig: **Node.js 22+** op de
laptop en adb-verbinding uit stap 2). Zeg tegen Claude op de laptop: *"Lees LAPTOP-ADB.md en RADIOTEST.md, we testen
1.3.9"*. Volgorde:

1. Radio bijwerken naar **1.3.9** (PandaOS → Instellingen → Software).
2. `node tools/pandaos.mjs setup` – alle rechten (`pm grant` voor WRITE_SECURE_SETTINGS, READ_LOGS,
   CHANGE_CONFIGURATION, contacten, gesprekken, agenda, sms, locatie, camera, microfoon), `appops set …
   SYSTEM_ALERT_WINDOW allow` (PandaOS-menu, volumebalk, knoppen half venster), vrije vensters
   (`enable_freeform_support 1` + `force_resizable_activities 1`, daarna **één keer herstarten**) en meldingen-toegang.
3. `node tools/pandaos.mjs doctor` – elke ✗ is iets dat nog niet klopt.
4. `node tools/pandaos.mjs apks` – de APK's van Jancar (o.a. `com.jancar.audiosettings`, `com.jancar.services`) naar
   `tools/radio-apks/` (niet in git). Neem ze mee naar huis: daarmee kunnen we balans/fader en klank van de radio zelf
   besturen.
5. `node tools/pandaos.mjs test` – testrondje met geslaagd/mislukt; zet alles daarna terug.
6. Zelf nadoen of vasthouden: `sim …` / `sim … --hold` / `sim reset`, `can list` / `can <functie> on|off|waarde`,
   `camera open|close`, `audio`, `audio eq …`, `volume 20`, `set <groep>.<naam> <waarde>`.
7. Telefoon via Bluetooth verbinden en kijken met `bluetooth`, `media` en `sources` (alleen aantallen).
8. Schermafbeeldingen met `shot naam` (naar `tools/radio-shots/`, niet in git; kan persoonlijke gegevens tonen).

De oude stappen hieronder blijven gelden voor logs meelezen (stap 5) en de CAN-app onderzoeken (stap 6).

---

## Draaiboek voor de laptop-sessie (PandaOS 1.3.6)

Doel: de radio klaarmaken voor gebruik. Lampjes, gordel, deuren, snelheid en volume komen dan echt van de auto, en we
weten waar de radio zijn eigen instellingen bewaart. Zeg tegen Claude op de laptop:
*"Lees LAPTOP-ADB.md en PANDAOS-OVERDRACHT.md, we doen het draaiboek"*. Werk de blokken in deze volgorde af.

**A. Voorbereiden (thuis, 10 min)**
1. Radio bijwerken naar **1.3.6** (PandaOS → Instellingen → Software). Controleer het versienummer.
2. Stap 1 hieronder: platform-tools en de code (ZIP) op de laptop.

**B. Verbinden en controleren (in de auto, motor uit, contact aan)**
3. Stap 2: `adb connect <ip>:5555`.
4. Stap 3: wat voor radio het is. Bewaar de uitvoer (vooral `ro.build.type`).
5. Stap 4: logboektoegang voor PandaOS (eenmalig, daarna voor altijd).
6. Stap 8: microfoon, meldingen en het PandaOS-toetsenbord aanzetten (alleen wat je wilt).

**C. De auto uitlezen en koppelen (contact aan, auto stil, handrem erop)**
7. Live log starten (stap 5, de `findstr`-versie) of opslaan naar `radio-log.txt`.
8. Doe elke handeling één keer, met 10 seconden ertussen, en zeg Claude wat je doet:
   stadslicht → dimlicht → grootlicht → mistlampen voor/achter → knipperlicht links/rechts → alarmlichten →
   elke deur open/dicht → kofferbak → gordel los/vast → handrem → achteruit (koppeling in, R) → VOL+ / VOL−.
9. Claude zoekt per handeling de regel die erbij hoort. Daarna leer je ze in PandaOS: **CAN-monitor → Koppelen →
   Leer aan / Leer uit** bij de functie, handeling doen, de regel kiezen die Claude noemde, **Koppeling opslaan**.
10. Controle: lampjes onder P R D, de deur op de auto en R moeten meebewegen.

**D. Instellingen van de radio vinden (alleen lezen)**
11. Volume van de radio:
    `powershell -ExecutionPolicy Bypass -File tools\settings-diff.ps1 -Name volume`
    → bij de vraag één keer **VOL+** drukken → Enter. Het script toont welke instelling veranderde.
12. Hetzelfde voor andere dingen die je wilt kunnen instellen (bijv. `-Name helderheid`, `-Name canbox`): één
    handeling per keer.
13. Stap 6: de CAN-app van de radio onderzoeken (`dumpsys`), voor de app Auto-info en latere koppelingen.

**E. GPS controleren (rijden kan, laptop met hotspot mee)**
14. `adb shell dumpsys location | findstr /i "gps fix accuracy satellites"` voor en tijdens rijden.
15. In PandaOS: snelheid onder de auto en het snelheidsbord. Zegt het bord de verkeerde weg? Noteer waar en hoe laat.

**F. Mee terug naar huis** (niet op GitHub): `radio-log.txt`, de mappen `tools\settings-diff-*`,
`radio-diagnose-*`, de uitvoer van stap 3 en 6, en foto's van wat niet lukte.

---

## Stap 1 – Laptop klaarmaken (thuis)

1. Download platform-tools: https://dl.google.com/android/repository/platform-tools-latest-windows.zip en pak uit
   in `C:\pandaos-test` (dan heb je `C:\pandaos-test\platform-tools\adb.exe`).
2. Code ophalen (voor deze documenten en `tools\radio-diagnose.ps1`): https://github.com/tracemodule/pandaOS →
   **Code → Download ZIP**, uitpakken in `C:\pandaos-test`.
3. Optioneel: VS Code + extensie **Claude Code**, map `C:\pandaos-test\pandaOS-main` openen.

In elk nieuw PowerShell-venster eerst:

```powershell
$env:PATH = "C:\pandaos-test\platform-tools;$env:PATH"
adb version
```

## Stap 2 – Laptop met de radio verbinden

Radio en laptop op dezelfde hotspot. IP-adres van de radio: Android-instellingen → Over de telefoon → Status
(of Wifi → het netwerk → details), bijvoorbeeld `172.20.10.4`.

**Manier A – adb via netwerk staat al aan.** Veel Chinese radio's luisteren standaard op poort 5555:

```powershell
adb connect 172.20.10.4:5555
adb devices          # moet "172.20.10.4:5555  device" tonen
```

Op de radio kan een vraag "USB-foutopsporing toestaan?" verschijnen: **Altijd toestaan** aanvinken → OK.

**Manier B – schakelaar zoeken.** Lukt A niet ("connection refused"), zoek op de radio naar een schakelaar en zet hem aan:
- Android-instellingen → Systeem → **Ontwikkelaarsopties**: "USB-foutopsporing" aan, en als die er is
  "ADB via netwerk" / "Netwerk-ADB" / "Wireless ADB" aan.
- Fabrieksinstelling (code 1234) → Apparaatinstellingen / Function Settings: iets met "ADB", "USB debug" of
  "USB-modus: apparaat/OTG". (Eerder zagen we hier geen ADB-schakelaar; kijk in alle submenu's.)

Daarna opnieuw `adb connect <ip>:5555`.

**Manier C – via USB.** Sommige radio's hebben een USB-poort die als "apparaat" kan werken (vaak USB1, met een
USB-A-naar-USB-A-kabel, of de schakelaar "USB-modus" in de fabrieksinstellingen). Als `adb devices` de radio via USB
ziet: `adb tcpip 5555`, kabel eruit, dan `adb connect <ip>:5555`.

Lukt geen van drieën: foto maken van Ontwikkelaarsopties (helemaal doorscrollen) en de fabrieksmenu's; dan zoeken we
verder. PandaOS zelf werkt ook zonder adb.

## Stap 3 – Controleren wat voor radio het is

```powershell
adb shell getprop ro.build.version.release      # Android-versie (verwacht: 9 of een nep-versie)
adb shell getprop ro.build.version.sdk          # 28 = Android 9
adb shell getprop ro.build.type                 # user / userdebug / eng  (belangrijk voor stap 6)
adb shell getprop ro.product.board              # ac8257
adb shell wm size                               # 1280x720
adb shell pm list packages | findstr /i "can jancar autoai backcar bt bluetooth carplay zlink"
```

## Stap 4 – Vaste logtoegang voor PandaOS

```powershell
adb shell pm grant nl.pandaos.launcher android.permission.READ_LOGS
adb shell dumpsys package nl.pandaos.launcher | findstr READ_LOGS   # moet "granted=true" tonen
```

Vanaf nu leest PandaOS het logboek altijd mee (CAN-monitor en Koppelen ook op de achtergrond), zonder vraag.

## Stap 5 – Logs live meelezen (met Claude)

Alles van de auto en de radio live (stoppen met **Ctrl+C**):

```powershell
adb logcat -c
adb logcat -v time | findstr /i "can mcu backcar reverse ill door light key speed radar canbus jlog bd37534 setvolume"
```

Of alles opslaan in een bestand, dan doe je in de auto rustig de handelingen en laat je Claude het bestand doorzoeken:

```powershell
adb logcat -c
adb logcat -v time > C:\pandaos-test\radio-log.txt
# nu in de auto: R aan/uit, deur open/dicht, lichten, knipperlicht, VOL+/VOL-, 10 sec. tussen elke handeling
# en noteer de tijden. Stop met Ctrl+C.
```

Tegen Claude: *"Zoek in C:\pandaos-test\radio-log.txt wat er gebeurde rond 14:05:10 (deur open)"*.

Of het volledige diagnosescript (apps, eigenschappen, broadcasts, diensten + live log):

```powershell
cd C:\pandaos-test\pandaOS-main
powershell -ExecutionPolicy Bypass -File tools\radio-diagnose.ps1
```

## Stap 6 – De CAN-app van de radio onderzoeken

```powershell
adb shell dumpsys package com.can.activity > C:\pandaos-test\can-app.txt        # diensten, ontvangers, providers, rechten
adb shell dumpsys activity services com.can.activity > C:\pandaos-test\can-services.txt
adb shell dumpsys activity broadcasts | findstr /i "can backcar mcu" > C:\pandaos-test\can-broadcasts.txt
adb shell settings list system > C:\pandaos-test\settings-system.txt
adb shell settings list global > C:\pandaos-test\settings-global.txt
```

In `settings-system.txt` / `settings-global.txt` staan vaak de CAN-keuze en het **volume van de radio**. Draai de
twee `settings list`-commando's twee keer: één keer voor en één keer na VOL+ indrukken. Claude vergelijkt ze en vindt
zo de instelling van het radiovolume (dan kan PandaOS het volume uitlezen én zetten).

**Root?** Alleen bij `ro.build.type` = `userdebug` of `eng` (stap 3):

```powershell
adb root                 # "adbd cannot run as root in production builds" = geen root, dan hier stoppen
adb shell ls -l /dev/ttyS* /dev/ttyMT* /dev/ttyHS* 2>NUL
adb shell getprop | findstr /i "can mcu uart tty"
```

Met root kunnen we zien aan welke seriële poort het CAN-kastje/de MCU hangt. **Niet** zelf een poort openen of
lezen met `cat`: dat kan berichten wegvangen bij de radio. Daar maken we samen een veilige aanpak voor.

## Stap 7 – Apparaateigenaar (optioneel, voorlopig overslaan)

> Voorlopig niet doen: hiervoor moet het Google-account van de radio af. Bewaard voor later.

Wat het doet: PandaOS blijft altijd het startscherm (ook na updates), de radio-software duwt PandaOS niet meer weg,
het Android-paneel wordt vervangen door het PandaOS-paneel, en updates installeren zonder vraag. Later ook: de
camera-app van de radio verbergen als PandaOS het camerabeeld zelf kan tonen.

**Voorwaarden**
- PandaOS **1.3.5 of nieuwer** (heeft de knop om het weer op te heffen: Instellingen → Apps → Startscherm →
  **Apparaateigenaar opheffen**). Controleer bij Instellingen → Software.
- **Geen accounts** op de radio. Android-instellingen → Accounts → het Google-account verwijderen (Play Store werkt
  dan niet meer tot je later weer inlogt; inloggen na het instellen mag wel).

```powershell
adb shell dumpsys account | findstr "Account {"     # moet leeg zijn
adb shell dpm set-device-owner nl.pandaos.launcher/.PandaAdminReceiver
```

"Success: Device owner set ..." = gelukt. Daarna PandaOS openen, in Instellingen → Apps → Startscherm PandaOS kiezen.
Foutmelding "already some accounts on the device": er staat nog een account; verwijderen en opnieuw.

**Terugdraaien:** in PandaOS Instellingen → Apps → Startscherm → **Apparaateigenaar opheffen** → Ja.

## Stap 8 – Ook handig

```powershell
adb shell cmd package resolve-activity -a android.intent.action.MAIN -c android.intent.category.HOME   # huidig startscherm
adb shell ime enable nl.pandaos.launcher/.PandaKeyboardService     # PandaOS-toetsenbord aanzetten
adb shell ime set nl.pandaos.launcher/.PandaKeyboardService        # en kiezen
adb shell pm grant nl.pandaos.launcher android.permission.RECORD_AUDIO          # microfoon (spraakinvoer)
adb shell cmd notification allow_listener nl.pandaos.launcher/nl.pandaos.launcher.MediaListenerService  # muziek + meldingen
adb pull /sdcard/Android/data/nl.pandaos.launcher/files/ C:\pandaos-test\radio-bestanden    # rapporten + CAN-monitor-bestanden
adb exec-out screencap -p > C:\pandaos-test\scherm.png                                       # schermafbeelding van de radio
```

## Wat mee terug naar huis

- `C:\pandaos-test\radio-log.txt`, `can-*.txt`, `settings-*.txt` en de map `radio-bestanden`. **Niet** op GitHub
  zetten (er kunnen namen van je telefoon/wifi in staan); via USB-stick of naar jezelf sturen.
- Uitkomst van stap 3 (vooral `ro.build.type`) en of `adb root` lukte.
