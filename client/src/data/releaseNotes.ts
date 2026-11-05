// Inhoud van Instellingen > Software > Release notes (ReleaseNotes.tsx). Nieuwste versie bovenaan.
// Per versie de nieuwe functies: titel (kort) en uitleg. Bij een nieuwe versie hier een blok toevoegen.
export type NoteItem = { title: string; text: string; icon: string };
export type VersionNotes = { version: string; items: NoteItem[] };

export const RELEASE_NOTES: VersionNotes[] = [
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
