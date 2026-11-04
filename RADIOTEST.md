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
