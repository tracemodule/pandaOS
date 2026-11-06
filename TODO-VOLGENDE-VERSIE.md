# Takenlijst volgende versie (na 1.4.4)

## Open na 1.4.4 (6 november 2026)
- **Op de radio testen** (zie RADIOTEST.md): OBD2 met een echte dongle en `bt-check` met de telefoon tegelijk,
  Radio-app (afstemmen), bellen via de Jancar-Bluetooth-app, "Speelt via CarPlay/AA", volumebalk verbergen,
  Telefoon-app ziet of de telefoon verbonden is, geluiden van Geluidenbord en Boost.
- **Toybox bijschaven na het testen**: regen is op de lichte achtergrond slecht te zien; boost-vlammen zie je vanaf de
  voorkant niet; vuurwerk nu de hele dag op 31 dec/1 jan (eventueel alleen 's avonds: `holidaysOn` in `toyFx.ts`).
- **Later (afgesproken)**: welkomstwizard bij de eerste start, laadscherm, splitsen in processen + aparte
  Updater-app. Herstartreden staat al in het logboek: eerst gegevens van de radio bekijken.

---
Hieronder oudere lijsten (1.3.8 – 1.3.9), ter naslag.


Vaste lijst met alles wat David heeft gevraagd. Bijwerken zodra iets klaar is. Pas committen als de lijst af is
(of als David dat zegt). Videotijden verwijzen naar https://www.youtube.com/watch?v=0hZyOJGAggo

## Bugs uit de proefrit van 5-11 (gemaakt, nog niet gecommit; nog testen op de radio)
- **PandaOS boven andere apps** (PandaOverlay.kt + OverlayApp.tsx, index.html#overlay). Zodra een andere app vooraan
  staat (CarPlay, Waze ...):
  - bovenaan een veegstrook van 20 dp: omlaag vegen opent het PandaOS-menu (wifi, Bluetooth, weergave, instellingen,
    helderheid, volume, meldingen);
  - verandert het volume, dan verschijnt bovenaan de nieuwe PandaOS-volumecontainer (liggende schuif, links een
    instellingen-icoon naar de geluidsinstellingen), en na 3 s gaat hij weer weg;
  - het scherm blijft liggend, ook als een app staand wil (ANWB Onderweg draaide het scherm om).
  De volumebalk en het menu van de radio zelf blijven weg. Nodig, eenmalig via de laptop:
  `adb shell appops set nl.pandaos.launcher SYSTEM_ALERT_WINDOW allow`. Getest op de emulator: container, menu en
  liggend scherm. Nog testen op de radio: de veeg (valt de strook onder de overscan van -110?) en het volume via de knop.
- **Volume 0-40 in plaats van 0-100**:
  - PandaOS leest het meestervolume van de radio uit het logboek ("VOLUME_MASTER : n", READ_LOGS).
  - De knop van de radio gaat dan gewoon door naar de radio; PandaOS toont het nieuwe volume.
  - De pijltjes en de schuif zetten het meestervolume. Of `adjustSuggestedStreamVolume` echt het meestervolume van
    Jancar verandert, moet op de radio blijken.
  - Zonder logtoegang valt PandaOS terug op het Android-volume, omgerekend naar 0-40.
  - Op de emulator alleen de webkant getest: Android 13+ geeft een app niet zomaar het hele logboek.
- **Snelheid springt bij stilstand naar 1-5 km/h**: rijden pas als twee GPS-metingen achter elkaar boven 7 km/h liggen,
  met een goede fix; stilstaan pas na twee metingen onder 3 km/h.
- **Snelheid ~5 km/h lager dan het dashboard**: GPS is de echte snelheid, het dashboard wijst wettelijk te hoog aan.
  Nieuwe instelling bij Scherm, "Snelheid zoals het dashboard": +0 tot +10 km/h.

## Test-emulator met Android 9 (zoals de radio)
- Nieuwe emulator `PandaOS_Radio_Android9` (1024x600, Google Play, x86). Starten met:
  `emulator -avd PandaOS_Radio_Android9 -no-snapshot -dns-server 8.8.8.8,1.1.1.1 -gpu swiftshader_indirect -feature GLESDynamicVersion`
  (met de laptop-GPU loopt de 3D-auto vast op het laadscherm; dat geldt alleen voor de emulator, niet voor de radio).
- WebView: Chrome 101 is de WebView (de laatste versie voor 32-bit x86). De webapp wordt daarom nu gebouwd voor
  Chrome 100 (`build.target` in client/vite.config.ts, MIN_WEBVIEW = 100); dat is ook veiliger voor oudere radio's.
- Ingesteld zoals op de radio: WRITE_SECURE_SETTINGS, READ_LOGS, CHANGE_CONFIGURATION, boven andere apps tonen,
  losse vensters, ontwikkelaarsmodus, `policy_control immersive.full=*` (Android-balk weg in alle apps).
- "Systeembalk van de radio verbergen" geldt nu voor alle apps (`immersive.full=*`), niet alleen voor PandaOS.
- Emulator zoals de radio: geen navigatiebalk onderaan (`hw.mainKeys=yes`) en de statusbalk buiten beeld met
  `adb shell wm overscan 0,-24,0,0` (de radio doet dat met -110).
- Getest op Android 9 met Google Maps (Waze en Flitsmeister zijn er niet voor 32-bit x86):
  - half venster rechts van de auto, precies boven de dock, geen Android-balken, PandaOS blijft over het hele scherm;
  - de grijze Android-balk boven het venster valt buiten beeld (venster 42 px hoger, past binnen de 110 px-rand);
  - rechtsboven op de app twee doorzichtige knoppen van PandaOS: sluiten en volledig scherm (HalfAppControls);
  - sluiten (knop of kruisje van Android): de app weg en de auto weer over het hele scherm;
  - Spotify opent ook half (Energy en Nav al).
- Vensters boven andere apps rekent Android 9 vanaf de overscan-rand: PandaOS meet dat na en corrigeert het (de
  veegstrook voor het PandaOS-menu stond daardoor op de radio buiten beeld).

## Gemaakt op 5-11 avond (getest op de Android 9-emulator, nog niet op de radio, nog niet gecommit)
- **Dock zoals de video (10:50-12:09)**: knop Aanpassen/Klaar boven het app-menu, in bewerkmodus "Recente apps" links en
  "Mijn apps" rechts met lijntjes, wit kruisje op Mijn apps, na Klaar kort "Opgeslagen". Recente apps 1-4 (instelling,
  standaard 2) en de knop van het app-menu links/midden/rechts (standaard midden). Mijn apps worden bewaard.
- **Volume-icoon (08:11)**: speaker met drie boogjes die met het volume meegaan; bij 0 een kruisje.
- **Muziekbalk**: volgt licht/donker. Zonder rechterpagina (Figma Mockups > Car status) staan muziekbalk en het kaartje
  Navigeren (Thuis/Werk) samen onderaan in het midden.
- **Thuis en Werk**: instellen in een pop-up met adreszoeker (PDOK), in Instellingen > Navigatie en in de kaart (lang
  indrukken of nog niet ingesteld). Thuis/Werk = route in de PandaOS-kaart of navigeren in Waze/Google Maps.
- **Telefoon**: recent gesprek wegvegen, tik op contact = gegevens, contact toevoegen via PandaOS (opgeslagen in
  Android), witte bel-iconen. Ook in de app Contacten.
- **Ritten**: elke rit opgenomen (route, afstand, rijtijd, gem./topsnelheid, hard optrekken/remmen; einde na 2 min
  stilstand of bij de volgende start). Nieuwe pagina met periodefilter, totalen, ritten per dag en een pop-up met de
  route op de kaart. Instellingen > Navigatie: ritten opnemen aan/uit en alle ritten verwijderen.
- **Achterlichten 3D-model**: rood in plaats van oranje.
- **Software > Weergave**: Standaard verbergt CAN-kastje, CAN-monitor, voertuigprotocol en grafische kwaliteit
  (blijven werken); Geavanceerd toont alles.
- **Release notes en handleiding**: link "Release notes" bij Software-update; scherm met tabbladen Leer PandaOS kennen,
  Handleiding en Release notes (zoals de video 36:12). Inhoud in client/src/data/releaseNotes.ts (per versie bijwerken).
- **Software**: het auto-plaatje is altijd vanuit dezelfde hoek, ook als je de auto zelf draait. Ritten: tellers A/B weg.
- **Flitspalen** (gemaakt, niet getest: de Overpass-servers van OpenStreetMap reageerden niet): op de kaart en een
  waarschuwing met piep bij nadering, aan/uit bij Instellingen > Veiligheid (services/speedCameras.ts).
- **Laptop**: `node tools/pandaos.mjs` (status, volume, set, open, bluetooth, media, sources, log, js) via adb;
  voor het uitzoeken van Bluetooth-muziek en -contacten op de radio. Toont nooit contacten of nummers.

## Nieuw uit de proefrit (nog te doen)
- **Kaart (PandaOS-navigatie)**: GEMAAKT: na een adres uitzoomen tot de hele route, reistijd als label op elke route,
  meerdere routes (tik = kiezen), drie puntjes > Later vertrekken (aankomst rekent mee). Thuis/Werk-knoppen op de kaart
  weer weggehaald (niet mooi); Thuis/Werk via het kaartje Navigeren en Instellingen.
- **Plekken op de kaart + brandstof**: GEMAAKT, niet getest: Instellingen > Navigatie: brandstof (Euro 95 ... Elektrisch)
  en Op de kaart (tankstations, laadpalen, eten, parkeren, boodschappen, toiletten). Komt uit Overpass, en die servers
  waren op 5-11 avond onbereikbaar (ook flitspalen en maximumsnelheid hangen daarvan af).
- **Kaart-onderbouw (besluit van David nodig)**: MapLibre GL + OpenFreeMap (gratis, geen sleutel, 2D/3D-kantelweergave,
  plekken zitten in de kaart zelf) i.p.v. Leaflet; routes met tol/snelweg vermijden via openrouteservice of Mapbox.
  Verkeersborden: Nederlandse borden als eigen SVG's in PandaOS (vrij te gebruiken), de plek van de borden van de NDW.
- **Gemaakt 6-11 (getest op de Android 9-emulator)**:
  - Remlicht standaard uit zolang er geen handrem-signaal binnenkomt (brakeApplied begint op false).
  - Toybox > **Voertuig**: deuren open/dicht, stadslicht, dimlicht, grootlicht, knipperlichten, alarmlichten, remlicht,
    achteruitrijlicht. Alleen het 3D-model (toyCar), de echte autostatus blijft ongemoeid. Achterklep kan niet in dit model.
  - Toybox > **Neon**: kleur, vast/pulseren/regenboog, links/rechts/voor/achter. Toybox > **Minigun** (model van David,
    public/models/minigun.glb) midden op het dak.
  - **Klank**: equalizer uit Audio-instellingen werkt nu via de Android-equalizer (AudioFx.kt, sessie 0; emulator: 5
    banden). Balans/fader kan Android 9 niet: knop naar de geluidsapp van de radio. **Bronnen**: FM/DAB, Bluetooth,
    USB, AV-in en Spotify worden herkend aan de apps op de radio; app **Audio** in het app-menu opent Bronnen.
  - **Kenteken** (Instellingen > Voertuig): geel NL-kenteken als dun 3D-plaatje voor en achter; plek wordt uit het
    model gemeten (koplampen = voorkant, straal naar bumper/achterklep). Aan/uit-schakelaar. Alleen lokaal bewaard
    (vehicleSettings.licensePlate); nooit in repo, logboek of probleemrapport.
  - **Laptop**: `tools/pandaos.mjs` setup, doctor, apks, can, sim (--hold), camera, audio, shot, test. Zie RADIOTEST.md.
    Testrondje op de emulator: 14 van 15 geslaagd; bij "camera dicht" liep de emulator zelf vast (nagemaakte camera).
- **Mapbox als tweede kaart** (gemaakt 5-11): Instellingen > Navigatie > Kaart: PandaOS (standaard) of Mapbox. Mapbox
  komt als gewone kaarttegels (navigation-day/-night van Mapbox, met verkeer), dus zonder WebGL: Mapbox GL zat de
  3D-auto in de weg en de Standard-stijl werkt niet op een GPU met 256 vertex-uniforms (emulator, mogelijk ook de
  radio). Standaard-token van David in components/navigation/mapbox.ts (publiek pk.-token); eigen token kan in de
  instellingen. Eigen kleuren: stijl in Mapbox Studio opslaan en de stijl-URL gebruiken (nog niet gebouwd).
  Tip: in Mapbox de token beperken tot `https://appassets.androidplatform.net`.
- **Plekken op de kaart** werken nu: via Mapbox-zoeken per soort (een uur bewaard per stukje kaart), anders
  OpenStreetMap. Tik op een plek = naam en adres. Toiletten alleen via OpenStreetMap.
- **Kaartknoppen**: alleen 2D/3D (kantelt echt), Centreren na wegschuiven, tik op de kaart = in-/uitzoomen en Klaar.
- **Open data**: files en wegwerkzaamheden (NDW), parkeergebieden en tarieven (RDW), APK-datum via kenteken (lokaal).
- **MapTiler**: besproken, nog niet toevoegen.
- **Telefoongegevens** (gemaakt, op de emulator getest met een nep-Bluetooth-contact; testen op de radio):
  - Nieuwe PandaOS-apps naast de auto: **Contacten**, **Agenda**, **Berichten** (PhoneDataApps.tsx), ook in dock/app-menu.
  - Contacten standaard alleen van de telefoon (Bluetooth) en de radio zelf; Google-contacten alleen met de instelling
    Instellingen > Bluetooth > "Contacten uit Google-account".
  - Telefoon gebruikt dezelfde bron; bellen via de telefoon-app van de radio.
  - Agenda: een telefoon deelt zijn agenda niet via Bluetooth; alleen via een account op de radio.
  - Op de radio controleren: `getPhoneDataSources()` laat zien welke opslag gevuld is en welke Jancar-apps een eigen
    telefoonboek hebben.
- **Muziek van de telefoon** (gemaakt, op de emulator nagebootst): meldingen-toegang zet PandaOS zelf aan; PandaOS
  luistert ook naar muziekmeldingen (broadcasts) van apps zonder mediasessie. De muziekbalk verschijnt nu ook als
  PandaOS geen Bluetooth-verbinding ziet, zodra er iets speelt (de radio gebruikt een eigen Bluetooth-module).
- **Licht bij het starten** (opgelost): bij het opstarten neemt PandaOS de laatste stand van elke CAN-koppeling
  (licht, deuren ...) uit het logboek over (CanLinks.replayLastState). Getest op de emulator.
- **OBD2 via Bluetooth** (dongel komt 6-11): eerst kijken of de radio de dongel naast de telefoon kan verbinden;
  daarna in PandaOS uitlezen (ELM327 via SPP).
- **Waze, Flitsmeister, Google Maps en Energy (ANWB Onderweg) half openen** (gemaakt, nog testen op de radio):
  - Nav opent nu de gekozen app (Waze/Google Maps/Flitsmeister) in plaats van de PandaOS-kaart; Flitsmeister staat bij
    de keuzes.
  - De app opent als Android-venster in vrije vorm, rechts 70 % naast de auto (launchAppHalf). Android zet er zelf
    een balk boven met volledig scherm en sluiten; PandaOS toont links ook "Volledig scherm" en "Sluiten".
  - Vraagt `enable_freeform_support` = 1 en `force_resizable_activities` = 1 (kan PandaOS zelf zetten met
    WRITE_SECURE_SETTINGS: enableFreeform) en daarna één keer herstarten.
  - Emulator (Android 15), werkt nu:
    - Nav opent het rechterpaneel zoals Instellingen (auto naar links, 0,4 s) en daarna verschijnt Waze precies in
      dat paneel, boven de dock, zonder animatie van Android zelf.
    - PandaOS krimpt niet meer als Android zijn balken toont (geen zwarte balken, dock blijft op zijn plek); de
      PandaOS-kop wordt verborgen zolang de app half staat.
    - Andere dockhoogte: Waze krijgt de nieuwe maat (nieuwe taak; Waze start dan opnieuw op).
    - Links onder de auto de knop "Volledig scherm"; daarna opent Nav hem weer half.
    - Tik op de auto: de app gaat weg en de auto komt terug, net als bij Instellingen.
    - De klok en pictogrammen van Android liggen (doorzichtig) over de bovenrand zolang Waze de focus heeft.
  - Opgelost: PandaOS sprong op R zodra Waze de focus kreeg (gezien als camera-app van de radio).
- **Muziekbalk bij CarPlay en andere bronnen**: PandaOS toont nu alleen apps die een Android-mediasessie hebben.
  Op de radio uitzoeken welke app CarPlay is en of die een sessie meldt. Dat kan met
  `adb shell dumpsys media_session` terwijl CarPlay muziek speelt. Anders: "CarPlay speelt" tonen bij actieve audio.
- **Klank en balans in Muziek werken niet**: dat is punt 3 hieronder. Eerst proberen zonder APK's: met PandaOS open
  in de Jancar-geluidsinstellingen klank en balans veranderen. PandaOS schrijft elke systeeminstelling met
  sound/audio/vol in de naam in het diagnoselogboek; slaat Jancar ze daar op, dan kan PandaOS ze zelf zetten.
- **Offline kaart**: de kaart (Leaflet, PDOK/OSM-tegels) werkt nu alleen met internet. Plan: een kaart van Nederland
  downloaden als één bestand (vectortegels/PMTiles) op de radio, en die gebruiken als er geen internet is. Ook de
  route (nu OSRM via internet) heeft dan een offline oplossing nodig.
- **PandaOS-instellingen via de laptop** ("DevTools"): met de radio via adb verbonden een pagina op de laptop waarin
  je volume, instellingen enzovoort van PandaOS aanpast. Dat gaat via dezelfde DevTools-verbinding die we nu
  gebruiken (adb forward), dus zonder open poort op de radio.

## Open
1. **Zoekbalk van Instellingen**: de container moet anders. Wacht op uitleg van David: wat precies?
2. **Volume**:
   - Volumepagina: GEMAAKT (VolumePage.tsx, via het icoon in de volumebalk, ook boven andere apps). Opgebouwd zoals
     "Hoogte van de dock". Hoofdvolume (0-40) schuifbaar; daaronder alleen de volumes die er zijn: elk volume dat de
     radio in zijn logboek meldt (ook nieuwe, bijv. AUX), Bluetooth alleen met een verbonden telefoon. Die tonen de
     waarde van de radio (laatste waarde onthouden, ook na een herstart); zetten via "Aanpassen" (volumepagina van
     Jancar, alleen als die op de radio staat). Nog testen op de radio.
   - Volumeknop zoals in de video (08:24-08:49): GEMAAKT (VolumeBar.tsx). Tik op de speaker: liggende balk boven de
     dock, links een instellingen-icoon, `< >` in de dock, bij 0 een kruisje bij de speaker. Dezelfde balk verschijnt
     boven andere apps. Het icoon opent de volumepagina.
3. **Geluid en audio-app**:
   - Een geluidspagina met equalizer, balans/fader en bas/sub.
   - Een audio-app met de bronnen (FM/DAB, Bluetooth, USB, AV-in, Spotify).
   - Om dit zelf te kunnen instellen zijn eerst de APK's van `com.jancar.services` en `com.jancar.audiosettings`
     van de radio nodig.
4. **Rechten-pagina**: GEMAAKT (Instellingen > Rechten, PermissionsCenter.kt + PermissionsPanel.tsx). Startscherm,
   alle rechten met status (Auto, Telefoon, Systeem) en een knop Toestaan of de adb-opdracht; toetsenbord, paneel en
   media-toegang staan daar ook. Apps bevat alleen nog apps. Meldingen-toegang zet PandaOS zelf aan.
5. **Apps verwijderen in Apps**: eigen apps verwijderen (Android vraagt om bevestiging). Systeemapps van de radio,
   zoals een PDF-lezer, kunnen alleen worden uitgeschakeld via App-info.
6. **Telefoon** zoals in de video (17:37-18:44).
7. **Calendar en Messages** (18:46-20:23).
8. **Snelkoppelingen** (10:56-12:12). In bewerkmodus een knop "Done" boven het menu, de labels "Recent Apps" en
   "My Apps" boven de twee delen van de dock, en een kruisje op de apps in de dock. De rest van het fragment nog bekijken.
9. **P R N D of P R D** bij een handbak: wacht op het antwoord van David.
10. **Waze en Flitsmeister**: bestaan niet voor de Android 9-emulator (32-bit x86); half openen testen op de radio. Spotify en Google Maps werken op de emulator.
11. **OBD2-dongel via wifi**: koppelen. Let op: zolang hij verbonden is, heeft de radio geen internet.
12. **Pakketnamen**: gecontroleerd, alle drie kloppen (Videoland `nl.rtl.videoland.v2`, NPO Start `nl.uitzendinggemist`, HBO Max `com.wbd.stream`).
13. **LAPTOP-ADB.md bijwerken** met:
    - `pm grant … WRITE_SECURE_SETTINGS` (Radio-instellingen, tijd);
    - `pm grant … CHANGE_CONFIGURATION` (taal);
    - het ophalen van de Jancar-APK's;
    - `appops set nl.pandaos.launcher SYSTEM_ALERT_WINDOW allow` (PandaOS-menu, volumecontainer, knoppen half venster);
    - `settings put global enable_freeform_support 1` en `force_resizable_activities 1`, daarna herstarten (half venster).
14. **Testen op de radio**:
    - camera 8 en "Camera kiezen";
    - de veegstrook;
    - Theater, Arcade en Toybox;
    - de volumebalk-schakelaar (overscan, Android 9);
    - tijd, tijdzone en taal (zonder apparaateigenaar);
    - de dock-pictogrammen.
15. **Volgende versie uitbrengen**: alleen na akkoord van David.

## Uitgebracht in 1.3.8 (getest op de emulator, nog niet op de radio)
- Achteruitrijcamera:
  - camera 8 eerst, camera's die niet openen worden overgeslagen;
  - venster "Camera kiezen" met Zoeken;
  - klikken in het camerascherm sluit de camera niet meer.
- Dashcam heet nu Achteruitrijcamera, met het oude pictogram.
- Veegstrook voor het paneel: 48 px over de hele breedte; tikken in de bovenbalk gaan gewoon door.
- Geavanceerd → Radio-instellingen, met schakelaars voor:
  - de systeembalk van de radio;
  - de volumebalk van de radio;
  - het paneel op slot;
  - de camera-app van de radio, plus een knop om alles terug te zetten.
- Theater (21:20): paneel met video-apps; staat de app er niet op, dan opent de Play Store. Schuift omhoog in beeld en volgt licht/donker.
- Arcade (22:21): eigen app met de geïnstalleerde games en een eigen pictogram.
- Toybox (23:02): Regenboogvloer, Scheetkussen, Tekenblok, Haardvuur, Spuiterij.
- Koppelen in de CAN-monitor: signalen die alleen via het CAN-kastje komen, zijn ingeklapt.
- Snelmenu: het tandwiel overlapt Wipers niet meer.
- Voertuig in de tegels van de Figma-kit:
  - lak met Groen en de Kleurenkiezer;
  - velgen met Wit en een eigen Kleurenkiezer;
  - uitlaat met de optie Geen; de uitlaat is nu chroom;
  - Ja/Nee bij Grafische kwaliteit.
- Eigen kleuren (lak en velgen): lang indrukken om ze een naam te geven of te verwijderen. Standaardkleuren kunnen dat niet.
- Geavanceerd: tegels voor Hulpmiddelen en CAN-kastje; Voertuigprotocol weer zonder iconen en op volle breedte; Mijn auto weg.
- Software:
  - opgeschoond, met Over als compacte tabel;
  - Mijn auto-gegevens staan bij Meer voertuiginformatie;
  - Automatisch controleren is een knop met venster.
- Diagnose is een eigen app.
- Schermreinigingsmodus bedekt het hele scherm.
- Datum en tijd:
  - schakelaars voor Tijd automatisch en Tijdzone automatisch;
  - tijd handmatig instellen;
  - tijdzone via een knop met een keuzevenster;
  - werkt ook voor Android zelf, voor zover Android dat toelaat.
- Taal: knop met keuzevenster, ook voor Android (na `pm grant CHANGE_CONFIGURATION`).
- Dock-pictogrammen: meegroeien met de dock of een vaste grootte, plus een eigen grootte (70-150 %).
