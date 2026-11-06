# PandaOS op de radio zetten (vanaf de laptop)

Draaiboek voor de eerste test op de Camecho-radio (9", 1024×600, "Android 15") in de Golf 6.
Hoort bij [PANDAOS-OVERDRACHT.md](PANDAOS-OVERDRACHT.md); lees die ook als je met Claude op de laptop verder gaat.

**Geen Android Studio nodig.** Op de laptop heb je alleen **adb** nodig (Google "platform-tools", ±15 MB download,
±30 MB uitgepakt) plus de APK uit de GitHub-release. Bouwen gebeurt op de computer thuis; de laptop installeert alleen.

> Alternatief zonder laptop: staat de auto dichtbij huis en kan de radio op de wifi van thuis, dan kan het ook
> rechtstreeks vanaf de computer thuis (daar staat alles al klaar). Dan sla je stap 1 over.

---

## Veilig blijven

- PandaOS komt er eerst **naast** als gewone app. Het startscherm van de fabrikant blijft, tot jij zegt dat PandaOS
  het overneemt (stap 6).
- **Apparaateigenaar** (device owner) zetten we **niet** in deze test. Dat besluiten we later apart (vereist dat er
  geen Google-account op de radio staat en is lastig terug te draaien).
- Terug naar hoe het was: zie "Terugdraaien" onderaan. Schrijf in stap 5 eerst de naam van het originele
  startscherm op.

---

## Stap 1 – Laptop klaarmaken (thuis, met internet)

1. Maak een map `C:\pandaos-test`.
2. Download **platform-tools voor Windows** van Google:
   https://dl.google.com/android/repository/platform-tools-latest-windows.zip
   (officiële pagina: https://developer.android.com/tools/releases/platform-tools) en pak uit in `C:\pandaos-test`
   (dan heb je `C:\pandaos-test\platform-tools\adb.exe`).
3. Download de APK van de release: https://github.com/tracemodule/pandaOS/releases/latest → `PandaOS-1.3.0.apk`
   (of nieuwer) naar `C:\pandaos-test`.
4. Download de code (voor het diagnosescript en deze documenten, ±5 MB):
   https://github.com/tracemodule/pandaOS → groene knop **Code** → **Download ZIP**, uitpakken in `C:\pandaos-test`
   (of `git clone https://github.com/tracemodule/pandaOS.git` als git er op staat).
5. Optioneel, om met Claude verder te gaan op de laptop: in VS Code de extensie **Claude Code** installeren, de map
   `pandaOS` openen en zeggen: *"Lees RADIOTEST.md en PANDAOS-OVERDRACHT.md, ik ben bij stap 2 van de radiotest."*

Elke keer dat je een nieuw PowerShell-venster opent, eerst:

```powershell
$env:PATH = "C:\pandaos-test\platform-tools;$env:PATH"
cd C:\pandaos-test
adb version
```

## Stap 2 – In de auto: netwerk

- Auto stil, contact aan (liefst motor aan voor de accu).
- Hotspot van je telefoon aan; **radio én laptop** verbinden met die hotspot.

## Stap 3 – Radio: draadloos foutopsporen aanzetten

1. Radio: **Instellingen → Over apparaat** (of Systeem → Over) → 7× snel tikken op **Buildnummer**
   ("Je bent nu ontwikkelaar"). Vraagt hij een code: probeer de fabriekscode `1234`.
2. **Instellingen → Systeem → Ontwikkelaarsopties → Draadloze foutopsporing** aan.
3. Tik erop → **Apparaat koppelen met koppelingscode**: je ziet `IP:poort` + 6 cijfers.

Laptop:

```powershell
adb pair 192.168.x.x:KOPPELPOORT 123456      # gegevens uit het koppelvenster
adb connect 192.168.x.x:POORT                # IP:poort bovenaan het scherm "Draadloze foutopsporing" (andere poort!)
adb devices                                  # moet de radio tonen als "device"
```

Geen Buildnummer of geen Draadloze foutopsporing? Foto maken van het scherm. Noodroute: op de radio de APK
downloaden via de browser (link van stap 1.3) en installeren ("onbekende bronnen" toestaan). Voor stap 5 en de
CAN-monitor is adb wel nodig (via USB of een ADB-schakelaar in de fabrieksinstellingen, code 1234).

## Stap 4 – Radio verkennen (vóór de installatie)

```powershell
cd C:\pandaos-test\pandaOS-main          # of pandaOS bij git clone
powershell -ExecutionPolicy Bypass -File tools\radio-diagnose.ps1
```

Het script verzamelt apps, eigenschappen, broadcasts, camera en mediasessies en start daarna een live logboek.
Doe ondertussen: **R inschakelen, deuren open/dicht, lichten aan/uit, knipperlicht, stuurknoppen**. Stop met
**Ctrl+C**. De uitkomst staat in `tools\radio-diagnose-<datum>\` (staat in .gitignore: niet op GitHub zetten,
er kunnen Bluetooth-/wifinamen in staan; neem de map mee naar huis via USB-stick of stuur hem naar jezelf).

## Stap 5 – PandaOS installeren en toestemmingen geven

```powershell
adb install -r C:\pandaos-test\PandaOS-1.3.0.apk

# Toestemmingen (alles wat de launcher gebruikt)
adb shell pm grant nl.pandaos.launcher android.permission.READ_LOGS            # CAN-monitor
adb shell pm grant nl.pandaos.launcher android.permission.ACCESS_FINE_LOCATION # kaart/GPS
adb shell pm grant nl.pandaos.launcher android.permission.CAMERA               # achteruitrijcamera
adb shell cmd notification allow_listener nl.pandaos.launcher/nl.pandaos.launcher.MediaListenerService  # muziek + meldingen
adb shell appops set nl.pandaos.launcher WRITE_SETTINGS allow                  # helderheid

# BELANGRIJK: originele startscherm opschrijven (voor terugdraaien)
adb shell cmd package resolve-activity -a android.intent.action.MAIN -c android.intent.category.HOME

# PandaOS openen als gewone app (startscherm blijft nog dat van de fabrikant)
adb shell am start -n nl.pandaos.launcher/.MainActivity
```

Kijk rustig rond. Wat werkt en wat niet? Let op: muziek, wifi/Bluetooth-schermen, helderheid, tekstgrootte,
achteruit (camera), het paneel van boven.

**CAN-monitor**: open in PandaOS de app **CAN-monitor** → **Start** (vraagt Android "eenmalige toegang tot logs":
**Toestaan**) → R, deuren, lichten, knipperlicht → tab **Detectie** bekijken → **Opslaan** en **Probleem melden**.

**Probleem melden** (Instellingen → Software → Diagnose of in de CAN-monitor): deelmenu → naar jezelf sturen
(WhatsApp/Gmail). Rapporten staan ook op de radio; ophalen met:

```powershell
adb pull /sdcard/Android/data/nl.pandaos.launcher/files/ C:\pandaos-test\radio-bestanden
```

## Stap 6 – Alleen als alles goed voelt: PandaOS als startscherm

```powershell
adb shell cmd package set-home-activity nl.pandaos.launcher/.MainActivity
```

Druk op de Home-knop/home-gebaar: PandaOS moet verschijnen. Herstart de radio (contact uit/aan) en kijk of hij
vanzelf in PandaOS start.

## Terugdraaien

```powershell
# Startscherm van de fabrikant terug (naam uit stap 5, bijvoorbeeld com.xxx.launcher/.Launcher)
adb shell cmd package set-home-activity <pakket>/<activity>

# Of PandaOS helemaal verwijderen
adb uninstall nl.pandaos.launcher
```

Zonder laptop: radio **Instellingen → Apps → PandaOS → Verwijderen**, of bij **Standaard-apps → Startscherm-app**
het startscherm van de fabrikant kiezen.

---

## Wat mee terug naar huis

- De map `tools\radio-diagnose-<datum>\`
- De gedeelde rapporten (`pandaos-rapport-*.txt`) en het CAN-monitorbestand
- Foto's van: fabrieksinstellingen CAN-kastje/protocol (code 1234), Over apparaat, alles wat raar oogt
- Lijstje: wat werkte, wat niet

Daarmee schrijven we thuis de vertaling van de CAN-signalen naar `PandaOS.setCarState()` (stap 5 van "Nog open"
in de overdracht).

---

## Testen vanaf de laptop met `tools/pandaos.mjs` (vanaf 1.3.9)

> **Vanaf 1.4.0:** zet eerst in PandaOS **Instellingen → Software → Build** op **Ontwikkelaar**; anders kan de laptop
> niet in PandaOS kijken (in 1.3.9 werkten daardoor `doctor`, `test`, `sim`, `can` en `audio` niet). Na het testen
> terug op **Publicatie**. Wat de radio zelf doet (volumes, CarPlay, camera, Bluetooth-muziek) staat in
> [BEVINDINGEN.md](BEVINDINGEN.md).
>
> Extra te testen in 1.4.0:
> - Bluetooth-muziek van de telefoon: in PandaOS op afspelen → de radio springt kort naar Bluetooth-muziek en terug,
>   muziek blijft spelen.
> - CarPlay met muziek: muziekbalk toont "CarPlay · Speelt via CarPlay"; tik op de naam opent CarPlay. Daarna in de
>   log (`node tools/pandaos.mjs log` of het diagnoselogboek) de regels "Projectie: …" bewaren: daarin staan de
>   echte namen van de extra's.
> - Volume: `node tools/pandaos.mjs volumes` → Android-mediavolume moet 100 % zijn; VOL in PandaOS verandert het
>   meestervolume.
> - Radio herstarten met "Systeembalk verbergen" aan: na het opstarten moet de balk weer weg zijn.
> - Radio-instellingen → "Volumebalk verbergen" (moet nu werken) en "CarPlay automatisch verbinden".
> - Wifi/Bluetooth uitzetten in het PandaOS-paneel: lukt het niet, dan komt er een melding en gaan de
>   Android-instellingen open.
> - Bellen: in Contacten iemand bellen. Daarna in het diagnoselogboek de regels "Bellen: …" bewaren (welke weg de
>   radio neemt; er staan geen nummers in).
> - SOS (bovenbalk): Telefoon opent met 112 ingevuld, er wordt niet gebeld.
> - Bluetooth-app: telefoon als kaart, tik = verbinden/verbreken; muziekapps openen.
> - Radio-app: zie BEVINDINGEN.md, hoofdstuk Radio: radio-app van de auto één keer starten, daarna de regels
>   "Radio-log: …" uit het diagnoselogboek meenemen.
> - Weer in de bovenbalk (met internet) en de studio-achtergrond op het startscherm, licht en donker.
> - OBD2 (vanaf 1.4.3): zie BEVINDINGEN.md, hoofdstuk "OBD2 en Bluetooth tegelijk": dongle koppelen, app OBD2,
>   live-waarden, foutcodes lezen, en `node tools/pandaos.mjs bt-check` met de telefoon tegelijk verbonden.
> - Telefoon-app (vanaf 1.4.4): met de telefoon verbonden mag de balk "Verbinden" niet verschijnen; zonder telefoon wel.
>   Past het toetsenblok met de Bellen-knop zonder scrollen (licht en donker)? A-Z-index, zoeken, lang drukken op 0.
> - CAN-monitor (vanaf 1.4.4): kaarten bovenaan (berichten per seconde, CAN-ID's, verbinding) tijdens opnemen.
> - Toybox (vanaf 1.4.4): Geluidenbord en Boost via de speakers, Lichtshow, Wasstraat, Weer op de auto, velgen en
>   verlagen in de Spuiterij; let op of het beeld vloeiend blijft en of de radio niet trager wordt.

Hiermee kun je vanaf de laptop alles in PandaOS nadoen en controleren, zonder dat de auto iets hoeft te doen.
Nodig: **Node.js 22 of nieuwer** op de laptop (https://nodejs.org, LTS) en de radio verbonden via adb (USB of wifi-adb).
Alle opdrachten in de map `pandaOS`:

1. **Klaarzetten (eenmalig):** `node tools/pandaos.mjs setup`
   Zet alle rechten en Android-instellingen (boven andere apps, vrije vensters, meldingen-toegang). Staat er
   "HERSTART de radio", herstart dan één keer.
2. **Controleren:** `node tools/pandaos.mjs doctor`. Elke regel met ✗ is iets dat nog niet klopt.
3. **APK's van de fabrikant ophalen** (nodig om klank/balans van de radio zelf te kunnen besturen):
   `node tools/pandaos.mjs apks`. Ze komen in `tools/radio-apks/`. Die map gaat niet naar GitHub; stuur ze ook niet door.
4. **Testrondje:** `node tools/pandaos.mjs test`. Doet achteruit, lampen, knipperlichten, deur, handrem, tank,
   temperatuur, volume, equalizer en camera na en zegt per stap geslaagd/mislukt. Daarna alles terug.
5. **Zelf nadoen** (ook terwijl je rijdt of stilstaat):
   - `node tools/pandaos.mjs sim lights low` · `sim blinker left` · `sim door fl open` · `sim gear R` · `sim speed 80`
   - `--hold` erachter houdt de stand vast, ook als de echte auto iets anders meldt; `sim reset` laat alles los.
   - `node tools/pandaos.mjs can list` en `can <functie> on|off|waarde`: precies de weg die het CAN-kastje gebruikt.
6. **Klank en bronnen:** `node tools/pandaos.mjs audio` (wat de radio kan en welke bron-apps er zijn) en
   `audio eq 0 3 1 0 -1 2` (sub, bas, laag-mid, mid, hoog-mid, hoog in dB).
7. **Camera:** `node tools/pandaos.mjs camera open` / `close`.
8. **Telefoon en muziek:** verbind de telefoon via Bluetooth met de radio en kijk dan met `bluetooth`, `media` en
   `sources` (alleen aantallen, nooit namen of nummers).
9. **Schermafbeelding:** `node tools/pandaos.mjs shot naam` → `tools/radio-shots/` (niet in git; kan persoonlijke
   gegevens tonen).
