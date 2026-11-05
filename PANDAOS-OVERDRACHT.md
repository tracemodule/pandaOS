# PandaOS – overdracht (stand van zaken)

Lees dit eerst als je verder werkt op een andere computer of in een nieuwe Claude-sessie.
Laatst bijgewerkt: 4 november 2026.

## Wat is PandaOS

Een Tesla-achtige infotainment-interface voor Davids eigen **Volkswagen Golf 6**, gemaakt door David.

**De auto** (RDW-gegevens): Golf 6 Trendline, januari 2010, reflexzilver metallic,
1.4 TSI (motorcode CAX, turbo), 90 kW / 123 pk, benzine, tank 55 l, **6 versnellingen handgeschakeld**, banden
205/55 R16, olie 5W-30 (3,6 l, elke 15.000 km / 12 maanden), halogeen koplampen, PQ35-platform.
PandaOS staat standaard op deze auto ingesteld (`client/src/store/vehicleProfile.ts`).
React + TypeScript + Vite (`client/`) en een Node-server (`server/`, WebSocket op poort 8080).
Gebaseerd op PandaOS van Cyberpandino (GPL-3.0). 3D-model: GT Cars: Hyperspeed (CC-BY 4.0).

**Doelhardware:** Camecho 9" Android-autoradio, 1024 × 600, "Android 15", chipset "8257",
met CAN-bus-kastje (fabriekscode 1234). Raspberry Pi blijft een mogelijk alternatief.

## Afgesproken plan

PandaOS wordt een **Android-launcher-app** (WebView met de PandaOS-webapp + native brug `window.PandaAndroid`).
Op de radio neemt die app de rol van de Node-server over.

- **Half scherm** (auto links, paneel rechts): Settings, Music, Phone, Navi.
- **Volledig scherm**: Android-apps (Spotify, YouTube, Netflix/Theater, Maps, Waze, Play Store),
  apps van de radiofabrikant (CarPlay-app, FM, DSP/EQ, BT).
- **Boven alles**: achteruitrijcamera, volume-popup, meldingen, inkomende oproep.
- **Knoppen**: VOL+/− = PandaOS-volume met popup (stap 1, 3 s zichtbaar), NAV = te kiezen, HOME = PandaOS,
  stuurknoppen = mediabediening.
- **Versnelling zonder OBD2**: P = stilstand, D = rijden (GPS), R = achteruit-signaal van de radio.
  Handgeschakeld toont ook P R D (1–6 is niet uit te lezen zonder OBD2).
- **Auto-thema**: licht/donker volgt het verlichtingssignaal (stadslicht) van de auto via CAN/ILL.
- **App-koppelingen** (Settings → Apps): per app aan/uit en welke app hij opent.
  - Android-apps (standaard de geïnstalleerde Android-app, anders PandaOS-webversie als terugval):
    Spotify, YouTube, Theater, CarPlay (PandaOS-CarPlay alleen op laptop/Pi), Energy (bijv. ANWB Onderweg).
  - PandaOS-apps (standaard eigen versie): Music, Nav, Phone (Android-app kiezen mag), Camera (achteruitrijcamera), Dashcam.
  - Alleen apps die echt geïnstalleerd zijn verschijnen als keuze; "Geen" kan altijd.

## Klaar

- Settings in Tesla-stijl (Figma Tesla Model 3 UI Kit), compact voor 1024 × 600. Tabs: Vehicle, Display,
  Trips, Navigation, Safety, Maintenance, Apps, Software ("Gemaakt door David"), Wi-Fi, Bluetooth.
- Taal Nederlands/Engels (Settings → Display). Alle teksten via `t()` uit `client/src/i18n.ts`.
- Audio Settings in Music (schuifregelaarknop): 6 EQ-banden, Immersive Sound, balans/fade, snelheidsvolume, bron.
- App-menu met App-instellingen (tandwiel): navigatie-app, muziek-app, wat er opent bij opstarten.
- Ritcomputer via GPS (`services/tripComputer.ts`): huidige rit, Rit A, Rit B.
- Snelheidswaarschuwing: maximumsnelheid uit OpenStreetMap (`services/speedLimit.ts`), rode snelheid + bord + piep.
- Navigatie: PDOK-kaart en zoeken, OSRM-routes met snelwegen/tol/veerpont vermijden.
- Volume: stap 1, popup 3 s zichtbaar bij elke druk.
- SVG-app-iconen (`client/public/app-icons/*.svg`), gemaakt met een script; camera/bluetooth/music/spotify/netflix
  zijn de oude iconen als SVG, de rest nieuw in dezelfde stijl.
- Opstartscherm met VW-logo dat in-fadet (`components/screen/boot-screen/`).
- Wisselen van app: oude app schuift weg, daarna schuift de nieuwe in (SplashScreen.tsx).
- Laptop: Bluetooth (Windows), Spotify Web API, telefoon-app (oFono/PBAP op de Pi).
- **Android-launcher** (`android/`, 4 november 2026), getest op de emulator:
  - Kotlin, één WebView, startscherm (HOME), volledig scherm, scherm blijft aan, GPS-toestemming.
  - De webapp uit `client/dist` gaat mee als `assets/web` en draait op `https://appassets.androidplatform.net/`.
  - Brug web → Android `window.PandaAndroid` (`PandaBridge.kt`): `getInstalledApps()`, `launchApp(pakket)`, `openWifiSettings()`.
  - Brug Android → web `window.PandaOS` (`client/src/services/androidBridge.ts`): `stepVolume(delta)`, `setReverseSignal(actief)`.
  - VOL+/− gaan naar het PandaOS-volume (popup), niet naar Android. Terugknop sluit PandaOS niet.
  - Dock en app-menu openen de gekoppelde Android-app (`openLinkedAndroidApp` in `appLinks.ts`), anders de PandaOS-versie.
  - Getest: Golf in 3D, VOL-popup, YouTube opent de echte Android-app, HOME brengt PandaOS terug,
    Settings → Apps toont alleen geïnstalleerde apps, Wi-Fi-knop opent de Android-wifi-instellingen.
- **Mediasessie** (`MediaWatcher.kt` + `MediaListenerService.kt`): wat er speelt in Android-apps (titel, artiest,
  hoes, positie) gaat naar de mediakaart; afspelen/pauze/volgende/vorige via `PandaAndroid.mediaCommand()`.
  Vereist meldingen-toegang (Settings → Apps → "Media-info van Android-apps" → Toegang geven). Bron `'android'` in de store
  gaat voor Spotify-API en Bluetooth. Toegang getest; afspelen nog niet getest (YouTube-video nodig).
- **Apps & menu op de radio** (`appLinks.ts`, `getLaunchAction`):
  - Spotify, YouTube, Theater, Energy: altijd de Android-app, geen webviewer meer. Niet geïnstalleerd: pictogram licht
    (menu en dock), tik opent de Play Store (Energy: ANWB Onderweg `com.themobilecompany.Onderweg`).
  - Calendar, Messages, Zoom, TuneIn, Toybox (Play Games), CarPlay: verborgen als de app er niet op staat.
  - CarPlay-apps worden herkend aan de naam (ZLink, AutoKit, Carlinkit, …); volledig scherm.
  - "Andere app…" in Settings → Apps: elke geïnstalleerde app koppelen (doel `pkg:<pakketnaam>`).
  - Nieuw: **Audio** (Settings → Apps): PandaOS Audio Settings of de audio-/DSP-app van de radio (opent vanuit Music).
  - App-menu toont daarna alle overige Android-apps met hun eigen pictogram (scrollt).
  - Nav opent altijd de PandaOS-kaart in het halve scherm; gekoppeld aan Google Maps/Waze → knop "Volledig scherm".
  - Software-tab: "Gemaakt door David Cotino"; klein licentieregeltje onderaan (GPL-3.0 en CC-BY vereisen dat).
  - Getest op de emulator: lichte pictogrammen, Play Store opent, CarPlay → andere app, Nav → Google Maps volledig scherm.
  - Settings → Apps → "Android-apps": per Android-app aan/uit (zichtbaar in het app-menu), opgeslagen als
    `appLinks['pkg:<pakket>']`. Apps achter een PandaOS-pictogram staan daar niet (die hebben hun eigen schakelaar).
  - Android-camera-app altijd verborgen; Android-instellingen heet "Android-instellingen" met eigen groen pictogram.
- **Helderheid** (Settings → Display): op de radio de echte schermhelderheid via `PandaAndroid.setBrightness()`.
  Met toestemming "Systeeminstellingen aanpassen" (knop in Settings) systeembreed, anders alleen binnen PandaOS.
  Auto = aparte dag- en nachthelderheid (standaard 100 / 60 %), wisselt met Weergave: verlichting van de auto
  (stadslicht/dimlicht → ILL-signaal) of anders de klok. Getest: lichten aan → 153/255, uit → 255/255.
- **Dock** (control-bar): links van de lijn favorieten (max. 5), rechts de 2 recente apps. Slepen met pointer-events
  (`store/appDrag.ts`), want HTML5-drag-and-drop werkt niet met touch in de WebView. Lang indrukken in het app-menu =
  bewerkmodus; dan slepen naar de favorieten (op een pictogram = op die plek), tikken = vastzetten, favoriet naar het
  kruis slepen of op het rode x tikken = weghalen. Recente apps kun je ook naar de favorieten slepen. Android-apps
  kunnen ook in de dock (id `pkg:<pakket>`). Tikken in de dock telt niet meer als "buiten het menu".
- **Opstartscherm laadt vooraf** (`services/preload.ts`, `BootScreen.tsx`): tijdens het VW-logo worden alle
  app-pictogrammen (PandaOS + Android) geladen en gedecodeerd en het 3D-model alvast gedownload/geparsed. Het logo
  gaat pas weg als de pictogrammen klaar zijn én de auto één keer getekend is (minstens 2 s, hooguit 8 s).
  Gemeten op de emulator: logo ±2,2 s zichtbaar, daarna staat de auto er meteen.
- **Geen dubbele apps**: Android-apps die bij een PandaOS-pictogram horen (alle keuzes in Settings → Apps:
  Google Phone, YouTube Music, Google Maps/Waze, CarPlay-apps, …) staan nooit los in het app-menu
  (`getPackagesBehindPandaOSIcons` in appLinks.ts).
- **GitHub**: openbare repository https://github.com/tracemodule/pandaOS (branch `main`), licentie GPL-3.0
  (`LICENSE`), README met vermeldingen. Eerste release **v1.2.0** met `PandaOS-1.2.0.apk`. Commits gebruiken
  `tracemodule@users.noreply.github.com` (geen privé-e-mailadres); het kenteken staat niet in de repo.
  GitHub CLI: `C:\Program Files\GitHub CLI\gh.exe`, ingelogd als tracemodule.
  Getest van begin tot eind: emulator 1.1.2 → Instellingen → Software → Controleren → "Nieuwe versie 1.2.0" →
  Downloaden en installeren → 1.2.0 geïnstalleerd, PandaOS weer startscherm.
- **Diagnose en Probleem melden** (v1.3.0): Settings → Software → Diagnose toont het logboek van webapp
  (`client/src/services/diagnostics.ts`: JS-fouten, console.error, versnelling/R, lichten, deuren, knipperlicht,
  telefoon, mediabron, Bluetooth, updates, app openen mislukt; laatste 400 regels in localStorage) en launcher
  (`DiagLog.kt`: crashes in filesDir/diagnostics/crash.txt, renderer weg, Bluetooth, wifi, updates). "Probleem melden"
  maakt één rapport (versie, radio/chipset/Android, toestemmingen, apparaateigenaar, voertuiginstellingen, autostatus,
  laatste regels) en opent het deelmenu van Android (WhatsApp/Gmail/Quick Share); kopie in
  `Android/data/nl.pandaos.launcher/files/reports/`. Er wordt niets vanzelf verstuurd (geen server/token in de openbare repo).
  Ook als knop in de CAN-monitor (met de laatste 200 CAN-regels). Getest op de emulator.
- **Software-updates**:
  - Versie op één plek: `version.json` (webapp via vite `__PANDAOS_VERSION__`, launcher via Gradle). Nu 1.2.0.
  - Vaste ondertekening voor debug én release (`signingConfigs.pandaos`): standaard de debug-sleutel van deze laptop
    (`%USERPROFILE%\.android\debug.keystore`), anders pad/wachtwoorden in `android/local.properties`
    (`pandaos.keystore`, `pandaos.storePassword`, `pandaos.keyAlias`, `pandaos.keyPassword`).
    **Bewaar die sleutel goed** (back-up): met een andere sleutel kan de radio geen updates meer installeren.
  - Settings → Software → Software-update: versie, Controleren (GitHub API, `UPDATE_REPO` in `services/updates.ts`),
    wat er nieuw is, Downloaden en installeren (voortgang), Automatisch controleren (melding na opstarten).
  - Launcher: `UpdateInstaller.kt` (download met voortgang, controle pakketnaam/versie, PackageInstaller-sessie;
    als apparaateigenaar zonder vraag, anders bevestiging van Android). Na de update start PandaOS vanzelf en blijft
    het startscherm (`addPersistentPreferredActivity` + `MY_PACKAGE_REPLACED`).
  - Getest op de emulator: 1.1.0 → 1.1.1 → 1.1.2 via een lokale server (http alleen voor 10.0.2.2 toegestaan).
  - Nieuwe versie uitbrengen: `powershell -ExecutionPolicy Bypass -File tools\release.ps1 -Version 1.2.1 -Notes "..."`
    (verhoogt version.json, bouwt webapp + release-APK, commit + tag + push, GitHub Release met de APK).
  - Release-build: lint-controle `ExpiredTargetSdkVersion` staat uit (targetSdk 28 is bewust).
- **Settings → Geavanceerd** (tussen Voertuig en Scherm): "Mijn auto" (gegevens van de auto + knop "Instellingen van
  mijn auto toepassen") en de CAN-bus-instelling + CAN-monitor. Standaardinstellingen = deze auto
  (`MY_VEHICLE_SETTINGS`: handgeschakeld, reflexzilver, geen getinte ruiten, halogeen, 1 uitlaat links, PQ35).
  Opslag versie 2: oude standaard "Automaat" wordt eenmalig "Handgeschakeld".
- **CAN-bus**: twee verbindingen — auto ↔ CAN-kastje (voertuigprotocol, Golf 6 = VW PQ35) en CAN-kastje ↔ radio
  (merk/type kastje: Raise/Ruizheng, Hiworld, Simple Soft, Oudi, Binarytek, Luzheng …).
  - Settings → Geavanceerd → CAN-bus: kastje + protocol kiezen (`vehicleSettings.canbox` / `canProtocol`), moet gelijk
    zijn aan de fabrieksinstellingen van de radio. Knop "CAN-monitor openen".
  - **CAN-monitor-app** (app-menu, half scherm; `CanMonitorApp.tsx` + `CanMonitor.kt`): sneltoetsen Starten/Stoppen,
    Alleen auto/Alles, Opslaan (tekstbestand, pad wordt getoond, ophalen met `adb pull`), Wissen. Tabs: Live (regels),
    Detectie (per soort signaal: achteruit, verlichting, deuren, stuurknoppen, snelheid, temperatuur, brandstof,
    handrem/gordel, parkeersensoren — aantal + laatste regel; goed leesbaar voor een foto), Apps (CAN-/auto-apps van
    de fabrikant + gekozen instelling). Bronnen: bekende broadcasts (MTC/Microntek, SYU/FYT, TopWay …) en het
    logboek van de radio (systeemruis zoals artd eruit gefilterd).
  - Volledig logboek: eenmalig `adb shell pm grant nl.pandaos.launcher android.permission.READ_LOGS`; op Android 13+
    vraagt Android bij elke start van de monitor "Allow one-time access" (tikken). Zonder: alleen broadcasts.
  - `tools/radio-diagnose.ps1` (laptop, via ADB): apps, eigenschappen, broadcasts, diensten, mediasessies, camera,
    seriële poorten en een live gefilterd logboek in een map.
  - Getest op de emulator met nagebootste signalen (broadcast + logregels): Live, Detectie en Opslaan werken.
- **PandaOS-toetsenbord in Android-apps** (`PandaKeyboardService.kt`, invoermethode): zelfde indeling, iconen en
  kleuren als het webtoetsenbord (letterblok + numpad, shift/caps lock, symbolen, cursor ‹ ›, wissen met herhalen,
  Enter = actie van het veld). Licht/donker volgt PandaOS (`setUiTheme`). Settings → Apps → Toetsenbord → "PandaOS-
  toetsenbord gebruiken": als apparaateigenaar meteen standaard, anders via de Android-schermen. Getest in de
  zoekfunctie van de Android-instellingen. Microfoon-toets doet nog niets (spraakinvoer = vervolgstap).
  Emulator: `adb shell settings put secure show_ime_with_hard_keyboard 1` (anders verbergt Android elk
  schermtoetsenbord omdat de emulator een pc-toetsenbord heeft).
- **Statusbalk**: wifi- en Bluetooth-icoon naast slot/tijd (vol = verbonden, gedimd = aan, doorgestreept = uit).
- **Android-balkje bij omlaag vegen**: met het PandaOS-paneel gekozen tonen de systeembalken niet meer tijdelijk;
  zodra Android ze toont, verbergt MainActivity ze meteen en opent het PandaOS-paneel (`openPanel`).
- **PandaOS-paneel** (`components/panel/PandaPanel.tsx`): veeg vanaf de bovenrand omlaag → paneel met snelknoppen
  (Wi-Fi, Bluetooth, Weergave, Instellingen, Android-instellingen), helderheid, volume en de meldingen van
  Android-apps (openen, wegvegen, alles wissen; via de meldingen-luisteraar `MediaListenerService`). Omhoog vegen of
  naast tikken sluit. Keuze in Settings → Apps → Paneel: PandaOS of Android.
  - Het Android-paneel helemaal uitzetten kan alleen als PandaOS **apparaateigenaar** is (`setStatusBarDisabled`).
    Eenmalig, alleen zonder Google-account op het apparaat:
    `adb shell dpm set-device-owner nl.pandaos.launcher/.PandaAdminReceiver`.
    Opheffen: `PandaAndroid.clearDeviceOwner()` (via DevTools) of fabrieksinstellingen.
    Op de emulator ingesteld en getest: Android-paneel blijft dicht, PandaOS-paneel werkt.
  - Op de radio: als er al een Google-account op staat (Play Store), kan PandaOS geen apparaateigenaar worden; dan
    werkt het PandaOS-paneel wel, maar kan het Android-paneel ook nog open.
- **CarPlay automatisch openen** (Settings → Apps → CarPlay → "Automatisch openen"): zodra een telefoon via
  Bluetooth verbindt (melding `bluetoothConnected` van RadioConnectivity), of als hij bij het opstarten al verbonden
  is, opent PandaOS de gekozen CarPlay-app. Uit = zelf openen. Melding "Bluetooth verbonden/verbroken" bij telefoons.
  Getest met een nagebootste verbinding. Muziek van een verbonden telefoon komt via de mediasessie van de
  Bluetooth-muziek-app van de radio in de mediakaart (nog op de radio testen).
- **Geen blauwe tikmarkering** meer (Android-WebView): `-webkit-tap-highlight-color: transparent` en geen focusrand
  in App.scss. Op de laptop zie je die markering niet, op de radio wel.
- **Eigen Wi-Fi- en Bluetooth-schermen op de radio** (zelfde Android-drivers, eigen PandaOS-UI; geen Node-server):
  - **Let op: de launcher staat bewust op `targetSdk 28`.** Alleen dan mag een gewone app zelf met wifi verbinden en
    Bluetooth aan/uit zetten. Kan daardoor niet in de Play Store (niet nodig; zelf installeren).
  - Wi-Fi (`AndroidWifiPanel.tsx`): aan/uit, netwerken zoeken (signaal, slotje, opgeslagen), tikken = verbinden,
    wachtwoord via het PandaOS-toetsenbord, vergeten. Op de emulator getest: aan/uit, lijst, verbonden.
    Verbinden met wachtwoord nog op de radio testen (emulator heeft alleen één open netwerk).
  - Bluetooth (`AndroidBluetoothPanel.tsx`): aan/uit, zichtbaar maken (Android vraagt bevestiging), gekoppelde
    apparaten (verbonden of niet, vergeten, verbinden/verbreken), apparaten in de buurt zoeken en koppelen.
    De bevestiging van de koppelcode toont Android altijd zelf. Verbinden als muziek-/belbron lukt alleen als de
    radio dat apps toestaat; anders de Bluetooth-app van de radio (Settings → Apps → Bluetooth).
  - Android-kant: `RadioConnectivity.kt`; brug: getWifiState, setWifiEnabled, startWifiScan, connectWifi, forgetWifi,
    getBluetoothState, setBluetoothEnabled, startBluetoothScan, pairBluetooth, forgetBluetooth, connectBluetooth,
    makeBluetoothDiscoverable.
  - Op de radio maakt PandaOS geen verbinding met de server meer → geen "server onderbroken".
  - Laptop/Pi: Bluetooth- en Wi-Fi-tab zoals voorheen.
- **Achteruitrijcamera** (`RearCamera.tsx`): echt camerabeeld via getUserMedia, over de volle hoogte, met
  hulplijnen. Opent automatisch in R en via het Camera-pictogram (dan met sluitknop). Knoppen: andere camera
  (als er meerdere zijn) en spiegelen; keuze onthouden in localStorage `pandaos-rear-camera`. Camera wordt
  vrijgegeven bij sluiten. Launcher: CAMERA-toestemming + `onPermissionRequest` in MainActivity.
  Getest met de emulatorcamera. Statusbalk wit boven zwarte apps.
- **Telefoon** (`PhoneApp.tsx`): indeling zoals de Android-telefoonapp in onze stijl — links Recent / Contacten
  (tik op een regel = nummer in het toetsenblok, groene knop = bellen), rechts het toetsenblok of het lopende gesprek.
  Voorbeeldcontacten weg. Toetsen verschuiven niet meer bij het typen (vaste plek voor de wisknop; gemeten).
- **3D-model en autostatus** (`SidebarPane.tsx`, `vehicleModels.ts`, `carState` in de store):
  - Lampen: dimlicht, grootlicht, stadslicht/dagrijlicht, knipperlichten (links/rechts/alarm), achterlichten,
    remlicht (+ derde remlicht), achteruitrijlicht. Koplamp- en achterlichtglas lichten op zodat het goed zichtbaar is.
    Mistlampen staan in de status maar zitten niet in het model.
  - Deuren (4) draaien open op het model, scharnier op de voorrand van het deurpaneel; melding + rode aanduiding
    "Deur … open". Achterklep: alleen melding (het model heeft geen losse achterklep).
  - `carState`: lights (off/parking/low), highBeam, fogFront/Rear, blinker, doors, detectedTransmission.
    Straks van het CAN-kastje via `window.PandaOS.setCarState()`. Lichten aan = nachtstand (thema/helderheid).
  - Versnelling: `gearOverride` (CAN/debug) gaat voor de GPS-schatting; R = achteruit-signaal.
    "transmission backwards" in de console werkt nu (eerst zette de GPS hem meteen terug naar P).
  - Voertuig (Settings): versnellingsbak Automaat / Handgeschakeld / Automatisch herkennen; koplampen Halogeen/Xenon
    (standaard halogeen); spiegels wagenkleur/zwart/carbon; grill standaard/glanszwart/chroom/wagenkleur/carbon;
    uitlaat 1 of 2 links/rechts, beide kanten, 2 in het midden (gemaakt van één uitlaatpunt, gespiegeld/verschoven).
    Spiegelkap en grill worden bij het laden uit grotere meshes geknipt (`trim` in vehicleModels.ts).
  - Weggehaald uit het model: losse uitlaatvarianten, uitlaatbuis met middenpijpen, race-achterbumper.
  - Debug-console: lights off/parking/low, highbeam on/off, fog front/rear on/off, blinker left/right/hazard/off,
    door fl/fr/rl/rr/trunk/all open/close, cartype automatic/manual/unknown, transmission park/drive/…/backwards.
  - Model-ruimte van car.glb (vóór de rotatie van het model): Z omhoog, neus naar -Y, links = +X.
- **Tekstgrootte**: Standaard (1), Groot (1,15), Handmatig (schuifbalk 85–140 %). Kiezen = meteen voorvertoning,
  OK = opslaan, Annuleren = terug. Werkt via `--text-scale`: alle `font-size` in SCSS en inline zijn
  `calc(Npx * var(--text-scale, 1))` (behalve ≥ 40px). Nieuwe tekstgroottes ook zo schrijven.

## De echte radio (eerste test in de auto, 4 november 2026)

- Systeem UJC201_64 (platform CYA), Android 15, AArch64, ±6 GB RAM, 128 GB. Build UJC201-V1.1.45R7-251115,
  MCU JCST_Q8_8T7-2024.08.09. Paneelinformatie zegt MIPI 720x1280: echte resolutie nog controleren
  (`adb shell wm size` / `wm density`, of de regel "screen" in een probleemrapport).
- PandaOS 1.3.0 draait als gewone app (nog niet als startscherm). Geïnstalleerd via de noodroute (APK op de radio
  gedownload); adb-koppeling is nog niet gedaan.
- **WebView**: standaard stond Android System WebView **66** (2018) erop → zwart scherm. Na installatie van WebView
  138 werkt PandaOS. Vanaf 1.3.1 toont de launcher bij een WebView onder 111 (bouwdoel Vite 8) een uitleg met knoppen
  in plaats van een zwart scherm. Nog testen: blijft 138 actief na herstart van de radio?
- **CAN**: de radio meldt "Protocol niet verbonden", CanBox-versie leeg. CanBox-optie stond op
  *Simple-Volkswagen-Magotan-2016~2019-All* (MQB/Passat B8), niet PQ35. Volgende stap: Fabrieksinstelling (1234) →
  Kan instellingen → huidige keuze noteren → een Golf 6/PQ35-protocol kiezen (bij Simple Soft/Raise/Hiworld meestal
  iets als "Volkswagen (oud/General) Golf 6 / Sagitar / Magotan 2007-2015"), herstarten, kijken of "niet verbonden"
  verdwijnt. Blijft het zo: fysiek kijken of er een CAN-kastje achter de radio zit en aangesloten is.
  Alternatief: Bluetooth-OBD2 (ELM327) voor snelheid/toeren/temperaturen (geen deuren/lichten/achteruit).
- CAN-monitor zag alleen GPS-regels met "speed" (`WatermarkService`, `AtcLocationService`, `AudioService.updateAslSpeed`):
  vanaf 1.3.1 apart als "GPS (geen CAN)" en niet meer als snelheid. `Protocol false id 6` (AudioService) kwam steeds terug.
- Geen stuurknoppen, handmatige airco. CAN-app van de fabrikant: `com.can.activity` ("Voertuig informatie").
- Niet aanraken op de radio: alle gegevens wissen, OTA/lokale/MCU/CANBUS-updates, schermparameters,
  helderheidsbereik, uitvoervermogen, mic winst.

**Opgelost in 1.3.1**: verzonnen waarden weg (brandstof 72% en 18 °C: nu `carState.fuelPercent/rangeKm/outsideTemp`,
verborgen zolang de auto niets doorgeeft); de app viel om zonder internet omdat het 3D-licht (HDR) van internet
kwam, nu meegeleverd in `client/public/hdr`; WebView-uitleg; GPS uit de CAN-detectie. Nog open: de "72"-knoppen
onderin (klimaat) zijn plaatshouders; de auto heeft handmatige airco.

**Nieuw in 1.3.6 (5 november 2026)**: Nav-knop in de dock deed niets (geen actie voor 'maps' sinds panelFirst), nu
openMap/closeAll. Kaart: PDOK alleen binnen de omtrek van Nederland (`NL_OUTLINE` in Map.tsx), daarbuiten of als PDOK faalt
de OpenStreetMap-tegels (CARTO vraagt sinds 2026 een API-sleutel); melding op de kaart + logboek als tegels niet laden
(geen internet / verkeerde klok / server). Maximumsnelheid (services/speedLimit.ts): wegen in 500 m vóór de auto ophalen
(Overpass, drie servers, 40 s), zelf de weg kiezen op afstand + rijrichting, NL:urban/zone30 en maxspeed:conditional
(snelweg 100/130). Overpass is soms erg traag (30-80 s). Controlelampjes onder P R D (WarningLights.tsx, outline, gordel
onderaan; `carState.seatbeltUnfastened`), te leren in Koppelen: gordel, mistlampen voor/achter. App Auto-info opent de
CAN-app van de radio (`openCarInfoApp`, eerst com.can.activity).

**Uitgebracht in 1.3.7**: Instellingen in de stijl van de Tesla-video. Zoeken werkt (store/settingsIndex.ts, resultaten vervangen de pagina). Software: auto in eigen lak bovenaan (momentopname van het 3D-canvas, services/carSnapshot.ts), naam (`vehicleSettings.vehicleName`), venster Meer voertuiginformatie (profiel + radio, geen km-stand/VIN). Colouriser bij Voertuig > Lak (ring + vlak, Effen/Metallic/Mat = `paintFinish`, eigen kleuren `customPaints`). Wifi: naam in de kopregel, Verborgen netwerk (opent Android-wifi), Zoeken met draaiend rondje. Bluetooth: Gekoppelde apparaten als kaart met Verbreken/Apparaat vergeten. LAPTOP-ADB.md heeft een draaiboek (A-F) en tools/settings-diff.ps1.

**Uitgebracht in 1.3.8** (na het radio-onderzoek van 5-11-2026; de lijst staat in TODO-VOLGENDE-VERSIE.md):
- Achteruitrijcamera (RearCamera.tsx): camera 8 eerst, camera's die niet openen worden overgeslagen. Er is een venster
  "Camera kiezen" met Zoeken. Klikken in het camerascherm sluit de camera niet meer. Dashcam heet nu Achteruitrijcamera.
- Veegstrook voor het paneel: 48 px over de hele breedte via touch-events op window. Er ligt geen laag meer over de bovenbalk.
- Geavanceerd → Radio-instellingen (RadioSystem.kt, na `pm grant WRITE_SECURE_SETTINGS`):
  - systeembalk (`policy_control`);
  - volumebalk (overscan via IWindowManager, alleen Android 9);
  - paneel op slot;
  - status van hd2cam.
- Nieuwe apps, als half paneel naast de auto (van rechts in beeld, licht/donker):
  - Theater (video-apps; staat de app er niet op, dan opent de Play Store);
  - Arcade (geïnstalleerde games);
  - Toybox (Regenboogvloer, Scheetkussen, Tekenblok, Haardvuur, Spuiterij);
  - Diagnose (eigen app, stond eerst onder Software).
  Een app openen vanuit Theater/Arcade schuift hem van onder in beeld (launchAppSlideUp).
- Instellingen in de tegels van de Figma-kit (IconTiles.tsx):
  - Voertuig: lak met Groen en Kleurenkiezer; velgen met een eigen Kleurenkiezer; eigen kleuren lang indrukken om
    ze te hernoemen of te verwijderen; uitlaat met Geen en in chroom; Ja/Nee bij Grafische kwaliteit.
  - Geavanceerd: Hulpmiddelen en CAN-kastje als tegels. Mijn auto staat nu bij Software → Meer voertuiginformatie.
- Software opgeschoond: Over als tabel, Automatisch controleren als knop met venster.
- Scherm:
  - Taal als knop met venster, ook voor Android (`pm grant CHANGE_CONFIGURATION`).
  - Tijd en tijdzone automatisch/handmatig. Een tijdzone of tijd zetten werkt alleen als apparaateigenaar;
    anders toont PandaOS zelf de gekozen zone.
  - Nachtfilter Uit/Aan.
  - App-menu direct of omhoog schuiven.
  - Dock-pictogrammen meegroeien of vast, met een eigen grootte; alle iconen in de dock schalen mee.
- Schermreinigingsmodus over het hele scherm (portal).
- Koppelen in de CAN-monitor: wat alleen via een werkend CAN-kastje komt, is ingeklapt.

## Nog open

**Klaar voor 1.3.1 (nog niet uitgebracht: David wil er eerst nog dingen bij, 4 november 2026)**: app Ontwikkelaarsopties
(app-menu/dock, alleen op de radio); Settings → Software → WebView (versie, bijwerken via Play Store, implementatie
kiezen); dockhoogte instelbaar (Settings → Scherm, 48–96 px, pictogrammen schalen mee, `--dock-height`/`--dock-scale`);
klimaatknoppen ("72") alleen als `carState.climateLeft/Right` bekend is; Settings → Voertuig → Grafische kwaliteit
(Snel = geen schaduwen, dpr 1, geen anti-aliasing; Hoog = dpr max 1,5; ContactShadows rekent alleen de eerste 60 beeldjes);
PandaOS-paneel: Optimalisatie (vrij geheugen, achtergrond-apps sluiten via killBackgroundProcesses, nooit PandaOS,
toetsenbord of auto-/Bluetooth-/CarPlay-apps); paneel van de fabrikant vervangen: focusverlies zonder onPause →
paneel dicht (ACTION_CLOSE_SYSTEM_DIALOGS/collapsePanels, mag door targetSdk 28) en PandaOS-paneel open. Getest op de
emulator ook op 1280×720 en 800×480. Nog testen op de radio: het paneel van de fabrikant.

**Na 1.3.3 (5 november 2026, nog niet uitgebracht)**:
- **App-groepen** (`store/appGroups.ts`, QuickActionsApp): tegel "Nieuwe groep" → apps kiezen (tikken = erin/eruit, knop
  "Alle Google-apps toevoegen"), hernoemen, groep verwijderen (apps weer los). Map toont 4 mini-pictogrammen. Opgeslagen in
  localStorage `pandaos-app-groups`. Sleutels: PandaOS-id of `pkg:<pakket>`.
- **Spraakinvoer** op de microfoon-toets: `VoiceInput.kt` (Android SpeechRecognizer, meestal van de Google-app; online).
  Webtoetsenbord: bridge startVoiceInput/stopVoiceInput → `PandaOS.voiceInput` → strook boven het toetsenbord
  (Luisteren…/tussenresultaat/melding), eindresultaat achteraan het veld. Android-toetsenbord: tussenresultaat als
  composing-tekst, zonder toestemming opent PandaOS de vraag (EXTRA_REQUEST_MIC). Taal volgt PandaOS (nl-NL/en-US).
  RECORD_AUDIO in het manifest. Laptop/Pi: Web Speech API als de browser die heeft. Op de emulator: toestemming en
  foutmelding getest; de herkenning zelf gaf "network" (emulator), op de radio nog testen.
- Weergave op de lichtschakelaar: werkt al via Koppelen → Stadslicht/Dimlicht (zet vehicleLightsOn → donker thema).
- i18n: app-namen van Android gaan door t(); daarom CAN-groep "Rijden" als sleutel 'Driving' (niet 'Drive', anders heet
  Google Drive "Rijden").
**Derde test in de auto (5 november 2026, 1.3.2)**: radio is echt **Android 9** (sdk 28; versietekst zegt 12/15),
SoC ac8257 (MediaTek-achtig, Jancar/ATC). Achteruit geleerd via Koppelen werkt. Dubbele achteruitcamera (PandaOS + radio):
nieuw Settings → Voertuig → Achteruitcamera "Van de radio" (standaard op de radio: PandaOS toont alleen R) of
"Van PandaOS". Volume: VOL-knoppen van de radio gaan via de radio-dienst (JLOG KeyCodeListener keyCode 330) naar de
audiochip (AudioBD37534 setvolume881), niet via het Android-volume. Nieuw: CarSignals volgt systeeminstellingen met
vol/sound/audio/gain in de naam (logboek "Instelling veranderd: ...") en Koppelen heeft "Volume van de radio" (0-40,
bijv. leren op "setvolume881 to"). "Systeempaneel opent bij achteruit": nog onduidelijk welk paneel (foto nodig).
Geen CAN-regels in het rapport: CAN-kastje geeft nog niets door.
**CAN-koppelen en Verbinding (5 november 2026, nog niet uitgebracht)**: CAN-monitor heeft nu de tabbladen Live, Detectie,
**Koppelen**, **Verbinding** en Apps.
- Koppelen (`CanLinkPanel.tsx`, `canSignals.ts`, `CanLinks.kt`): per functie (achteruit, handrem, 4 deuren, achterklep,
  stadslicht, dimlicht, grootlicht, knipperlichten, alarmlichten, snelheid, brandstof, buitentemperatuur, actieradius)
  "Leer aan/uit" of "Leren" → 10 s de handeling doen → regels die in de 30 s daarvoor niet voorkwamen (getallen genegeerd)
  → regel kiezen, zoektekst aanpassen → Koppeling opslaan. Opgeslagen op de radio (SharedPreferences `pandaos_canlinks`).
  Launcher vergelijkt elke logregel/broadcast en roept `PandaOS.canSignal({func, action, value})` aan → autostatus,
  3D-model, meldingen. Met koppelingen leest de monitor op de achtergrond door (ook met de app dicht).
  Getest op de emulator met een testregel (deur linksvoor ging open in het model).
- Let op: Android 13+ vraagt bij elke nieuwe logcat-sessie om eenmalige toegang, ook na `pm grant READ_LOGS`.
  Dus één keer "Toestaan" per opstart van PandaOS; broadcasts werken zonder.
- Verbinding (`CanConnectionPanel.tsx`): seriële poorten (bekende namen rechtstreeks geprobeerd, want /dev doorbladeren mag
  niet), leesbaar/schrijfbaar, CAN-interfaces, systeemeigenschappen (can/mcu/protocol/backcar/jancar), CAN-apps.
  Seriële poorten zijn normaal alleen voor het systeem; zijn ze op de radio leesbaar, dan kan PandaOS later de ruwe data lezen.
- Startscherm: Settings → Apps → Startscherm (`HomeScreenPanel.tsx`, bridge getHomeApps/setHomeApp/openHomeSettings/openHomeApp).
**Tweede test in de auto (5 november 2026, 1.3.1) en wat er daarna veranderd is (nog niet uitgebracht):**
- Werkt: wifi, Bluetooth, helderheid, nachtfilter, update via GitHub, WebView 138.
- Achteruit: de radio is een **Jancar**-platform. Bij R neemt de camera-app `com.jancar.hd2cam` het scherm over
  (Camera Type: DVR(RCA), videobron AHD 720P 25fps); in de log `BackCarService`/`BackcarMonitor` (MSG_EVENT_BACKCAR_STOP),
  de CAN-app `com.can.activity` (pakket `com.autoai.canbus`, RadarBase.doReverse) en de broadcast
  **`android.backcar.action.FINISH`** bij het einde. Nieuw: `CarSignals.kt` luistert naar backcar-broadcasts
  (START/ENTER/... en FINISH/EXIT/...), schrijft elke backcar-broadcast in het diagnoselogboek en zet R in PandaOS.
  Omdat de naam voor het begin nog onbekend is: venster over PandaOS zonder aanraking + ooit een backcar-broadcast gezien
  = achteruit (focus terug = einde). Achteruitcamera in PandaOS zelf kan pas als de camera niet door hd2cam bezet is
  (log: Camera3-Device "No such device"); later: hd2cam uitzetten (apparaateigenaar: setApplicationHidden) en testen.
- Bug 1.3.1: bij R opende het PandaOS-paneel (focusverlies door de camera-app). Nu telt alleen een veeg vanaf de
  bovenrand (laatste aanraking < 1,5 s, y < 60 dp) als paneel.
- Volume: PandaOS-volume was alleen weergave. Nu gekoppeld aan het Android-mediavolume (STREAM_MUSIC): ophalen bij start,
  `android.media.VOLUME_CHANGED_ACTION` → `PandaOS.systemVolume`, pijltjes = één echte stap (adjustStreamVolume),
  schuifbalk = setStreamVolume. Nog testen of de VOL-knoppen van de radio (gaan naar de audiochip BD37534) het
  Android-volume veranderen: zie "Volume van de radio" in het diagnoselogboek.
- Muziek zei "geen telefoon verbonden": keek alleen naar de PandaOS-server (Pi). Nu op de radio via de Bluetooth van Android.
- Telefoon: bellen gaat via de Bluetooth-app van de radio (proces "Bluetooth2023"); de Telefoon-app herkent die nu als
  keuze in Settings → Apps → Telefoon.
- CAN: Simple heeft voor Golf alleen 2013~Now; **Hiworld** heeft Golf 2008~2012 (gekozen, systeem herstart). Beide gaven
  nog geen autodata (`mCarSpeedAvailableInProtocol false`). Na Hiworld veranderde de airco-weergave (misschien toeval, of
  het kastje praat wel met de auto). Volgende stap: merk op het CAN-kastje achter de radio aflezen (sticker), dan dat
  merk + Golf 2008~2012 kiezen. Raise (RZC) is bij VW PQ ook gangbaar.
- Geen data zonder CAN: deuren, lichten/grootlicht, brandstof, onderhoud (kilometerstand), weergave op lichtschakelaar.
- PandaOS wordt vaak overschreven door de radio-software: PandaOS is nog geen startscherm en geen apparaateigenaar.
  Radio: Meer instellingen → **Selectie van het startvenster** → PandaOS; Fabrieksinstelling → Applicatieselectie starten.

**Gevonden in de auto, nog uitzoeken:**
- **Achteruit**: in R verandert PandaOS niets en de camera-app van de radio neemt het scherm over. Volgende keer: CAN-monitor
  aan (Alles, niet Alleen auto), in R zetten, Probleem melden → daarin staat welk signaal/welke app de radio gebruikt.
  Daarna: PandaOS luistert naar dat signaal (`setReverseSignal`), en in Fabrieksinstelling → Camera Type Settings /
  Function Settings kijken of de eigen achteruitcamera-app van de radio uit kan (of PandaOS hem na openen meteen vervangt).
- **Toetsenbord**: het Android-toetsenbord verscheen in plaats van het PandaOS-toetsenbord. Zonder apparaateigenaar moet het
  één keer aangezet worden: Settings → Apps → Toetsenbord → PandaOS-toetsenbord gebruiken (Android vraagt aanzetten en
  kiezen), of via adb: `adb shell ime enable nl.pandaos.launcher/.PandaKeyboardService` en
  `adb shell ime set nl.pandaos.launcher/.PandaKeyboardService`.
- Foto's bekeken (4 november 2026): "Simple" in *Simple-Volkswagen-Magotan-2016~2019-All* is het merk van het
  CAN-kastje (**Simple Soft**); alleen het automodel is fout (Magotan 2016+ = MQB). In Kan instellingen binnen de
  Simple-lijst een Volkswagen-optie voor Golf 6 / PQ35 / "General" / 2008–2015 kiezen. In PandaOS: CAN-kastje
  Simple Soft, protocol VW PQ35. Nog nodig: foto van de keuzelijst in Kan instellingen (exacte namen).
- Paneel 720x1280 (MIPI, staand ingebouwd) draait liggend als 1280×720; PandaOS getest op die maat. Geheugen: 2,4 van
  6,4 GB in gebruik, dus traagheid komt eerder van de grafische chip/WebView dan van te weinig geheugen.
- Klimaat is handmatig (draaiknoppen Climatic), dus de "72"-knoppen horen weg (gedaan in 1.3.1).

**Later (plan)**:
- **App-groepen** in het app-menu: zelf groepen maken, hernoemen en verwijderen (bijv. "Google" met Gmail, Drive, Play
  Store, Foto's, Voice Search) en apps erin slepen.
- **Voertuigmodellen downloaden**: bij meer modellen het gekozen model op Android opslaan (launcher downloadt het naar de
  app-opslag), met terugval: eerst het opgeslagen model, anders internet, en het meegeleverde Golf 6-model altijd als
  laatste terugval. Nu zit het enige model (Golf 6) al in de APK en werkt het zonder internet.

**Laptop met adb via wifi** (logs live met Claude, vaste logtoegang, CAN-app onderzoeken, root, apparaateigenaar): [LAPTOP-ADB.md](LAPTOP-ADB.md).

**Radiotest**: draaiboek voor de laptop (alleen adb, geen Android Studio) in [RADIOTEST.md](RADIOTEST.md).

**Met de emulator (afgesproken lijst, 4 november 2026, per stap):**
2. Achteruitrijcamera op de radio: via ADB kijken of de achteruitrijcamera als gewone Android-camera beschikbaar
   is (dan werkt het camerabeeld meteen; anders via de camera-app/-service van de fabrikant).
   **Later (idee)**: opnemen wat er achter de auto gebeurt, opslaan op Android met instelbare bewaartermijn
   (Settings → Camera/Dashcam), en automatisch opnemen als een auto heel dichtbij komt (bijv. bumperkleven op de snelweg).
3. Op de radio: de Bluetooth-app van de fabrikant opzoeken (pakketnaam) en testen via Settings → Apps → Bluetooth;
   wifi verbinden met wachtwoord en Bluetooth koppelen/verbinden met je telefoon testen.
   **CarPlay** testen kan alleen op de radio (of met een CarPlay-dongle), niet op de emulator: de emulator heeft
   nagebootste Bluetooth en geen USB/MFi-chip, dus een iPhone kan er geen CarPlay mee maken. Op de emulator kan
   alleen de PandaOS-kant (CarPlay-app herkennen en volledig scherm openen).
5. **CAN-bus op de radio uitzoeken** (gereedschap is klaar, zie "CAN-bus" bij Klaar): in de fabrieksinstellingen
   (code 1234) kijken welk kastje/protocol er staat en dat in Settings → Voertuig → CAN-bus kiezen; daarna met de
   CAN-monitor-app en/of `tools/radio-diagnose.ps1` de signalen vastleggen (R, deuren, lichten, stuurknoppen …) en
   per signaal een vertaling naar `PandaOS.setCarState()` schrijven.
6. Spraakinvoer op de microfoon-toets (webtoetsenbord en Android-toetsenbord) via Android-spraakherkenning.

**Afgesproken volgorde (4 november 2026)**: 1) CAN-bus (gereedschap klaar; vertalen op de radio),
2) software-updates via GitHub + diagnose/logboek (klaar), 3) overige taken, 4) als laatste spraakinvoer.
7. Echte autogegevens: op de radio via ADB uitzoeken wat het CAN-kastje doorgeeft (deuren, lichten,
   knipperlichten, achteruit, buitentemperatuur, kilometerstand, misschien actieradius) en doorgeven met
   `PandaOS.setCarState()`. Onderhoud: turbodruk en foutcodes (DTC) kunnen vrijwel zeker alleen via OBD2
   (Bluetooth-dongle, ELM327); de versnelling 1–6 bij handgeschakeld ook.
6. Model: de voorbumpers (a, b, gtd, r) liggen ook over elkaar; eventueel net als achter opruimen.
7. Mediasessie testen met een spelende app; stuurknoppen/mediatoetsen.
8. GPS-routes afspelen (Extended controls → Location): Ritten, snelheidswaarschuwing, P/D.
9. Release-build met eigen ondertekening (nu alleen debug-APK).

**Op de radio zelf (ADB, draadloos debuggen):**
- Achteruit-signaal, verlichtingssignaal, CAN-gegevens voor Maintenance.
- Exacte pakketnamen van de CarPlay-app (CPLink/ZLink/AutoKit) en ANWB Onderweg → invullen in `client/src/store/appLinks.ts`.
- Bluetooth van de radio, root (voor een eigen Android-bootanimatie).

**Nog niet op het scherm bekeken:** Audio Settings met 6 schuiven, tab Apps, Ritten, Wi-Fi- en Navigation-tab.
**Gepauzeerd:** AMS (iPhone-muziekinfo via BLE, `server/tools/ams-bridge`).

## Opzetten op een nieuwe computer

1. Installeer **Node.js 24** (gebruikt: v24.15.0, npm 11.12.1).
2. Kopieer de projectmap **zonder** `client/node_modules` en `server/node_modules` (scheelt ~345 MB).
3. In `client/` en `server/`: `npm install`.
4. Starten: server `node server/index.js` (poort 8080), client `npm run dev -- --port 5000` in `client/`
   (HTTPS met eigen certificaat; zie ook `.claude/launch.json`).
5. Spotify: de client-ID staat in `client/src/services/spotify.ts`. In het Spotify-dashboard moet de
   redirect-URI `https://127.0.0.1:5000/` (zelfde poort) geregistreerd staan.
6. Android Studio installeren. Android Studio gebruikt Java 25, daarom Gradle 9.8.2 + Android Gradle Plugin 9.5.0
   (vereist Build-Tools 36, die Gradle zelf downloadt).

## Launcher bouwen en testen

1. Webapp bouwen, in `client/`: `npx vite build` (niet `npm run build`: dat stopt op de oude typecheck-meldingen).
2. APK bouwen, in `android/`: `gradlew.bat assembleDebug` (met `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`).
   Resultaat: `android/app/build/outputs/apk/debug/app-debug.apk`. Of open de map `android/` in Android Studio.
3. Emulator **PandaOS_Radio_1024x600** (Android 15, Google Play, 1024 × 600, 160 dpi).
   Starten met `ANDROID_SDK_ROOT` ingesteld, anders blijft hij hangen op de melding "Detected ADB".
4. Installeren en als startscherm instellen:
   `adb install -r app-debug.apk` en `adb shell cmd package set-home-activity nl.pandaos.launcher/.MainActivity`.
5. Live herladen zonder steeds een APK: zet `pandaos.devUrl=https://10.0.2.2:5173` in `android/gradle.properties`
   en start de Vite-dev-server; de debug-build accepteert dan het eigen certificaat van Vite.
6. Debuggen: `chrome://inspect` op de laptop (alleen debug-build). Of via adb:
   `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` en dan DevTools-protocol op poort 9333.
7. Starten als losse processen (los van een Claude-sessie), anders stoppen emulator en build als de sessie wegvalt.
8. Meldingen-toegang zonder tikken: `adb shell cmd notification allow_listener nl.pandaos.launcher/nl.pandaos.launcher.MediaListenerService`.

Let op: in deze kopie van de projectmap ontbreekt `server/`; alleen `client/` en `android/` staan erin.

## Afspraken voor de code

- Commentaar in het Nederlands, zelfde stijl als de bestaande code.
- Nieuwe teksten in het Engels in de code en via `t('...')`; Nederlandse vertaling in `client/src/i18n.ts`.
- Tesla-stijl via de `tsl-*`-klassen uit `client/src/assets/scss/_tesla-ui.scss`.
- Compacte radio-layout via `@media (max-width: 1280px)`.
- Bekende oude typecheck-meldingen (niet nieuw): ontbrekende types voor `settings.js` en `jmuxer`,
  `headlights`/`leftBlinker`/`rightBlinker` in SidebarPane, ongebruikte imports, `vite.config.ts` https-type.
- Niet te veel taken tegelijk; per stap afronden en melden.
