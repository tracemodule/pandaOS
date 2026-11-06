// Inhoud van Instellingen > Software > Release notes (ReleaseNotes.tsx). Nieuwste versie bovenaan.
// Per versie de nieuwe functies: titel (kort) en uitleg. Bij een nieuwe versie hier een blok toevoegen.
export type NoteItem = { title: string; text: string; icon: string };
export type VersionNotes = { version: string; items: NoteItem[] };

export const RELEASE_NOTES: VersionNotes[] = [
  {
    version: '1.4.2',
    items: [
      { icon: 'phone', title: 'Bestuurdersprofielen', text: 'Tik bovenin op je naam: wissel van bestuurder, voeg een bestuurder toe of open Profielinstellingen. Elk profiel heeft eigen scherm-, navigatie-, geluids-, veiligheids- en app-instellingen en een eigen dock.' },
      { icon: 'view', title: 'Opslaan zichtbaar', text: 'Verander je iets in de instellingen, dan staat bij je naam even Opslaan… en daarna Opgeslagen.' },
      { icon: 'view', title: 'Weer', text: 'Tik op de temperatuur bovenin voor het weer: verwachting per uur, regenkans, luchtvochtigheid, wind, UV en luchtkwaliteit.' },
      { icon: 'car', title: 'Bovenaanzicht in R', text: 'Zet je de auto in de achteruit, dan draait de 3D-auto vloeiend naar een bovenaanzicht naast de camera.' },
      { icon: 'menu', title: 'Vegen en schuiven', text: 'Het app-menu schuift van onderen omhoog en weer omlaag; sleep het omlaag om te sluiten. Instellingen en andere apps veeg je overal naar rechts dicht, het PandaOS-menu veeg je omhoog dicht.' },
      { icon: 'menu', title: 'Wifi en Bluetooth bovenin', text: 'Tik op het wifi- of Bluetooth-icoon bovenin om meteen naar die instellingen van PandaOS te gaan.' },
      { icon: 'route', title: 'Kaart', text: 'Rechts op de kaart staan knoppen voor satelliet, verkeer, plekken en tankstations. Zoek op bijvoorbeeld eten of tanken voor een lijst in de buurt, en tik op een plek voor de details.' },
    ],
  },
  {
    version: '1.4.1',
    items: [
      { icon: 'update', title: 'Updatepagina', text: 'Bij Instellingen > Software > Bekijken en installeren zie je wat er nieuw is, download je de update met voortgang en installeer je hem daarna met Nu installeren (alleen in P). PandaOS start vanzelf opnieuw en meldt dat de update gelukt is.' },
      { icon: 'car', title: 'Zuiniger en vlotter', text: 'De 3D-auto wordt alleen getekend als er iets beweegt. Draaien, knipperlichten en neon blijven vloeiend, maar in rust gebruikt PandaOS veel minder rekenkracht. Arcade, Theater, Diagnose, CAN-monitor en CarPlay laden pas als je ze nodig hebt.' },
      { icon: 'view', title: 'Studio verbeterd', text: 'De studio-achtergrond is opnieuw opgebouwd, zodat hij op elke radio stabiel draait.' },
    ],
  },
  {
    version: '1.4.0',
    items: [
      { icon: 'car', title: 'Auto in de studio', text: 'Je auto staat nu in een ruimte met een verlichte vloer, zoals in een showroom, licht of donker met het thema mee. Uit te zetten bij Instellingen > Voertuig > Studio.' },
      { icon: 'view', title: 'Weer in de bovenbalk', text: 'Naast de tijd staat het weer met de buitentemperatuur, voor de plek waar je bent (of je tijdzone). Weet de auto de buitentemperatuur, dan zie je die. Aan of uit bij Instellingen > Scherm.' },
      { icon: 'phone', title: 'SOS', text: 'Bovenin staat een SOS-knop. Een tik opent Telefoon met 112 al ingevuld; bellen doe je zelf met de groene knop.' },
      { icon: 'phone', title: 'Bellen werkt', text: 'Bellen vanuit Contacten en Telefoon gaat nu via de Bluetooth-telefoon van de radio. Lukt het niet, dan zie je een melding. De gesprekslijst toont per gesprek een gekleurd icoon: inkomend groen, uitgaand blauw, gemist rood.' },
      { icon: 'radio', title: 'Bluetooth-app', text: 'Bluetooth is nu een eigen app: je telefoons en apparaten als kaarten (tik om te verbinden), wat er speelt, en muziekapps om direct vanuit te streamen.' },
      { icon: 'radio', title: 'Radio', text: 'Nieuwe app Radio voor FM, AM en DAB van de radio zelf, met zenders, favorieten en direct afstemmen. De zenders leert PandaOS van de radio-app van de auto.' },
      { icon: 'menu', title: 'App-menuknop', text: 'De knop van het app-menu in de dock is groter en verandert bij openen in een kruisje.' },
      { icon: 'radio', title: 'Muziekbalk altijd zichtbaar', text: 'Op het startscherm staat de muziekbalk nu altijd naast Navigeren, ook als er niets speelt.' },
      { icon: 'radio', title: 'Bluetooth-muziek speelt door', text: 'Als je in PandaOS op afspelen tikt bij muziek van je telefoon, zet PandaOS de radio eerst op Bluetooth-muziek. Daarna stopt de muziek niet meer na een seconde.' },
      { icon: 'radio', title: 'Speelt via CarPlay', text: 'Speelt er muziek via CarPlay of Android Auto, dan zie je dat op de muziekbalk. Tik op de naam om CarPlay of Android Auto te openen.' },
      { icon: 'volume', title: 'Volume niet meer te zacht', text: 'Op de radio regelt PandaOS nu alleen het volume van de radio zelf (0-40). Het tweede volume van Android blijft altijd vol, zodat het geluid niet meer te zacht is.' },
      { icon: 'menu', title: 'Systeembalk blijft weg', text: 'Heb je de systeembalk van de radio verborgen, dan verbergt PandaOS hem opnieuw als de radio hem terugzet, bijvoorbeeld na een herstart of na CarPlay. Ook het verbergen van de volumebalk werkt nu vanuit PandaOS.' },
      { icon: 'phone', title: 'CarPlay automatisch verbinden', text: 'Bij Radio-instellingen zet je uit dat CarPlay vanzelf verbindt. Dan neemt je iPhone de wifi en het geluid niet meer ongevraagd over.' },
      { icon: 'update', title: 'Build: Publicatie of Ontwikkelaar', text: 'Bij Instellingen > Software kies je Ontwikkelaar om de radio met de laptop te testen (tools/pandaos.mjs). Zet hem daarna terug op Publicatie.' },
      { icon: 'menu', title: 'Kleine verbeteringen', text: 'De veegstrook bovenaan voor het PandaOS-menu is breder. Lukt wifi of Bluetooth aan- of uitzetten niet, dan meldt PandaOS dat en opent de Android-instellingen. Bij de camera-app van de radio staat nu een waarschuwing: laat hem aan, anders werken CarPlay en Android Auto niet.' },
    ],
  },
  {
    version: '1.3.9',
    items: [
      { icon: 'route', title: 'Ritten', text: 'PandaOS neemt elke rit op: de route, afstand, rijtijd, gemiddelde en topsnelheid, en elke keer dat je hard optrekt of hard remt. Bekijk ze per dag bij Instellingen > Ritten en tik op een rit voor de route op de kaart. Aan of uit en alles wissen bij Instellingen > Navigatie.' },
      { icon: 'home', title: 'Thuis en Werk', text: 'Stel je thuis- en werkadres in bij Instellingen > Navigatie of in de kaart. Op het startscherm staat naast de muziekbalk het kaartje Navigeren: één tik op Thuis of Werk en de route start, ook in Waze of Google Maps.' },
      { icon: 'half', title: 'Apps naast de auto', text: 'Waze, Google Maps, Flitsmeister, Energy en Spotify openen half naast de auto. Rechtsboven op de app staan de knoppen sluiten en volledig scherm.' },
      { icon: 'volume', title: 'Volume zoals de radio', text: 'Het volume loopt van 0 tot 40, net als de knop van de radio. Tik op de speaker voor de volumebalk, en op het tandwiel ervan voor alle volumes van de radio. Ook in andere apps verschijnt de volumebalk van PandaOS.' },
      { icon: 'menu', title: 'PandaOS-menu overal', text: 'Veeg in elke app bovenaan omlaag voor het menu van PandaOS met wifi, Bluetooth, helderheid, volume en meldingen.' },
      { icon: 'phone', title: 'Contacten, Agenda en Berichten', text: 'Nieuwe apps met de gegevens van je telefoon. Contacten komen standaard alleen van je telefoon; die van een Google-account kun je aanzetten bij Instellingen > Bluetooth. In Telefoon veeg je een gesprek weg en voeg je contacten toe.' },
      { icon: 'dock', title: 'Dock aanpassen', text: 'Tik in het app-menu op Aanpassen om apps naar Mijn apps te slepen. Kies bij Instellingen > Scherm hoeveel recente apps je ziet en waar de knop van het app-menu staat.' },
      { icon: 'camera', title: 'Flitspalen', text: 'Vaste flitspalen en trajectcontroles uit OpenStreetMap staan op de kaart, en PandaOS waarschuwt als je er een nadert (Instellingen > Veiligheid).' },
      { icon: 'shield', title: 'Rechten', text: 'Alle rechten van PandaOS staan bij Instellingen > Rechten, met wat ze doen en hoe je ze geeft. Daar kies je ook het startscherm.' },
      { icon: 'view', title: 'Standaard of Geavanceerd', text: 'Bij Instellingen > Software kies je de weergave. Standaard verbergt de CAN-instellingen, de CAN-monitor en de grafische kwaliteit; alles blijft werken.' },
      { icon: 'route', title: 'Slimmere kaart', text: 'Na het kiezen van een adres zie je de hele route met de reistijd erop, en tot drie routes om uit te kiezen. Bij de drie puntjes kun je later vertrekken. De knop 2D/3D kantelt de kaart, Centreren brengt je terug na het verschuiven en een tik op de kaart geeft knoppen om in en uit te zoomen.' },
      { icon: 'route', title: 'Plekken en Mapbox', text: 'Tankstations (voor jouw brandstof), laadpalen, eten, parkeren en boodschappen op de kaart; kies ze bij Instellingen > Navigatie. Daar kies je ook de kaart: PandaOS of Mapbox met files.' },
      { icon: 'radio', title: 'Klank en bronnen', text: 'De equalizer in Audio-instellingen regelt nu het geluid van de radio. De nieuwe app Audio toont de bronnen van de radio, zoals FM/DAB, Bluetooth, USB en AV-in. Balans en fader stel je in bij de geluidsinstellingen van de radio.' },
      { icon: 'theater', title: 'Nieuw in Toybox', text: 'Voertuig: open de deuren en test alle lampen van de 3D-auto. Neon: kies kleur, effect en kanten onder je auto. Minigun: voor de grap op het dak. Alleen het plaatje verandert, nooit je echte auto.' },
      { icon: 'car', title: 'Kenteken', text: 'Zet je kenteken op de 3D-auto bij Instellingen > Voertuig, voor en achter. Het blijft alleen op deze radio en is met één schakelaar aan of uit te zetten.' },
      { icon: 'update', title: 'Testen met de laptop', text: 'Met de laptop zet je de radio in één keer klaar en test je alles: lampen, deuren, achteruit, volume, klank en camera. Zie RADIOTEST.md op GitHub.' },
    ],
  },
  {
    version: '1.3.8',
    items: [
      { icon: 'camera', title: 'Achteruitrijcamera', text: 'PandaOS probeert eerst camera 8 en slaat camera\'s over die niet openen. Met Camera kiezen zoek je zelf de juiste camera.' },
      { icon: 'menu', title: 'Paneel', text: 'Veeg over de hele breedte van de bovenrand omlaag voor het PandaOS-paneel.' },
      { icon: 'radio', title: 'Radio-instellingen', text: 'Bij Geavanceerd zet je de systeembalk, de volumebalk en het paneel van de radio aan of uit.' },
      { icon: 'theater', title: 'Theater, Arcade en Toybox', text: 'Videoapps, games en speelgoed, half naast de auto.' },
      { icon: 'car', title: 'Voertuig', text: 'Lak, velgen, uitlaat en meer in tegels, met eigen kleuren die je een naam kunt geven.' },
      { icon: 'clock', title: 'Taal, tijd en tijdzone', text: 'Ook voor Android zelf in te stellen bij Instellingen > Scherm.' },
    ],
  },
];

// Handleiding: hoe dingen werken
export const MANUAL: NoteItem[] = [
  { icon: 'dock', title: 'De dock', text: 'Links het VW-logo voor Instellingen. In het midden je recente apps, de knop van het app-menu en Mijn apps. Rechts het volume: tik op de speaker voor de volumebalk, de pijltjes zetten het volume een stap hoger of lager.' },
  { icon: 'menu', title: 'Het PandaOS-menu', text: 'Veeg bovenaan het scherm omlaag. Je ziet wifi, Bluetooth, weergave, instellingen, helderheid, volume, optimalisatie en de meldingen van je apps. Veeg omhoog of tik ernaast om te sluiten.' },
  { icon: 'half', title: 'Apps naast de auto', text: 'Navigatie- en muziekapps openen half naast de auto. Sluiten met het kruisje rechtsboven, volledig scherm met de knop ernaast. Tik op de auto om terug te gaan.' },
  { icon: 'route', title: 'Navigeren', text: 'Tik op Navigeren en typ een adres. Kies bij Instellingen > Apps of Nav de PandaOS-kaart, Waze, Google Maps of Flitsmeister opent.' },
  { icon: 'phone', title: 'Bellen', text: 'Verbind je telefoon via Bluetooth. In Telefoon zie je recente gesprekken en contacten; de groene knop belt via de radio.' },
  { icon: 'shield', title: 'Rechten via de laptop', text: 'Sommige rechten geeft Android alleen via de laptop (adb). Bij Instellingen > Rechten staat per recht de opdracht.' },
  { icon: 'radio', title: 'Klank en bronnen', text: 'Open de app Audio voor de bronnen van de radio, of Muziek > Audio-instellingen voor toon, balans en opties. Balans en fader gaan via de geluidsinstellingen van de radio.' },
  { icon: 'update', title: 'Bijwerken', text: 'Bij Instellingen > Software zoekt PandaOS nieuwe versies op GitHub. Installeren gaat met één knop.' },
];

// Leer PandaOS kennen: korte tips
export const GET_TO_KNOW: NoteItem[] = [
  { icon: 'car', title: 'Je auto in 3D', text: 'Stel lak, velgen en uitlaat in bij Instellingen > Voertuig. Het model laat ook de lichten, deuren en remlichten zien.' },
  { icon: 'dock', title: 'Je eigen dock', text: 'Open het app-menu, tik op Aanpassen en sleep apps naar Mijn apps.' },
  { icon: 'route', title: 'Ritten terugkijken', text: 'Bij Instellingen > Ritten zie je waar je hebt gereden, met je gemiddelde en topsnelheid.' },
  { icon: 'theater', title: 'Spelen in Toybox', text: 'Open Toybox voor neon onder je auto, een minigun op het dak of om de deuren en lampen van de 3D-auto te testen.' },
  { icon: 'view', title: 'Rustiger instellingen', text: 'Zet Instellingen > Software > Weergave op Standaard om technische instellingen te verbergen.' },
];
