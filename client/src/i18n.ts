// Vertalingen voor de interface. De Engelse tekst in de code is de sleutel; hier staat de Nederlandse versie.
// Ontbreekt een vertaling, dan blijft de Engelse tekst staan. Taal kiezen: Settings > Display > Language.
import { useUIStore } from './store/uiStore';

const NL: Record<string, string> = {
  // Settings-menu
  'Vehicle': 'Voertuig',
  'Display': 'Scherm',
  'Trips': 'Ritten',
  'Navigation': 'Navigatie',
  'Safety': 'Veiligheid',
  'Maintenance': 'Onderhoud',
  'Software': 'Software',
  'Wi-Fi': 'Wifi',
  'Bluetooth': 'Bluetooth',

  // Display
  'Language': 'Taal',
  'Appearance': 'Weergave',
  'Light': 'Licht',
  'Dark': 'Donker',
  'Auto': 'Auto',
  'Large': 'Groot',
  '12 Hour': '12-uurs',
  '24 Hour': '24-uurs',
  'Distance': 'Afstand',
  'Kilometers': 'Kilometer',
  'Miles': 'Mijl',
  'Automatic': 'Automaat',
  'Manual': 'Handgeschakeld',

  'Search Settings': 'Instellingen zoeken',
  'Night Filter': 'Nachtfilter',
  'Automatically adjust to warmer colors at night': "'s Nachts automatisch warmere kleuren",
  'Brightness': 'Helderheid',
  'Screen Clean Mode': 'Schermreinigingsmodus',
  'Text Size': 'Tekstgrootte',
  'Time': 'Tijd',
  'Energy Display': 'Energieweergave',
  'Temperature': 'Temperatuur',

  // Vehicle
  'Transmission': 'Versnellingsbak',
  'Paint': 'Lak',
  'Wheels': 'Velgen',
  'Window Tint': 'Raamtint',
  'Rear doors and tailgate only. Windshield and front side windows always stay clear.':
    'Alleen achterportieren en achterklep. Voorruit en voorste zijruiten blijven altijd helder.',

  // Safety
  'Speed Limit Warning': 'Snelheidswaarschuwing',
  'Warns you when you drive faster than the speed limit.': 'Waarschuwt als je harder rijdt dan de maximumsnelheid van de weg.',
  'Warn Above Limit': 'Waarschuwen boven limiet',
  'Warning': 'Waarschuwing',
  'Display: your speed turns red. Chime: also plays a sound.': 'Display: de snelheid kleurt rood. Chime: ook een geluidssignaal.',
  'Show Speed Limit': 'Maximumsnelheid tonen',
  'Shows the speed limit sign next to your speed while driving.': 'Toont het maximumsnelheidsbord naast je snelheid tijdens het rijden.',

  // Software
  'Version': 'Versie',
  'Made by David Cotino': 'Gemaakt door David Cotino',
  'Based on PandaOS (GPL-3.0) · 3D model "Volkswagen Golf 6" by GT Cars: Hyperspeed (CC-BY 4.0)':
    'Gebaseerd op PandaOS (GPL-3.0) · 3D-model "Volkswagen Golf 6" door GT Cars: Hyperspeed (CC-BY 4.0)',
  'About': 'Over',
  'Platform': 'Platform',
  'Screen': 'Scherm',
  'Map data': 'Kaartgegevens',
  'Routing': 'Routeplanning',

  // Bluetooth
  'Visibility': 'Zichtbaarheid',
  'Make Discoverable': 'Zichtbaar maken',
  'Visible as': 'Zichtbaar als',
  'Turn On Bluetooth': 'Bluetooth aanzetten',
  'My Devices': 'Mijn apparaten',
  'Nearby Devices': 'Apparaten in de buurt',
  'Connected': 'Verbonden',
  'Not connected': 'Niet verbonden',
  'Paired': 'Gekoppeld',
  'Unknown Device': 'Onbekend apparaat',
  'Forget': 'Vergeten',
  'Connect': 'Verbinden',
  'Disconnect': 'Verbreken',
  'Refresh': 'Vernieuwen',
  'Before we add your device, be sure it is turned on and discoverable.':
    'Zorg dat je apparaat aan staat en zichtbaar is voordat je het toevoegt.',

  // Maintenance
  'OBD2 adapter not connected. The values below appear once the adapter is plugged in.':
    'OBD2-adapter niet verbonden. De waarden hieronder verschijnen zodra de adapter is aangesloten.',
  'Model': 'Model',
  'VIN': 'Chassisnummer',
  'Odometer': 'Kilometerstand',
  'Engine & Diagnostics': 'Motor & diagnose',
  'Fault codes (check engine)': 'Foutcodes (motorstoring)',
  'Coolant temperature': 'Koelvloeistoftemperatuur',
  'Battery voltage': 'Accuspanning',
  'Fuel level': 'Brandstofniveau',
  'Read Fault Codes': 'Foutcodes uitlezen',
  'Clear Fault Codes': 'Foutcodes wissen',

  // Navigation
  'Navigation Volume': 'Navigatievolume',
  'Avoid Motorways': 'Snelwegen vermijden',
  'Avoid Tolls': 'Tolwegen vermijden',
  'Avoid Ferries': 'Veerponten vermijden',
  'Applies to the next route you plan.': 'Geldt voor de volgende route die je plant.',

  // Bluetooth en wifi via Android (op de radio)
  'On': 'Aan',
  'This device has no Bluetooth.': 'Dit apparaat heeft geen Bluetooth.',
  'Open Bluetooth Settings': 'Bluetooth-instellingen openen',
  'Pair and connect your phone in the Bluetooth screen of Android, or in the Bluetooth app of the radio (Settings > Apps > Bluetooth).':
    'Koppel en verbind je telefoon in het Bluetooth-scherm van Android, of in de Bluetooth-app van de radio (Instellingen > Apps > Bluetooth).',
  'PandaOS needs permission to see your paired devices.': 'PandaOS heeft toestemming nodig om je gekoppelde apparaten te zien.',
  'Turn on Bluetooth to see your devices.': 'Zet Bluetooth aan om je apparaten te zien.',
  'No paired devices yet.': 'Nog geen gekoppelde apparaten.',
  'Wi-Fi network': 'Wifi-netwerk',
  'Signal': 'Signaal',
  'Connected to': 'Verbonden met',
  // Software-update (Settings > Software)
  'Software Update': 'Software-update',
  'New version available': 'Nieuwe versie beschikbaar',
  'Installed': 'Geïnstalleerd',
  'Not checked yet.': 'Nog niet gecontroleerd.',
  'No releases published yet.': 'Nog geen versies gepubliceerd.',
  'PandaOS is up to date.': 'PandaOS is up-to-date.',
  'Check': 'Controleren',
  'Download and install': 'Downloaden en installeren',
  'Updates can be installed on the radio.': 'Updates installeer je op de radio.',
  'Downloading…': 'Downloaden…',
  'Installing… PandaOS restarts by itself.': 'Installeren… PandaOS start vanzelf opnieuw.',
  'Could not reach GitHub. Check the internet connection.': 'GitHub niet bereikbaar. Controleer de internetverbinding.',
  'Check automatically': 'Automatisch controleren',
  'Shows a notification at startup when a new version is available.': 'Geeft bij het opstarten een melding als er een nieuwe versie is.',
  'UPDATE AVAILABLE': 'Update beschikbaar',

  // Settings > Geavanceerd > Mijn auto
  'Advanced': 'Geavanceerd',
  'My car': 'Mijn auto',
  'Car': 'Auto',
  'Color': 'Kleur',
  'Engine': 'Motor',
  'Fuel': 'Brandstof',
  'Tyres': 'Banden',
  'Engine oil': 'Motorolie',
  'Service': 'Onderhoudsbeurt',
  'CAN protocol': 'CAN-protocol',
  'Reflex silver metallic': 'Reflexzilver metallic',
  '1.4 TSI (CAX), 90 kW / 123 hp, turbo': '1.4 TSI (CAX), 90 kW / 123 pk, turbo',
  'Petrol': 'Benzine',
  '6-speed manual': '6 versnellingen, handgeschakeld',
  '15,000 km / 12 months': 'verversen elke 15.000 km / 12 maanden',
  '30,000 km / 1 year': 'elke 30.000 km / 1 jaar',
  'Apply settings of my car': 'Instellingen van mijn auto toepassen',
  'Resets transmission, CAN bus, headlights, mirrors, grille, exhaust and paint to match this car.':
    'Zet versnellingsbak, CAN-bus, koplampen, spiegels, grill, uitlaat en lakkleur terug op deze auto.',

  // CAN-monitor-app
  'CAN monitor': 'CAN-monitor',
  'Recording': 'Neemt op',
  'Stopped': 'Gestopt',
  'lines': 'regels',
  'Car only': 'Alleen auto',
  'Everything': 'Alles',
  'Live': 'Live',
  'Detection': 'Detectie',
  'Only signals from known broadcasts. For the full radio log, allow it once via ADB:':
    'Alleen signalen van bekende broadcasts. Voor het volledige logboek van de radio: eenmalig toestaan via ADB:',
  'Reverse': 'Achteruit',
  'Lights': 'Verlichting',
  'Doors': 'Deuren',
  'Steering wheel keys': 'Stuurknoppen',
  'Speed / RPM': 'Snelheid / toerental',
  'Fuel / mileage': 'Brandstof / kilometerstand',
  'Handbrake / seatbelt': 'Handrem / gordel',
  'Parking sensors': 'Parkeersensoren',
  'Not seen yet': 'Nog niet gezien',
  'CAN box': 'CAN-kastje',
  'Protocol': 'Protocol',
  'Change in Settings > Vehicle > CAN bus.': 'Wijzigen in Instellingen > Voertuig > CAN-bus.',

  // CAN-bus (Settings > Voertuig)
  'CAN bus': 'CAN-bus',
  'CAN box (box ↔ radio)': 'CAN-kastje (kastje ↔ radio)',
  'Vehicle protocol (car ↔ box)': 'Voertuigprotocol (auto ↔ kastje)',
  'Same as radio': 'Zoals de radio',
  'Other': 'Anders',
  'VW PQ35 (Golf 5/6, Jetta, Scirocco)': 'VW PQ35 (Golf 5/6, Jetta, Scirocco)',
  'VW PQ46 (Passat B6/B7, CC)': 'VW PQ46 (Passat B6/B7, CC)',
  'VW MQB (Golf 7)': 'VW MQB (Golf 7)',
  'Choose the same CAN box and protocol as in the factory settings of the radio (code 1234). Not sure? Leave it on "Same as radio" and use the CAN monitor to find out.':
    'Kies hetzelfde CAN-kastje en protocol als in de fabrieksinstellingen van de radio (code 1234). Twijfel je? Laat het op "Zoals de radio" staan en zoek het uit met de CAN-monitor.',
  'Open CAN monitor': 'CAN-monitor openen',
  'Close CAN monitor': 'CAN-monitor sluiten',
  'The CAN monitor only works on the radio.': 'De CAN-monitor werkt alleen op de radio.',
  'For the full radio log, allow it once via ADB:': 'Voor het volledige logboek van de radio: eenmalig toestaan via ADB:',
  'Stop': 'Stoppen',
  'Save': 'Opslaan',
  'Only car-related lines': 'Alleen regels over de auto',
  'Saved as': 'Opgeslagen als',
  'Waiting for signals… Shift into R, open a door or turn on the lights.': 'Wachten op signalen… Schakel in R, open een deur of zet de lichten aan.',
  'Tap Start to begin.': 'Tik op Starten om te beginnen.',
  'Car-related apps on this radio': 'Apps op deze radio die met de auto te maken hebben',
  'None found.': 'Niets gevonden.',

  // PandaOS-toetsenbord in Android-apps
  'Keyboard': 'Toetsenbord',
  'The PandaOS keyboard is used in all apps.': 'Het PandaOS-toetsenbord wordt in alle apps gebruikt.',
  'Use PandaOS keyboard': 'PandaOS-toetsenbord gebruiken',
  'Choose "PandaOS-toetsenbord" in the list that opens.': 'Kies "PandaOS-toetsenbord" in de lijst die opent.',
  'Turn on "PandaOS-toetsenbord" in the Android screen that opens, come back and tap the button again.':
    'Zet "PandaOS-toetsenbord" aan in het Android-scherm dat opent, kom terug en tik nog een keer op de knop.',

  // PandaOS-paneel (veeg omlaag)
  'Panel': 'Paneel',
  'Notifications': 'Meldingen',
  'Clear all': 'Alles wissen',
  'No notifications.': 'Geen meldingen.',
  'Allow notification access in Settings > Apps to see notifications here.':
    'Geef meldingstoegang in Instellingen > Apps om hier meldingen te zien.',
  'Swiping down from the top opens the Android panel.': 'Omlaag vegen vanaf de bovenrand opent het Android-paneel.',
  'Swiping down from the top opens the PandaOS panel. The Android panel is turned off.':
    'Omlaag vegen vanaf de bovenrand opent het PandaOS-paneel. Het Android-paneel staat uit.',
  'Swiping down from the top opens the PandaOS panel. To turn off the Android panel completely, PandaOS must be device owner (once via ADB, see the handover document).':
    'Omlaag vegen vanaf de bovenrand opent het PandaOS-paneel. Om het Android-paneel helemaal uit te zetten moet PandaOS apparaateigenaar zijn (eenmalig via ADB, zie het overdrachtsdocument).',

  'Open automatically': 'Automatisch openen',
  'Opens CarPlay as soon as your phone connects via Bluetooth. Off: open it yourself.':
    'Opent CarPlay zodra je telefoon via Bluetooth verbindt. Uit: je opent het zelf.',
  'BLUETOOTH CONNECTED': 'Bluetooth verbonden',
  'BLUETOOTH DISCONNECTED': 'Bluetooth verbroken',
  'Networks': 'Netwerken',
  'Searching for networks…': 'Netwerken zoeken…',
  'Connecting…': 'Verbinden…',
  'Saved': 'Opgeslagen',
  'Secured': 'Beveiligd',
  'Open': 'Open',
  'Password': 'Wachtwoord',
  'Could not connect. Check the password and try again.': 'Verbinden lukte niet. Controleer het wachtwoord en probeer opnieuw.',
  'Then search for this radio on your phone and pair it.': 'Zoek daarna deze radio op je telefoon en koppel hem.',
  'The radio does not allow PandaOS to connect devices. Use the Bluetooth app of the radio (Settings > Apps > Bluetooth).':
    'De radio staat PandaOS niet toe apparaten te verbinden. Gebruik de Bluetooth-app van de radio (Instellingen > Apps > Bluetooth).',
  'Pair': 'Koppelen',
  'Pairing…': 'Koppelen…',
  'Searching for devices…': 'Apparaten zoeken…',
  'No devices found. Make sure your phone is discoverable.': 'Geen apparaten gevonden. Zorg dat je telefoon zichtbaar is.',
  'When pairing, Android asks you to confirm the code. That confirmation is always shown by the system.':
    'Bij het koppelen vraagt Android om de code te bevestigen. Die bevestiging toont het systeem altijd zelf.',

  // Achteruitrijcamera
  'No camera found. Connect the reversing camera to the radio.': 'Geen camera gevonden. Sluit de achteruitrijcamera aan op de radio.',
  'Switch camera': 'Andere camera',
  'Mirror': 'Spiegelen',

  // Tekstgrootte (Settings > Display)
  'Custom': 'Handmatig',
  'Keep this text size?': 'Deze tekstgrootte houden?',
  'Cancel': 'Annuleren',

  // Helderheid (Settings > Display)
  'Day': 'Dag',
  'Night': 'Nacht',
  'Now using day brightness': 'Nu dagstand',
  'Now using night brightness': 'Nu nachtstand',
  'No light signal from the car: switches by time (dark 19:00–06:00).':
    'Geen lichtsignaal van de auto: wisselt op tijd (donker 19:00–06:00).',
  'Following your car lights: lights on (night).': 'Volgt de verlichting van de auto: lichten aan (nacht).',
  'Following your car lights: lights off (day).': 'Volgt de verlichting van de auto: lichten uit (dag).',
  'Brightness now only applies inside PandaOS. Allow it to also apply in other apps.':
    'De helderheid geldt nu alleen in PandaOS. Geef toegang om hem ook in andere apps te laten gelden.',

  // Autostatus en Voertuig (3D-model)
  'Front left door open': 'Deur linksvoor open',
  'Front right door open': 'Deur rechtsvoor open',
  'Rear left door open': 'Deur linksachter open',
  'Rear right door open': 'Deur rechtsachter open',
  'Tailgate open': 'Achterklep open',
  'DOORS OPEN': 'Deuren open',
  'DOOR': 'Deur',
  'Detect': 'Automatisch herkennen',
  'The car reports:': 'De auto geeft door:',
  'No data from the car yet: shows P, R, N and D.': 'Nog geen gegevens van de auto: toont P, R, N en D.',
  'Shows P, R and D. The gear (1–6) needs OBD2.': 'Toont P, R en D. De versnelling (1–6) kan alleen met OBD2.',
  'Shows P, R, N and D.': 'Toont P, R, N en D.',
  'Exhaust': 'Uitlaat',
  'Headlights': 'Koplampen',
  'Halogen': 'Halogeen',
  'Xenon': 'Xenon',
  'Mirrors': 'Spiegels',
  'Body color': 'Wagenkleur',
  'Carbon': 'Carbon',
  'Grille': 'Grill',
  'Gloss black': 'Glanszwart',
  'Black': 'Zwart',
  'Chrome': 'Chroom',
  '1 left': '1 links',
  '2 left': '2 links',
  '1 right': '1 rechts',
  '2 right': '2 rechts',
  '1 left + 1 right': '1 links + 1 rechts',
  '2 left + 2 right': '2 links + 2 rechts',
  '2 in the middle': '2 in het midden',

  'Android apps': 'Android-apps',
  'Choose which Android apps appear in the app menu.': 'Kies welke Android-apps in het app-menu staan.',
  'Android Settings': 'Android-instellingen',

  'Other app…': 'Andere app…',
  'Not installed. Tapping the icon opens the Play Store.': 'Niet geïnstalleerd. Een tik op het pictogram opent de Play Store.',
  'Install': 'Installeren',
  'Not found on this device, so it is hidden.': 'Niet gevonden op dit apparaat, daarom verborgen.',
  'No matching app found on this device, so it is hidden. Pick one with Other app.':
    'Geen passende app gevonden op dit apparaat, daarom verborgen. Kies er een via Andere app.',
  'Audio': 'Audio',
  'Full screen': 'Volledig scherm',

  // Media-info van Android-apps (Settings > Apps, alleen op de radio)
  'Media info from Android apps': 'Media-info van Android-apps',
  'On: PandaOS shows and controls what is playing in your Android apps.':
    'Aan: PandaOS toont en bedient wat er speelt in je Android-apps.',
  'Allow access': 'Toegang geven',
  'Turn on PandaOS in the Android screen that opens, then come back.':
    'Zet PandaOS aan in het Android-scherm dat opent en kom dan terug.',

  // Wi-Fi
  'Internet': 'Internet',
  'Open Wi-Fi Settings': 'Wifi-instellingen openen',
  'Choose a network or hotspot in the Android Wi-Fi screen.': 'Kies een netwerk of hotspot in het wifi-scherm van Android.',
  'On the radio this opens the Android Wi-Fi screen. On this device, use its own Wi-Fi settings.':
    'Op de radio opent dit het wifi-scherm van Android. Gebruik op dit apparaat de eigen wifi-instellingen.',

  // Trips
  'Measured with GPS. Counts only while the car is moving.': 'Gemeten met GPS. Telt alleen terwijl de auto rijdt.',
  'Current Drive': 'Huidige rit',
  'Trip A': 'Rit A',
  'Trip B': 'Rit B',
  'Drive Time': 'Rijtijd',
  'Average Speed': 'Gemiddelde snelheid',
  'Top Speed': 'Topsnelheid',
  'Since': 'Sinds',

  // Settings > Apps
  'Apps': 'Apps',
  'Choose which app each PandaOS app opens. On the radio, your installed Android apps appear here.':
    'Kies welke app elke PandaOS-app opent. Op de radio verschijnen hier je geïnstalleerde Android-apps.',
  'None': 'Geen',
  'Nav': 'Nav',

  // App-menu
  'App Settings': 'App-instellingen',
  'Navigation App': 'Navigatie-app',
  'Music App': 'Muziek-app',
  'On Startup': 'Bij opstarten',
  'Home': 'Start',
  'Music': 'Muziek',
  'Settings': 'Instellingen',
  'Phone': 'Telefoon',
  'Camera': 'Camera',
  'Drag icons to My Apps to customize': 'Sleep pictogrammen naar Mijn apps om aan te passen',
  'My Apps': 'Mijn apps',
  'Recent Apps': 'Recente apps',
  'Google Maps and Waze open as real apps on the radio. Until then, Nav opens.':
    'Google Maps en Waze openen op de radio als echte apps. Tot die tijd opent Nav.',
  'Done': 'Klaar',

  // Music
  'Nothing playing': 'Niets aan het afspelen',
  'Search library...': 'Zoek in bibliotheek...',
  'Search tracks...': 'Zoek nummers...',
  'Search albums...': 'Zoek albums...',
  'Local / Bluetooth': 'Lokaal / Bluetooth',
  'Library': 'Bibliotheek',
  'Tracks': 'Nummers',
  'Albums': 'Albums',
  'Spotify requires login': 'Spotify vereist inloggen',
  'Log in with Spotify': 'Inloggen met Spotify',
  'No music found': 'Geen muziek gevonden',
  'Search for a song, album or playlist.': 'Zoek een nummer, album of playlist.',
  'is playing through PandaOS': 'speelt via PandaOS',
  'is connected': 'is verbonden',
  'This phone cannot send audio to PandaOS.': 'Deze telefoon kan geen audio naar PandaOS sturen.',
  'Start music in Spotify on your phone. Title, cover and controls appear above.':
    'Start muziek in Spotify op je telefoon. Titel, hoes en bediening verschijnen hierboven.',
  'Audio is coming in. Log in with Spotify for title, cover and controls.':
    'Het geluid komt binnen. Log in met Spotify voor titel, hoes en bediening.',
  'Connect your phone in Settings → Bluetooth, or choose Spotify Web in the menu above.':
    'Verbind je telefoon via Instellingen → Bluetooth, of kies Spotify Web in het menu hierboven.',

  // Navi
  'Navigate': 'Navigeren',
  'Clear': 'Wissen',
  'Continue on the road': 'Vervolg de weg',
  'End Trip': 'Rit beëindigen',
  'Start': 'Start',
  'More': 'Meer',
  'Satellite': 'Satelliet',
  'Route list': 'Routelijst',
  'Recenter': 'Centreren',
  'Charging stations': 'Laadpalen',

  // Phone
  'Recents': 'Recent',
  'Contacts': 'Contacten',
  'Keypad': 'Toetsen',
  'Calling...': 'Bellen...',
  'Mute': 'Dempen',
  'Muted': 'Gedempt',
  'End': 'Ophangen',
  'Close': 'Sluiten',
  'Call': 'Bellen',
  'Delete': 'Wissen',
  'No recent calls yet.': 'Nog geen recente oproepen.',
  'Search contacts': 'Zoek contacten',
  'No contacts yet. They appear when your phone shares them.':
    'Nog geen contacten. Ze verschijnen als je telefoon ze deelt.',
  'mobile': 'mobiel',
  'home': 'thuis',
  'work': 'werk',
  'Incoming call': 'Inkomende oproep',
  'Decline': 'Weigeren',
  'Answer': 'Opnemen',

  // Audio Settings
  'Audio Settings': 'Audio-instellingen',
  'Tone': 'Klank',
  'Balance': 'Balans',
  'Options': 'Opties',
  'Sources': 'Bronnen',
  'Reset': 'Herstellen',
  'Immersive Sound': 'Ruimtelijk geluid',
  'Off': 'Uit',
  'Standard': 'Standaard',
  'High': 'Hoog',
  'Low': 'Laag',
  'Medium': 'Gemiddeld',
  'Center': 'Midden',
  'Front': 'Voor',
  'Rear': 'Achter',
  'Speed-Dependent Volume': 'Snelheidsafhankelijk volume',
  'Raises the volume as you drive faster.': 'Zet het volume hoger naarmate je sneller rijdt.',
  'Phone connected': 'Telefoon verbonden',
  'No phone connected': 'Geen telefoon verbonden',
  'Active': 'Actief',
  'Select': 'Kiezen',
};

export type Language = 'en' | 'nl';

export const translate = (text: string, language: Language) =>
  language === 'nl' ? (NL[text] ?? text) : text;

// Hook voor componenten: const t = useT(); t('Settings')
export const useT = () => {
  const language = useUIStore((state) => state.displaySettings.language);
  return (text: string) => translate(text, language);
};
