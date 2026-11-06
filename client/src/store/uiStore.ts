import { create } from 'zustand';
import { getLinkedAndroidPackage, launchAndroidPackage } from './appLinks';
import { MY_VEHICLE_SETTINGS } from './vehicleProfile';
import { persist, createJSONStorage } from 'zustand/middleware';
import { 
  spotifyPlay, 
  spotifyPause, 
  spotifyNext, 
  spotifyPrev, 
  fetchUserPlaylists, 
  searchSpotify,
  setSpotifyToken,
  loginWithSpotify,
  exchangeCodeForToken,
  refreshSpotifyToken,
  isSpotifyTokenExpired,
  fetchNowPlaying
} from '../services/spotify';

export interface KnownBTDevice {
  name: string;
  address: string;
  mac?: string;
}

interface BTDevice {
  name: string;
  address: string; // id voor koppelen (Windows device-id, MAC op Linux, of COM-poort)
  mac?: string;
  paired?: boolean;
  connected: boolean;
}

interface SpotifyItem {
  id: string;
  name: string;
  imageUrl: string;
  uri: string;
  artist?: string; 
}

// --- Telefoon ---
export type PhoneTab = 'Recents' | 'Contacts' | 'Keypad';
export type CallState = 'idle' | 'incoming' | 'dialing' | 'active';
export interface PhoneCall {
  state: CallState;
  name: string;
  number: string;
  startedAt: number | null; // moment van opnemen (voor de gespreksduur)
  muted: boolean;
  outgoing: boolean;
}
export interface PhoneContact { name: string; numbers: { label: string; number: string }[] }
export interface PhoneRecent { name: string; number: string; type: 'incoming' | 'outgoing' | 'missed'; time: number }

const IDLE_CALL: PhoneCall = { state: 'idle', name: '', number: '', startedAt: null, muted: false, outgoing: false };

export type GearType = 'P' | 'R' | 'N' | 'D' | '1' | '2' | '3' | '4' | '5' | '6';

// --- Instellingen Types ---
// Tekstgrootte: alle tekst schaalt mee via de CSS-variabele --text-scale (font-size: calc(Npx * var(--text-scale)))
export const textScaleFor = (size: DisplaySettings['textSize'] | undefined, custom?: number) =>
  size === 'Large' ? 1.15 : size === 'Custom' ? (custom ?? 1.1) : 1;
export const applyTextScale = (scale: number) =>
  document.documentElement.style.setProperty('--text-scale', String(scale));
// Hoogte van de dock (Settings > Display): CSS-variabele --dock-height, gebruikt door de dock en het toetsenbord
export const DOCK_HEIGHT_DEFAULT = 64;
// Dock: hoogte van de balk en grootte van de pictogrammen (Settings > Display).
// iconMode 'follow': pictogrammen groeien mee met de balk (niet onder 85%); 'fixed': vaste grootte.
// iconScale (70-150 %) komt daar bovenop. Een pictogram (klikvlak 40 px) wordt nooit hoger dan de balk.
export const applyDockHeight = (px: number | undefined, iconMode: 'follow' | 'fixed' = 'follow', iconScale = 100) => {
  const height = px ?? DOCK_HEIGHT_DEFAULT;
  document.documentElement.style.setProperty('--dock-height', `${height}px`);
  const base = iconMode === 'follow' ? Math.max(0.85, height / DOCK_HEIGHT_DEFAULT) : 1;
  const scale = Math.min(base * (iconScale / 100), (height - 4) / 40);
  document.documentElement.style.setProperty('--dock-scale', String(scale));
};

export interface DisplaySettings {
  textSize: 'Standard' | 'Large' | 'Custom'; // Custom = handmatig met de schuifbalk (textScale)
  textScale?: number; // 0.85 - 1.4, alleen bij Custom
  timeFormat: '12h' | '24h';
  timeZone?: string; // bijv. 'Europe/Amsterdam'; leeg = die van Android
  energyDisplay: 'Percentage' | 'Distance';
  distance: 'Kilometers' | 'Miles';
  temperature: 'C' | 'F';
  showWeather?: boolean; // weer + buitentemperatuur in de bovenbalk (Open-Meteo); undefined = aan
  brightness: number; // 10-100 %, als Auto uit staat
  // Auto: dag- of nachthelderheid, mee met Weergave (licht/donker): verlichting van de auto (stadslicht/dimlicht via
  // het ILL-signaal), anders de klok. Opgeslagen instellingen van vroeger missen deze velden: gebruik ?? 100 / ?? 60.
  autoBrightness: boolean;
  dayBrightness?: number; // 10-100 %
  nightBrightness?: number; // 10-100 %
  nightFilter: boolean; // warmere kleuren als het donker is (minder blauw licht)
  language: 'en' | 'nl'; // taal van de interface (zie src/i18n.ts)
  dockHeight?: number; // hoogte van de zwarte balk onderin (dock), 48-96 px; standaard 64
  dockIconMode?: 'follow' | 'fixed'; // pictogrammen groeien mee met de dock, of vaste grootte
  dockIconScale?: number; // grootte van de dock-pictogrammen, 70-150 %; standaard 100
  dockRecentCount?: number; // aantal recente apps in de dock, 1-4; standaard 2
  uiMode?: 'standard' | 'advanced'; // Software > Weergave: standaard verbergt CAN, CAN-monitor, voertuigprotocol en grafische kwaliteit (werken wel door)
  dockMenuButton?: 'left' | 'middle' | 'right'; // plek van de knop van het app-menu in de dock; standaard midden
  speedometerOffset?: number; // km/h bovenop de GPS-snelheid, zodat PandaOS gelijk loopt met het dashboard (0-10)
  appMenuAnimation?: 'instant' | 'slide'; // app-menu (raster in de dock): direct tonen of omhoog schuiven
}

// Snelheidswaarschuwing (Settings > Safety). Snelheid via GPS; de maximumsnelheid van de weg uit kaartgegevens.
export interface SafetySettings {
  speedCameraWarning?: boolean; // waarschuwen voor vaste flitspalen (OpenStreetMap); standaard aan
  speedWarning: boolean;
  offset: number; // km/h boven de limiet voordat er gewaarschuwd wordt
  chime: boolean; // ook een geluidssignaal (anders alleen rode snelheid)
  showSpeedLimit: boolean;
}

// App-instellingen (in het app-menu): welke app NAV en muziek openen, en wat er bij het opstarten opent.
// Op de radio worden 'maps'/'waze' echte Android-apps; tot die tijd opent alles de PandaOS-varianten.
export interface AppSettings {
  contactsFromGoogle?: boolean; // Contacten: ook die van een Google-account op de radio (standaard alleen de telefoon)
  defaultNav: 'nav' | 'maps' | 'waze';
  defaultMusic: 'music' | 'spotify' | 'youtube';
  startup: 'home' | 'nav' | 'music';
  // Wat er verschijnt als je vanaf de bovenrand omlaag veegt (op de radio): het PandaOS-paneel of dat van Android
  panel: 'pandaos' | 'android';
  // Bij het opstarten kijken of er een nieuwe PandaOS-versie op GitHub staat (melding); standaard aan
  autoUpdateCheck?: boolean;
}

// Ritcomputer (Settings > Trips), gevuld door services/tripComputer.ts met GPS
export interface TripStats {
  distance: number; // meter
  driveTime: number; // seconden dat de auto reed
  maxSpeed: number; // km/h
  startedAt: number; // tijdstip van de laatste reset
}
export type TripKey = 'current' | 'tripA' | 'tripB';

// Opgenomen rit (services/driveLog.ts): route en cijfers, plus hard optrekken/remmen
export interface DriveEvent { type: 'accel' | 'brake'; lat: number; lon: number; time: number; value: number }
export interface DriveRecord {
  id: string;
  start: number; // tijdstip vertrek
  end: number; // tijdstip laatste beweging
  distance: number; // meter
  driveTime: number; // seconden rijdend
  maxSpeed: number; // km/h
  points: [number, number][]; // route [breedte, lengte]
  events: DriveEvent[];
}
export const emptyTrip = (): TripStats => ({ distance: 0, driveTime: 0, maxSpeed: 0, startedAt: Date.now() });

// App-koppelingen (Settings > Apps): per PandaOS-app aan/uit en welke app hij opent.
// target 'pandaos' = de ingebouwde PandaOS-versie; anders de id van een Android-app (zie appLinks.ts).
// Zonder target geldt de standaardkeuze (getAppLink): bij Android-apps de geïnstalleerde app.
export interface AppLink {
  enabled: boolean;
  target?: string;
  // Alleen CarPlay: de gekoppelde app vanzelf openen zodra een telefoon via Bluetooth verbindt (ook bij opstarten)
  autoOpen?: boolean;
}

// Audio: wordt op de Pi toegepast via PipeWire; tot die tijd alleen opgeslagen
export interface AudioSettingsState {
  sub: number; // -6 ... +6 dB (subwoofer)
  bass: number; // -6 ... +6 dB
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
  immersive: 0 | 1 | 2; // Immersive Sound: Off / Standard / High
  immersiveAuto: boolean;
  balance: number; // -10 (links) ... +10 (rechts)
  fade: number; // -10 (achter) ... +10 (voor)
  speedVolume: 'Off' | 'Low' | 'Medium' | 'High'; // volume omhoog bij hogere snelheid
}

export interface LightsSettings {
  headlights: 'Off' | 'Parking' | 'On' | 'Auto';
  autoTurnSignals: 'Off' | 'Auto Cancel';
  adaptiveHeadlights: boolean;
  headlightsAfterExit: boolean;
  accentLights: 'Off' | 'On' | 'Night Only';
  domeLights: 'Off' | 'On' | 'Auto';
}

// Uiterlijk van de 3D-auto. Voorruit en voorportierramen zijn altijd licht (wettelijk), alleen de achterste ramen krijgen tint.
export type WindowTint = 'None' | 'Light' | 'Medium' | 'Dark' | 'Limo';
// Uitlaat op het 3D-model: 1 of 2 links/rechts, aan beide kanten, of 2 in het midden
export type ExhaustLayout = 'left1' | 'left2' | 'right1' | 'right2' | 'both1' | 'both2' | 'center2' | 'none';
export interface VehicleSettings {
  model: string; // id uit VEHICLE_MODELS (configuration/vehicleModels.ts)
  // Bepaalt P R N D of P R D in de versnellingsweergave. 'Detect' = wat de auto zelf doorgeeft (CAN/OBD2, carState)
  transmission: 'Automatic' | 'Manual' | 'Detect';
  paintColor: string;
  rimColor: string;
  windowTint: WindowTint;
  exhaust?: ExhaustLayout; // oudere opslag zonder dit veld: 'left1'
  mirrors?: 'body' | 'black' | 'carbon'; // spiegelkappen; standaard wagenkleur
  grille?: 'standard' | 'black' | 'chrome' | 'body' | 'carbon'; // grill naast het logo
  headlightType?: 'halogen' | 'xenon'; // standaard halogeen
  // CAN-bus (Settings > Vehicle): twee verbindingen. canbox = kastje <-> radio (merk/type van het CAN-kastje),
  // canProtocol = auto <-> kastje (voertuigprotocol). Bepaalt hoe PandaOS de gegevens van de radio leest.
  canbox?: CanBox;
  canProtocol?: CanProtocol;
  // 3D-weergave van de auto: 'High' = schaduwen en scherp beeld, 'Low' = zonder schaduwen en minder pixels (sneller)
  graphics?: 'High' | 'Low';
  // Achteruitcamera in R: die van de radio (eigen camera-app van de radio, PandaOS toont alleen R) of die van PandaOS.
  // Niet ingesteld: op de radio 'radio' (de camera-app van de radio houdt de camera bezet), anders 'pandaos'.
  reverseCamera?: 'radio' | 'pandaos';
  // Colouriser (Settings > Vehicle > Paint): lakafwerking en zelf gemaakte kleuren. Metallic = het model zoals het is.
  paintFinish?: 'Solid' | 'Metallic' | 'Matte';
  customPaints?: string[];
  customRims?: string[]; // eigen velgkleuren uit de Kleurenkiezer
  colorNames?: Record<string, string>; // namen van eigen kleuren (hex in kleine letters -> naam)
  rainbowFloor?: boolean; // Toybox: regenboog onder de 3D-auto
  studioScene?: boolean; // 3D-auto in een studio (vloer met lichtvlek, muur); undefined = aan
  neon?: NeonSettings; // Toybox: neon onder de 3D-auto
  minigun?: boolean; // Toybox: minigun op het dak van de 3D-auto
  // Kenteken op de 3D-auto (Instellingen > Voertuig). Alleen lokaal op de radio bewaard: nooit in de repo,
  // documentatie, logboek of probleemrapport zetten.
  licensePlate?: string;
  licensePlateHidden?: boolean; // kenteken (tijdelijk) niet tonen
  // Naam van de auto (Settings > Software, "Name Your Vehicle"); leeg = de modelnaam
  vehicleName?: string;
}

export type CanBox = 'radio' | 'raise' | 'hiworld' | 'simplesoft' | 'oudi' | 'binarytek' | 'luzheng' | 'other';
export type CanProtocol = 'vw-pq35' | 'vw-pq46' | 'vw-mqb' | 'other';

// Standaard = de auto van David (vehicleProfile.ts): Golf 6 Trendline 1.4 TSI, handgeschakeld, PQ35
const DEFAULT_VEHICLE_SETTINGS: VehicleSettings = {
  model: 'golf6', transmission: 'Manual', paintColor: '#9ea3a8', rimColor: '#1a1a1a', windowTint: 'None',
  exhaust: 'left1', mirrors: 'body', grille: 'standard', headlightType: 'halogen',
  ...MY_VEHICLE_SETTINGS,
};

// Wat de auto nu doet: lichtschakelaar, knipperlichten, deuren. Komt straks van het CAN-kastje (via de launcher,
// window.PandaOS.setCarState) of OBD2; tot die tijd via de debug-console. Remlicht = brakeApplied, achteruit = gear 'R'.
export type DoorId = 'fl' | 'fr' | 'rl' | 'rr' | 'trunk';
// Toybox > Neon: gekleurde gloed onder de 3D-auto, per kant aan/uit
export interface NeonSettings {
  on: boolean;
  color: string;
  effect: 'steady' | 'pulse' | 'rainbow';
  sides: { left: boolean; right: boolean; front: boolean; rear: boolean };
}
export const DEFAULT_NEON: NeonSettings = { on: false, color: '#00e5ff', effect: 'steady', sides: { left: true, right: true, front: true, rear: true } };

// Toybox > Voertuig: deuren en lampen van het 3D-model voor de grap. Alleen het plaatje; de echte autostatus
// (carState, CAN, radio) blijft ongemoeid. null = speeltje uit, het model volgt de auto weer.
export interface ToyCar {
  lights: CarState['lights'];
  highBeam: boolean;
  blinker: CarState['blinker'];
  brake: boolean;
  reverse: boolean;
  doors: Record<DoorId, boolean>;
}

// Audio-app (app-menu/dock): de Audio-instellingen openen op Bronnen
export const openAudioApp = () => {
  if (!useUIStore.getState().isAudioSettingsOpen) useUIStore.getState().toggleAudioSettings();
  window.setTimeout(() => window.dispatchEvent(new CustomEvent('pandaos-audio-tab', { detail: 'Sources' })), 0);
};

export interface CarState {
  lights: 'off' | 'parking' | 'low'; // lichtschakelaar: 0, stadslicht, dimlicht
  highBeam: boolean;
  fogFront: boolean; // mistlampen staan niet in het 3D-model, wel in de status
  fogRear: boolean;
  blinker: 'off' | 'left' | 'right' | 'hazard';
  doors: Record<DoorId, boolean>; // true = open
  detectedTransmission: 'Automatic' | 'Manual' | null; // door de auto doorgegeven; null = (nog) onbekend
  // Meetwaarden van de auto (CAN-kastje/OBD2); null = onbekend, dan toont PandaOS niets (geen verzonnen waarde)
  fuelPercent: number | null; // tankniveau 0-100
  rangeKm: number | null; // actieradius
  outsideTemp: number | null; // buitentemperatuur in °C
  // Klimaatregeling die PandaOS via de CAN-bus kan instellen (links/rechts, °C). null = niet mogelijk (bijv. handmatige
  // airco): dan verbergt PandaOS de temperatuurknoppen in de dock.
  climateLeft: number | null;
  climateRight: number | null;
  seatbeltUnfastened: boolean | null; // gordelwaarschuwing; null = onbekend (geen lampje)
}
// Teksten voor meldingen en de deur-open-aanduiding (vertaald via t() in de componenten)
export const DOOR_LABELS: Record<DoorId, string> = {
  fl: 'Front left door open', fr: 'Front right door open', rl: 'Rear left door open', rr: 'Rear right door open', trunk: 'Tailgate open',
};
export const DEFAULT_CAR_STATE: CarState = {
  lights: 'off', highBeam: false, fogFront: false, fogRear: false, blinker: 'off',
  doors: { fl: false, fr: false, rl: false, rr: false, trunk: false }, detectedTransmission: null,
  fuelPercent: null, rangeKm: null, outsideTemp: null, climateLeft: null, climateRight: null, seatbeltUnfastened: null,
};

const loadVehicleSettings = (): VehicleSettings => {
  try {
    return { ...DEFAULT_VEHICLE_SETTINGS, ...JSON.parse(localStorage.getItem('vehicleSettings') || '{}') };
  } catch {
    return DEFAULT_VEHICLE_SETTINGS;
  }
};

// Navigatie (Settings > Navigation). De vermijd-opties gaan als 'exclude' mee naar OSRM (zie Map.tsx).
// Opgeslagen plek (Thuis/Werk): naam van PDOK en coördinaten
export interface SavedPlace { name: string; lat: number; lon: number }

export interface NavigationSettings {
  home?: SavedPlace | null; // Thuis (Instellingen > Navigatie of in de kaart)
  recordDrives?: boolean; // ritten opnemen (Instellingen > Ritten); standaard aan
  work?: SavedPlace | null; // Werk
  fuelType?: 'euro95' | 'e10' | 'super98' | 'diesel' | 'lpg' | 'electric'; // brandstof van de auto (tankstations op de kaart)
  places?: string[]; // plekken op de kaart: fuel, charging, food, parking, groceries, toilets
  mapProvider?: 'pandaos' | 'mapbox'; // kaart: PandaOS (PDOK/OSM, standaard) of Mapbox
  mapboxToken?: string; // eigen Mapbox-token (pk.…), alleen lokaal op de radio
  mapSatellite?: boolean; // knoppen rechts op de kaart: satellietbeeld
  mapTraffic?: boolean; // verkeer (alleen Mapbox); standaard aan
  placesHidden?: boolean; // plekken tijdelijk verbergen (keuze in Instellingen blijft)
  volume: number;
  avoidMotorways: boolean;
  avoidTolls: boolean;
  avoidFerries: boolean;
}

interface UIState {
  isMenuOpen: boolean;
  isQuickActionsOpen: boolean;
  isKeyboardOpen: boolean;
  isCarScreenOpen: boolean; 
  keyboardValue: string; 
  volume: number;
  isVolumeOpen: boolean;
  activeTab: string;

  // Bluetooth States
  btDevices: BTDevice[]; // gevonden bij de laatste scan
  btKnownDevices: KnownBTDevice[]; // eerder verbonden telefoons (bewaard), direct te verbinden zonder scan
  btConnectedAddress: string | null; // welk apparaat nu verbonden is (ook als het niet in de scanlijst staat)
  forgetDevice: (address: string) => void;
  isScanning: boolean;
  btStatusMessage: string;
  btRadioOn: boolean | null; // false = Bluetooth staat uit op het apparaat, null = nog onbekend
  btDiscoverable: { on: boolean; until: number | null; name: string }; // until = tijdstip (ms); null = zonder limiet (Windows)
  isSocketReady: boolean;

  // Music States
  currentTrack: string; // leeg = er speelt niets
  currentArtist: string;
  albumArt: string | null; // data-URL van de server (SMTC)
  mediaPosition: number; // seconden
  mediaDuration: number;
  btAudioState: string | null; // status audio-ontvangst van de telefoon (Success, Opened, Closed, Unavailable, ...)
  // Waar "nu aan het afspelen" vandaan komt: Spotify-account (ook muziek op je telefoon), Windows-mediabediening,
  // of een Android-app op de radio (mediasessie via de launcher, services/androidBridge.ts)
  nowPlayingSource: 'spotify' | 'system' | 'android' | null;
  nowPlayingProjection?: 'carplay' | 'androidauto' | null; // muziek via CarPlay/Android Auto (kaart: Openen)
  isPlaying: boolean;
  mediaSource: 'local' | 'spotify';

  // Spotify Data States
  spotifyItems: SpotifyItem[];
  searchQuery: string;
  isSpotifyAuthorized: boolean; 

  // App & Navigatie States
  isMusicOpen: boolean;
  isAudioSettingsOpen: boolean;
  isVolumePageOpen: boolean; // volumepagina met de vier volumes van de radio (VolumePage.tsx)
  openVolumePage: () => void;
  closeVolumePage: () => void;
  isNavigating: boolean;
  isMapOpen: boolean; // kaart zichtbaar in Park (via Nav-app); tijdens rijden staat de kaart altijd open
  isCarPlayOpen: boolean; // <--- CarPlay State
  isCameraOpen: boolean;

  // --- Telefoon (Bluetooth HFP/PBAP; op de Pi via oFono/obexd, zie server/scripts/phone.js) ---
  isPhoneOpen: boolean;
  phoneTab: PhoneTab;
  call: PhoneCall;
  phoneContacts: PhoneContact[];
  phoneRecents: PhoneRecent[];
  phoneStatus: string | null; // melding van de server, bijv. "Bellen werkt alleen op de Raspberry Pi"
  phoneDialPrefill: string | null; // nummer dat Telefoon bij openen in het toetsenblok zet (services/dialer.ts), daarna weer null
  openPhone: () => void;
  closePhone: () => void;
  setPhoneTab: (tab: PhoneTab) => void;
  dial: (number: string, name?: string) => void;
  answerCall: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  sendDtmf: (digit: string) => void;
  receiveIncomingCall: (name: string, number?: string) => void;

  // Web Apps State
  activeWebApp: 'spotify' | 'youtube' | 'netflix' | null;
  openWebApp: (app: 'spotify' | 'youtube' | 'netflix') => void;
  closeWebApp: () => void;

  // --- Systeem, Voertuig & Notificaties ---
  airbagStatus: boolean;
  notification: { message: string; visible: boolean; type: 'info' | 'alert', label?: string };
  screenMode: 'light' | 'dark' | 'auto';
  vehicleLightsOn: boolean | null; // koplampen volgens OBD2; null = nog geen OBD2-data
  carState: CarState;
  // Deel van de autostatus bijwerken. Een deur die opengaat geeft een melding (zoals in het dashboard);
  // stadslicht/dimlicht aan = vehicleLightsOn (nachtstand voor thema en helderheid).
  setCarState: (partial: Partial<Omit<CarState, 'doors'>> & { doors?: Partial<Record<DoorId, boolean>> }) => void;
  gear: GearType;
  brakeApplied: boolean;
  speed: number;
  toyCar: ToyCar | null; // Toybox > Voertuig (niet bewaard)
  setToyCar: (toy: ToyCar | null) => void;

  // --- Nieuwe Instellingen ---
  displaySettings: DisplaySettings;
  lightsSettings: LightsSettings;
  navigationSettings: NavigationSettings;
  vehicleSettings: VehicleSettings;
  safetySettings: SafetySettings;
  updateSafetySetting: <K extends keyof SafetySettings>(key: K, val: SafetySettings[K]) => void;
  appSettings: AppSettings;
  updateAppSetting: <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => void;
  appLinks: Record<string, AppLink>;
  updateAppLink: (appId: string, link: Partial<AppLink>) => void;
  trips: Record<TripKey, TripStats>;
  drives: DriveRecord[]; // opgenomen ritten, nieuwste eerst (max 200)
  addDrive: (drive: DriveRecord) => void;
  removeDrive: (id: string) => void;
  clearDrives: () => void;
  addTripSample: (distance: number, seconds: number, speedKmh: number) => void;
  resetTrip: (key: TripKey) => void;
  audioSettings: AudioSettingsState;
  updateAudioSetting: <K extends keyof AudioSettingsState>(key: K, val: AudioSettingsState[K]) => void;
  updateVehicleSetting: <K extends keyof VehicleSettings>(key: K, val: VehicleSettings[K]) => void;
  updateDisplaySetting: (key: keyof DisplaySettings, val: any) => void;
  updateLightsSetting: (key: keyof LightsSettings, val: any) => void;
  updateNavigationSetting: (key: keyof NavigationSettings, val: any) => void;

  // --- App Launcher & Drag Mode ---
  isAppEditMode: boolean;
  savedFlashAt: number; // na Done in het app-menu: bovenin kort "Opgeslagen"
  driverProfiles: DriverProfile[]; // leeg = één standaardprofiel zonder naam
  activeProfileId: string;
  switchProfile: (id: string) => void;
  addProfile: (name: string) => void;
  renameProfile: (id: string, name: string) => void;
  deleteProfile: (id: string) => void;
  pinnedApps: string[];
  recentApps: string[];
  setAppEditMode: (mode: boolean) => void;
  pinApp: (appId: string) => void;
  unpinApp: (appId: string) => void;
  addRecentApp: (appId: string) => void;
  placePinnedApp: (appId: string, index: number) => void;

  // Actions
  toggleCarScreen: () => void;
  toggleMenu: () => void;
  closeMenu: () => void;
  toggleQuickActions: () => void;
  closeQuickActions: () => void;
  openKeyboard: (initialValue?: string) => void;
  closeKeyboard: () => void;
  setKeyboardValue: (val: string) => void;
  setVolume: (val: number) => void;
  toggleVolume: () => void;
  stepVolume: (delta: number) => void;
  setActiveTab: (tab: string) => void;
  openSettingsTab: (tab: string) => void; 

  toggleMusic: () => void;
  toggleAudioSettings: () => void;
  setNavigating: (status: boolean) => void;
  setMediaSource: (source: 'local' | 'spotify') => void;
  
  // CarPlay & Camera Actions
  toggleCarPlay: () => void; 
  openCarPlay: () => void;
  closeCarPlay: () => void;
  openCamera: () => void;
  isCanMonitorOpen: boolean;
  openCanMonitor: () => void;
  closeCanMonitor: () => void;
  // Theater (half scherm): videoapps zoals Netflix, YouTube en Twitch
  isTheaterOpen: boolean;
  panelApp: 'contacts' | 'calendar' | 'messages' | 'bluetooth' | 'radio' | 'obd' | null; // PhoneDataApps.tsx: half naast de auto
  openPanelApp: (app: 'contacts' | 'calendar' | 'messages' | 'bluetooth' | 'radio' | 'obd') => void;
  closePanelApp: () => void;
  openTheater: () => void;
  closeTheater: () => void;
  // Arcade (half scherm): de games op de radio
  isArcadeOpen: boolean;
  openArcade: () => void;
  closeArcade: () => void;
  // Toybox (half scherm): speeltjes
  isToyboxOpen: boolean;
  openToybox: () => void;
  closeToybox: () => void;
  // Diagnose (half scherm): logboek en Probleem melden
  isDiagnosticsOpen: boolean;
  openDiagnostics: () => void;
  closeDiagnostics: () => void;
  closeCamera: () => void;
  openMap: () => void;

  // Media Commands
  startScan: () => void;
  turnOnBluetooth: () => void;
  makeDiscoverable: () => void;
  connectToDevice: (address: string) => void;
  disconnectDevice: (address: string) => void;
  setBtStatusMessage: (msg: string) => void; 
  sendMediaCommand: (cmd: string) => void;
  
  togglePlayPause: () => void;
  playNext: () => void;
  playPrev: () => void;

  // Spotify Commands
  setSearchQuery: (query: string) => void;
  loadSpotifyPlaylists: () => Promise<void>;
  performSearch: (query: string, type?: string) => Promise<void>;
  initSpotify: () => Promise<void>; 
  loginSpotify: () => void;
  startSpotifyNowPlaying: () => void;

  // Systeem Actions
  showNotification: (msg: string, type?: 'info' | 'alert', label?: string) => void;
  setScreenMode: (mode: 'light' | 'dark' | 'auto') => void;
  setVehicleLights: (on: boolean | null) => void;
  setGear: (gear: GearType) => void;
  reverseActive: boolean;
  setReverseSignal: (active: boolean) => void;
  gearOverride: GearType | null;
  setGearOverride: (gear: GearType | null) => void;
  setGpsSpeed: (speed: number) => void;
  speedLimit: number | null; // km/h, van de weg waar je rijdt (services/speedLimit.ts)
  cameraAhead: { distance: number; maxspeed: number | null; kind: 'fixed' | 'section'; chime: boolean } | null; // flitspaal vóór de auto (services/speedCameras.ts)
  setSpeedLimit: (limit: number | null) => void;
  setBrake: (status: boolean) => void;
  setSpeed: (speed: number) => void;
  
  initSocketListeners: () => void;
  closeAll: () => void;
}

const usesSpotify = (state: { nowPlayingSource: string | null; mediaSource: string }) =>
  state.nowPlayingSource === 'spotify' || state.mediaSource === 'spotify';

// Spotify-bediening; zonder Premium geeft Spotify 403 terug
const runSpotifyCommand = (command: () => Promise<any>, notify: (msg: string, type?: 'info' | 'alert', label?: string) => void) => {
  command().catch((err: any) => {
    notify(err?.status === 403 ? 'PREMIUM NEEDED' : 'CONTROL FAILED', 'alert', 'SPOTIFY');
  });
};

// Speelt er iets in een Android-app op de radio? Dan gaat de bediening naar die app (via de launcher)
const androidMedia = (state: { nowPlayingSource: string | null }) => {
  const bridge = (window as any).PandaAndroid;
  return state.nowPlayingSource === 'android' && bridge?.mediaCommand ? bridge : null;
};

const SERVER_URL = 'ws://localhost:8080'; // zelfde poort als server/index.js
let socketRetryDelay = 1000;

const SPOTIFY_POLL_MS = 1000;
let spotifyPollTimer: ReturnType<typeof setInterval> | null = null;

const sendToSocket = (event: string, data?: any) => {
  const socket = (window as any).socket;
  if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event, data }));
  }
};

// Instellingen die bewaard blijven na herladen/herstarten (localStorage, sleutel 'pandaos-settings').
// Tijdelijke dingen (open menu's, Bluetooth-scan, wat er nu speelt) worden bewust niet bewaard.
const PERSISTED_KEYS = [
  'screenMode', 'displaySettings', 'lightsSettings', 'navigationSettings', 'vehicleSettings',
  'pinnedApps', 'recentApps', 'mediaSource', 'btKnownDevices', 'audioSettings', 'volume', 'safetySettings', 'appSettings', 'appLinks', 'trips', 'drives',
  'driverProfiles', 'activeProfileId'
] as const;

// Bestuurdersprofielen (zoals Tesla): elk profiel bewaart zijn eigen scherm-, navigatie-, audio-, veiligheids- en
// app-instellingen en zijn dock. De auto zelf (Voertuig: lak, kenteken ...) is van iedereen en hoort er niet bij.
export const PROFILE_KEYS = ['screenMode', 'displaySettings', 'navigationSettings', 'audioSettings', 'safetySettings',
  'appSettings', 'appLinks', 'pinnedApps'] as const;
export interface DriverProfile { id: string; name: string; settings?: Record<string, unknown> }

// Zonder opgeslagen profielen bestaat er één standaardprofiel ("Bestuurder")
const ensureDefaultProfile = (profiles: DriverProfile[], activeId: string): DriverProfile[] =>
  profiles.length ? profiles : [{ id: activeId || 'default', name: 'Bestuurder' }];

// Volume van PandaOS loopt van 0 tot 40, net als het meestervolume van de radio (één klik = één stap)
export const VOLUME_MAX = 40;
const toPercent = (v: number) => Math.round((v * 100) / VOLUME_MAX);
export const fromPercent = (p: number) => Math.round((p * VOLUME_MAX) / 100);

export const useUIStore = create<UIState>()(persist((set, get) => ({
  isMenuOpen: false,
  isQuickActionsOpen: false,
  isKeyboardOpen: false,
  isCarScreenOpen: false, 
  keyboardValue: '',
  volume: 20,
  isVolumeOpen: false,
  activeTab: 'Display',
  
  btDevices: [],
  btKnownDevices: [],
  btConnectedAddress: null,
  forgetDevice: (address) => {
    if (localStorage.getItem('lastConnectedBT') === address) localStorage.removeItem('lastConnectedBT');
    if (get().btConnectedAddress === address) sendToSocket('DISCONNECT_BT_DEVICE', { address });
    set((state) => ({ btKnownDevices: state.btKnownDevices.filter((d) => d.address !== address) }));
  },
  isScanning: false,
  btStatusMessage: 'Wachten op systeemverbinding...',
  btRadioOn: null,
  btDiscoverable: { on: false, until: null, name: '' },
  isSocketReady: false,

  currentTrack: '',
  currentArtist: '',
  albumArt: null,
  mediaPosition: 0,
  mediaDuration: 0,
  btAudioState: null,
  nowPlayingSource: null,

  phoneTab: 'Recents',
  call: IDLE_CALL,
  phoneContacts: [],
  phoneRecents: [],
  phoneStatus: null,
  phoneDialPrefill: null,
  isPlaying: false,
  mediaSource: 'local',

  spotifyItems: [],
  searchQuery: '',
  isSpotifyAuthorized: false,

  isMusicOpen: false,
  isAudioSettingsOpen: false,
  isVolumePageOpen: false,
  openVolumePage: () => set({ isVolumePageOpen: true, isVolumeOpen: false, isAudioSettingsOpen: false }),
  closeVolumePage: () => set({ isVolumePageOpen: false }),
  isNavigating: false,
  isMapOpen: false,
  isCarPlayOpen: false,
  isCameraOpen: false,
  isPhoneOpen: false,
  activeWebApp: null,

  airbagStatus: true,
  notification: { message: '', visible: false, type: 'info', label: 'SYSTEM' },
  screenMode: (localStorage.getItem('screenMode') as 'light' | 'dark' | 'auto') || 'auto',
  vehicleLightsOn: null,
  gear: 'P',
  brakeApplied: false, // zonder handrem-signaal (CAN) niet aangetrokken: geen remlicht in het 3D-model
  speed: 0,
  toyCar: null,
  setToyCar: (toyCar) => set({ toyCar }),

  // --- Initialiseer Settings ---
  displaySettings: {
    textSize: 'Standard',
    timeFormat: '24h',
    energyDisplay: 'Percentage',
    distance: 'Kilometers',
    temperature: 'C',
    brightness: 80,
    autoBrightness: true,
    dayBrightness: 100,
    nightBrightness: 60,
    nightFilter: false,
    language: 'nl',
  },
  audioSettings: { sub: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, treble: 0, immersive: 1, immersiveAuto: false, balance: 0, fade: 0, speedVolume: 'Low' },
  safetySettings: { speedWarning: true, offset: 5, chime: false, showSpeedLimit: true },
  updateSafetySetting: (key, val) => set((state) => ({ safetySettings: { ...state.safetySettings, [key]: val } })),
  appSettings: { defaultNav: 'nav', defaultMusic: 'music', startup: 'home', panel: 'pandaos' },
  updateAppSetting: (key, val) => set((state) => ({ appSettings: { ...state.appSettings, [key]: val } })),
  // Leeg = alles aan en de PandaOS-versie (zie getAppLink in appLinks.ts)
  appLinks: {},
  trips: { current: emptyTrip(), tripA: emptyTrip(), tripB: emptyTrip() },
  drives: [],
  addDrive: (drive) => set((state) => ({ drives: [drive, ...state.drives.filter((d) => d.id !== drive.id)].slice(0, 200) })),
  removeDrive: (id) => set((state) => ({ drives: state.drives.filter((d) => d.id !== id) })),
  clearDrives: () => set({ drives: [] }),
  // Eén GPS-meting telt mee in alle drie de tellers
  addTripSample: (distance, seconds, speedKmh) => set((state) => ({
    trips: Object.fromEntries(Object.entries(state.trips).map(([key, trip]) => [key, {
      ...trip,
      distance: trip.distance + distance,
      driveTime: trip.driveTime + seconds,
      maxSpeed: Math.max(trip.maxSpeed, speedKmh),
    }])) as Record<TripKey, TripStats>,
  })),
  resetTrip: (key) => set((state) => ({ trips: { ...state.trips, [key]: emptyTrip() } })),
  updateAppLink: (appId, link) => set((state) => ({
    appLinks: { ...state.appLinks, [appId]: { ...(state.appLinks[appId] ?? { enabled: true }), ...link } }
  })),
  updateAudioSetting: (key, val) => set((state) => ({ audioSettings: { ...state.audioSettings, [key]: val } })),
  lightsSettings: {
    headlights: 'Auto',
    autoTurnSignals: 'Auto Cancel',
    adaptiveHeadlights: true,
    headlightsAfterExit: false,
    accentLights: 'On',
    domeLights: 'Auto'
  },
  navigationSettings: {
    volume: 50,
    avoidMotorways: false,
    avoidTolls: false,
    avoidFerries: false,
  },

  vehicleSettings: loadVehicleSettings(),
  updateVehicleSetting: (key, val) => set((state) => ({ vehicleSettings: { ...state.vehicleSettings, [key]: val } })),

  updateDisplaySetting: (key, val) => set((state) => ({ displaySettings: { ...state.displaySettings, [key]: val } })),
  updateLightsSetting: (key, val) => set((state) => ({ lightsSettings: { ...state.lightsSettings, [key]: val } })),
  updateNavigationSetting: (key, val) => set((state) => ({ navigationSettings: { ...state.navigationSettings, [key]: val } })),

  // --- App Launcher & Drag Mode ---
  isAppEditMode: false,
  savedFlashAt: 0,
  driverProfiles: [],
  activeProfileId: 'default',
  // Wisselen: huidige instellingen in het oude profiel bewaren, die van het nieuwe profiel terugzetten
  switchProfile: (id) => {
    const state = get();
    if (id === state.activeProfileId) return;
    const snapshot = Object.fromEntries(PROFILE_KEYS.map((k) => [k, (state as any)[k]]));
    const profiles = ensureDefaultProfile(state.driverProfiles, state.activeProfileId)
      .map((pr) => pr.id === state.activeProfileId ? { ...pr, settings: snapshot } : pr);
    const target = profiles.find((pr) => pr.id === id);
    if (!target) return;
    set({ driverProfiles: profiles, activeProfileId: id, ...(target.settings ?? {}) } as Partial<UIState>);
  },
  // Nieuw profiel begint met de instellingen van nu (zoals Tesla: daarna zelf aanpassen)
  addProfile: (name) => {
    const state = get();
    const id = `p${Date.now().toString(36)}`;
    const profiles = ensureDefaultProfile(state.driverProfiles, state.activeProfileId);
    set({ driverProfiles: [...profiles, { id, name: name.trim() || 'Bestuurder' }] });
    get().switchProfile(id);
  },
  renameProfile: (id, name) => set((state) => ({
    driverProfiles: ensureDefaultProfile(state.driverProfiles, state.activeProfileId)
      .map((pr) => pr.id === id ? { ...pr, name: name.trim() || pr.name } : pr),
  })),
  deleteProfile: (id) => {
    const state = get();
    const profiles = ensureDefaultProfile(state.driverProfiles, state.activeProfileId);
    if (profiles.length <= 1) return; // altijd minstens één profiel
    const rest = profiles.filter((pr) => pr.id !== id);
    if (id === state.activeProfileId) {
      const next = rest[0];
      set({ driverProfiles: rest, activeProfileId: next.id, ...(next.settings ?? {}) } as Partial<UIState>);
    } else set({ driverProfiles: rest });
  },
  pinnedApps: ['spotify', 'camera', 'dashcam', 'energy', 'phone'],
  recentApps: ['youtube', 'netflix'],
  
  setAppEditMode: (mode) => set({ isAppEditMode: mode }),
  
  // Vastzetten (tik in de bewerkmodus); een vastgezette app staat niet ook bij de recente apps
  pinApp: (appId) => set((state) => {
    if (state.pinnedApps.includes(appId)) return state; // Al gepind
    const recentApps = state.recentApps.filter((id) => id !== appId);
    if (state.pinnedApps.length >= 5) {
        // Vervang de laatste als de balk vol is
        const newPinned = [...state.pinnedApps];
        newPinned[4] = appId;
        return { pinnedApps: newPinned, recentApps };
    }
    return { pinnedApps: [...state.pinnedApps, appId], recentApps };
  }),
  
  unpinApp: (appId) => set((state) => ({
    pinnedApps: state.pinnedApps.filter(id => id !== appId)
  })),

  // Slepen naar de favorieten (links van de lijn in de dock): op die plek invoegen of verplaatsen, max. 5.
  // Ook Android-apps ('pkg:<pakket>'). Een vastgezette app verdwijnt uit de recente apps.
  placePinnedApp: (appId, index) => set((state) => {
    const pinned = state.pinnedApps.filter((id) => id !== appId);
    pinned.splice(Math.max(0, Math.min(index, pinned.length)), 0, appId);
    return { pinnedApps: pinned.slice(0, 5), recentApps: state.recentApps.filter((id) => id !== appId) };
  }),

  addRecentApp: (appId) => set((state) => {
    if (state.pinnedApps.includes(appId)) return state;
    
    let newRecents = state.recentApps.filter(id => id !== appId);
    newRecents.unshift(appId);
    
    // Tot 4 onthouden; de dock toont er zoveel als ingesteld (Instellingen > Scherm > Recente apps, standaard 2)
    if (newRecents.length > 4) newRecents = newRecents.slice(0, 4);
    
    return { recentApps: newRecents };
  }),

  // --- Actions ---
  toggleCarScreen: () => {
    const currentState = get();
    if (currentState.isMenuOpen) {
       set({ isMenuOpen: false, isCarScreenOpen: false });
    } else {
       get().addRecentApp('settings');
       set({ 
         isMenuOpen: true, 
         isCarScreenOpen: true, 
         activeTab: 'Display',
         isMusicOpen: false,
         activeWebApp: null,
         isCameraOpen: false,
         isPhoneOpen: false,
         isCarPlayOpen: false,
         isQuickActionsOpen: false
       });
    }
  },

  toggleMenu: () => {
    get().addRecentApp('settings');
    set((state) => ({ 
      isMenuOpen: !state.isMenuOpen,
      isCarScreenOpen: false, 
      isQuickActionsOpen: false,
      isKeyboardOpen: false,
      isVolumeOpen: false,
      isAudioSettingsOpen: false,
      isMusicOpen: false,
      isCarPlayOpen: false,
      isCameraOpen: false,
      isPhoneOpen: false,
      activeWebApp: null,
      activeTab: 'Display'
    }));
  },
  
  closeMenu: () => set({ isMenuOpen: false }),

  toggleQuickActions: () => set((state) => ({ 
    isQuickActionsOpen: !state.isQuickActionsOpen,
    isAppEditMode: false, 
    isMenuOpen: false,
    isKeyboardOpen: false,
    isVolumeOpen: false,
    isAudioSettingsOpen: false,
    isMusicOpen: false
  })),
  
  closeQuickActions: () => set({ isQuickActionsOpen: false, isAppEditMode: false }),

  openKeyboard: (initialValue = '') => set({ 
    isKeyboardOpen: true, 
    keyboardValue: initialValue,
    isQuickActionsOpen: false,
    isVolumeOpen: false
  }),
  
  closeKeyboard: () => set({ isKeyboardOpen: false }),
  setKeyboardValue: (val) => set({ keyboardValue: val }),
  // Op de radio ook het Android-mediavolume zetten (CarSignals.kt); terugkoppeling via window.PandaOS.systemVolume
  setVolume: (val) => {
    const volume = Math.round(Math.max(0, Math.min(VOLUME_MAX, val)));
    const android = (window as any).PandaAndroid;
    const before = get().volume;
    set({ volume });
    // Meestervolume van de radio bekend: dat zetten; anders het Android-mediavolume (in procenten)
    if (android?.getMasterVolume?.() >= 0) android.setMasterVolume(volume);
    // Jancar-radio, meestervolume nog onbekend: relatief stappen (het echte volume komt daarna uit het logboek)
    else if (android?.usesRadioMasterVolume?.()) android.stepMasterVolume(volume - before);
    else android?.setSystemVolume?.(toPercent(volume));
  },
  toggleVolume: () => set((state) => ({ isVolumeOpen: !state.isVolumeOpen })),
  // Volume omhoog/omlaag (pijltjes en straks VOL+/VOL-): stap van 1 en de popup even tonen.
  // De popup sluit zelf 3 seconden na de laatste wijziging (VolumePopup).
  stepVolume: (delta) => {
    // Op de radio: één echte volumestap van Android (de radio heeft minder dan 100 stappen) en het echte percentage tonen
    const android = (window as any).PandaAndroid;
    // Meestervolume bekend: stap via de radio; het echte nieuwe volume komt terug via window.PandaOS.radioVolume
    if (android?.getMasterVolume?.() >= 0 || android?.usesRadioMasterVolume?.()) {
      android.stepMasterVolume(delta);
      set({ volume: Math.max(0, Math.min(VOLUME_MAX, get().volume + delta)), isVolumeOpen: true });
      return;
    }
    if (android?.stepSystemVolume) {
      const percent = android.stepSystemVolume(delta);
      if (percent >= 0) { set({ volume: fromPercent(percent), isVolumeOpen: true }); return; }
    }
    set({ volume: Math.max(0, Math.min(VOLUME_MAX, get().volume + delta)), isVolumeOpen: true });
  },
  
  setActiveTab: (tab) => set({ activeTab: tab }),

  openSettingsTab: (tab) => {
    get().addRecentApp('settings');
    set({
      isMenuOpen: true,
      activeTab: tab,
      isQuickActionsOpen: false,
      isKeyboardOpen: false,
      isVolumeOpen: false,
      isAudioSettingsOpen: false,
      isMusicOpen: false,
      isCarPlayOpen: false,
      isCameraOpen: false,
      isPhoneOpen: false,
      activeWebApp: null
    });
  },

  toggleMusic: () => {
      get().addRecentApp('music');
      set((state) => ({ 
          isMusicOpen: !state.isMusicOpen, 
          isQuickActionsOpen: false,
          isMenuOpen: false,
          isCarPlayOpen: false,
          isCameraOpen: false,
          isPhoneOpen: false,
          activeWebApp: null
      }));
  },

  // --- CARPLAY ACTIONS ---
  toggleCarPlay: () => {
    get().addRecentApp('phone');
    set((state) => ({
      isCarPlayOpen: !state.isCarPlayOpen,
      isMusicOpen: false,
      isMenuOpen: false,
      isQuickActionsOpen: false,
      isCameraOpen: false,
      isPhoneOpen: false,
      activeWebApp: null
    }));
  },
  openCarPlay: () => {
    get().addRecentApp('phone');
    set({
      isCarPlayOpen: true,
      isMusicOpen: false,
      isMenuOpen: false,
      isQuickActionsOpen: false,
      isCameraOpen: false,
      isPhoneOpen: false,
      activeWebApp: null
    });
  },
  closeCarPlay: () => set({ isCarPlayOpen: false }),

  // --- MAP & CAMERA ACTIONS ---
  openMap: () => {
    get().addRecentApp('maps');
    set({
      isMapOpen: true,
      isMenuOpen: false,
      isMusicOpen: false,
      activeWebApp: null,
      isCameraOpen: false,
      isPhoneOpen: false,
      isCarPlayOpen: false,
      isQuickActionsOpen: false
    });
  },

  openCamera: () => {
    get().addRecentApp('camera');
    set({
      isCameraOpen: true,
      isMenuOpen: false,
      isMusicOpen: false,
      activeWebApp: null,
      isCarPlayOpen: false,
      isQuickActionsOpen: false
    });
  },
  closeCamera: () => set({ isCameraOpen: false }),

  // --- TELEFOON ---
  // De server voert het echt uit (Pi: oFono). De app werkt de status meteen bij zodat het scherm direct reageert;
  // PHONE_CALL_STATE van de server corrigeert dat daarna.
  openPhone: () => {
    get().addRecentApp('phone');
    set({
      isPhoneOpen: true, isMusicOpen: false, isMenuOpen: false, isMapOpen: false, activeWebApp: null,
      isCarPlayOpen: false, isCameraOpen: false, isQuickActionsOpen: false
    });
    sendToSocket('PHONE_SYNC'); // contacten en recente oproepen ophalen
  },
  closePhone: () => set({ isPhoneOpen: false }),
  setPhoneTab: (tab) => set({ phoneTab: tab }),

  dial: (number, name) => {
    if (!number) return;
    // Op de radio: de Bluetooth-app van de radio belt en toont zelf het gesprek (PhoneData.dial in de launcher).
    // Android's eigen bellen doet op de radio niets (geen simkaart); de launcher kiest de app en zegt wat er gebeurde.
    const android = (window as any).PandaAndroid;
    if (android?.dialNumberResult || android?.dialNumber) {
      let result: { ok: boolean; via?: string; error?: string };
      try {
        result = android.dialNumberResult
          ? JSON.parse(android.dialNumberResult(number, getLinkedAndroidPackage(get().appLinks, 'phone') ?? ''))
          : { ok: !!android.dialNumber(number), via: 'call' };
      } catch { result = { ok: false, error: 'bridge' }; }
      if (!result.ok) {
        get().showNotification('Calling failed. No app on the radio can make calls.', 'alert', 'PHONE');
      } else if (result.via === 'bt-app') {
        get().showNotification('The phone app of the radio is open. Dial the number there.', 'info', 'PHONE');
      } else if (result.via === 'bt-dialer') {
        get().showNotification('The phone app of the radio is open. Check the number and press call.', 'info', 'PHONE');
      } else if (result.via === 'call' || result.via === 'bt-call') {
        // Meteen in Recent; de Gesprekslijst van de telefoon komt bij de volgende keer inlezen
        set((state) => ({ phoneRecents: [{ name: name || number, number, type: 'outgoing' as const, time: Date.now() }, ...state.phoneRecents].slice(0, 50) }));
      }
      return;
    }
    set({ call: { ...IDLE_CALL, state: 'dialing', number, name: name || number, outgoing: true } });
    sendToSocket('PHONE_DIAL', { number });
  },
  answerCall: () => {
    set((state) => ({ call: { ...state.call, state: 'active', startedAt: Date.now() } }));
    sendToSocket('PHONE_ANSWER');
  },
  hangUp: () => {
    const { call } = get();
    if (call.state !== 'idle') {
      // Lokaal in de recente oproepen zetten (de telefoon heeft zijn eigen lijst, die komt bij de volgende sync)
      const type: PhoneRecent['type'] = call.state === 'incoming' ? 'missed' : call.outgoing ? 'outgoing' : 'incoming';
      set((state) => ({ phoneRecents: [{ name: call.name, number: call.number, type, time: Date.now() }, ...state.phoneRecents].slice(0, 50) }));
    }
    set({ call: IDLE_CALL });
    sendToSocket('PHONE_HANGUP');
  },
  toggleMute: () => {
    const muted = !get().call.muted;
    set((state) => ({ call: { ...state.call, muted } }));
    sendToSocket('PHONE_MUTE', { muted });
  },
  sendDtmf: (digit) => sendToSocket('PHONE_DTMF', { digit }),
  receiveIncomingCall: (name, number = '') => set({ call: { ...IDLE_CALL, state: 'incoming', name: name || number, number } }),
  
  // Op de radio kan Audio gekoppeld zijn aan de ingebouwde audio-/DSP-app van de fabrikant (Settings > Apps)
  toggleAudioSettings: () => {
    const audioApp = !get().isAudioSettingsOpen ? getLinkedAndroidPackage(get().appLinks, 'audio') : undefined;
    if (audioApp && launchAndroidPackage(audioApp)) return;
    set((state) => ({ isAudioSettingsOpen: !state.isAudioSettingsOpen }));
  },
  setNavigating: (status) => set({ isNavigating: status }),
  setMediaSource: (source) => set({ mediaSource: source }),

  openWebApp: (app) => {
    get().addRecentApp(app);
    set({ 
        activeWebApp: app,
        isMusicOpen: false, 
        isMenuOpen: false, 
        isQuickActionsOpen: false,
        isCarPlayOpen: false,
        isCameraOpen: false
    });
  },

  closeWebApp: () => set({ activeWebApp: null }),

  setScreenMode: (mode) => set({ screenMode: mode }),
  // OBD2/debug "headlights": volgt ook de lichtschakelaar van het model (aan = dimlicht)
  setVehicleLights: (on) => set((state) => ({
    vehicleLightsOn: on,
    carState: { ...state.carState, lights: on ? (state.carState.lights === 'off' ? 'low' : state.carState.lights) : 'off' },
  })),
  carState: DEFAULT_CAR_STATE,
  setCarState: (partial) => {
    const before = get().carState;
    const doors = { ...before.doors, ...(partial.doors ?? {}) };
    const next: CarState = { ...before, ...partial, doors };
    const lightsChanged = partial.lights !== undefined && partial.lights !== before.lights;
    set({ carState: next, ...(lightsChanged ? { vehicleLightsOn: next.lights !== 'off' } : {}) });
    // Melding bij een deur die opengaat
    const opened = (Object.keys(doors) as DoorId[]).filter((d) => doors[d] && !before.doors[d]);
    if (opened.length) get().showNotification(opened.length > 1 ? 'DOORS OPEN' : DOOR_LABELS[opened[0]], 'alert', 'DOOR');
  },
  setGear: (gear) => set({ gear, speed: gear === 'P' ? 0 : get().speed }),
  setBrake: (status) => set({ brakeApplied: status }),
  setSpeed: (speed) => set({ speed }),
  // Zonder OBD2: R komt van het achteruit-signaal van de radio, anders D bij snelheid (GPS) en P bij stilstand
  reverseActive: false,
  setReverseSignal: (active) => set((state) => ({
    reverseActive: active,
    gear: active ? 'R' : state.speed > 0 ? 'D' : 'P',
  })),
  speedLimit: null,
  cameraAhead: null,
  setSpeedLimit: (limit) => set({ speedLimit: limit }),
  setGpsSpeed: (speed) => set((state) => ({
    speed,
    gear: state.reverseActive ? 'R' : state.gearOverride ?? (speed > 0 ? 'D' : 'P'),
  })),
  // Versnelling die de auto (CAN/OBD2) of de debug-console doorgeeft; gaat voor de GPS-schatting. null = GPS.
  gearOverride: null,
  setGearOverride: (gear) => set((state) => ({
    gearOverride: gear === 'R' ? null : gear,
    reverseActive: gear === 'R',
    gear: gear ?? (state.reverseActive ? 'R' : state.speed > 0 ? 'D' : 'P'),
  })),

  startScan: () => {
    set({ isScanning: true, btDevices: [], btStatusMessage: 'Bezig met zoeken...' });
    sendToSocket('START_BT_SCAN');
  },

  turnOnBluetooth: () => {
    set({ isScanning: true, btStatusMessage: 'Bluetooth aanzetten...' });
    sendToSocket('BT_RADIO_ON');
  },

  makeDiscoverable: () => {
    set({ btStatusMessage: 'Zichtbaar maken...' });
    sendToSocket('BT_MAKE_DISCOVERABLE');
  },

  connectToDevice: (address) => {
    set({ btStatusMessage: `Verbinden met ${address}...` });
    localStorage.setItem('lastConnectedBT', address);
    sendToSocket('CONNECT_BT_DEVICE', { address });
  },

  disconnectDevice: (address) => {
    set({ btStatusMessage: `Ontkoppelen...` });
    localStorage.removeItem('lastConnectedBT');
    sendToSocket('DISCONNECT_BT_DEVICE', { address });
  },

  setBtStatusMessage: (msg: string) => set({ btStatusMessage: msg }),

  sendMediaCommand: (cmd) => { sendToSocket('BT_SEND_CMD', { command: cmd }); },

  // Bediening gaat naar Spotify als daar iets speelt (ook op je telefoon), anders als mediatoets via de server
  togglePlayPause: () => {
    const { isPlaying, sendMediaCommand } = get();
    const android = androidMedia(get());
    if (android) {
      android.mediaCommand(isPlaying ? 'pause' : 'play');
    } else if (usesSpotify(get())) {
      runSpotifyCommand(isPlaying ? spotifyPause : spotifyPlay, get().showNotification);
    } else {
      sendMediaCommand(isPlaying ? 'CMD:PAUSE' : 'CMD:PLAY');
    }
    set({ isPlaying: !isPlaying });
  },

  playNext: () => {
    const android = androidMedia(get());
    if (android) return android.mediaCommand('next');
    usesSpotify(get()) ? runSpotifyCommand(spotifyNext, get().showNotification) : get().sendMediaCommand('CMD:NEXT');
  },

  playPrev: () => {
    const android = androidMedia(get());
    if (android) return android.mediaCommand('prev');
    usesSpotify(get()) ? runSpotifyCommand(spotifyPrev, get().showNotification) : get().sendMediaCommand('CMD:PREV');
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  loadSpotifyPlaylists: async () => { set({ spotifyItems: await fetchUserPlaylists() }); },
  performSearch: async (query, type = 'track') => {
    if (!query) return get().loadSpotifyPlaylists();
    set({ spotifyItems: await searchSpotify(query, type as any) });
  },

  showNotification: (msg: string, type: 'info' | 'alert' = 'info', label: string = 'SYSTEM') => {
    set({ notification: { message: msg, visible: true, type, label } });
    setTimeout(() => {
      set((state) => ({ notification: { ...state.notification, visible: false } }));
    }, 4000);
  },

  initSpotify: async () => {
    let token = localStorage.getItem('spotify_token');
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      const newToken = await exchangeCodeForToken(code);
      if (newToken) {
        token = newToken;
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
    if (token) {
      setSpotifyToken(token);
      if (isSpotifyTokenExpired()) token = await refreshSpotifyToken();
      if (!token) return; // verlopen en niet te verlengen: opnieuw inloggen
      set({ isSpotifyAuthorized: true });
      get().startSpotifyNowPlaying();
    }
  },

  // Elke seconde opvragen wat er op je Spotify-account speelt (ook muziek op je telefoon via Bluetooth)
  startSpotifyNowPlaying: () => {
    if (spotifyPollTimer) return;
    spotifyPollTimer = setInterval(async () => {
      // Op de radio levert de Android-mediasessie de gegevens al (ook van de Spotify-app); die gaat voor
      if (get().nowPlayingSource === 'android') return;
      try {
        const nowPlaying = await fetchNowPlaying();
        if (nowPlaying) {
          set({
            nowPlayingSource: 'spotify',
            currentTrack: nowPlaying.title, currentArtist: nowPlaying.artist, albumArt: nowPlaying.albumArt,
            isPlaying: nowPlaying.isPlaying, mediaPosition: nowPlaying.position, mediaDuration: nowPlaying.duration
          });
        } else if (get().nowPlayingSource === 'spotify') {
          set({ nowPlayingSource: null, currentTrack: '', currentArtist: '', albumArt: null, isPlaying: false, mediaPosition: 0, mediaDuration: 0 });
        }
      } catch (err: any) {
        if (err?.status === 401) {
          if (!(await refreshSpotifyToken())) {
            clearInterval(spotifyPollTimer!);
            spotifyPollTimer = null;
            set({ isSpotifyAuthorized: false, nowPlayingSource: null });
          }
        } else if (get().nowPlayingSource === 'spotify') {
          // Geen internet (of Spotify onbereikbaar): loslaten, zodat de gegevens via Bluetooth (AVRCP) het overnemen
          set({ nowPlayingSource: null });
        }
      }
    }, SPOTIFY_POLL_MS);
  },

  loginSpotify: () => { loginWithSpotify(); },

  // Verbinding met de PandaOS-server. Valt die weg (server herstart, hapering), dan elke paar seconden opnieuw
  // proberen; na het herstellen verbindt de laatst gebruikte telefoon ook weer automatisch.
  initSocketListeners: () => {
    let socket = (window as any).socket as WebSocket | undefined;
    if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
      socket = new WebSocket(SERVER_URL);
      (window as any).socket = socket;
    }

    if (socket.readyState === WebSocket.OPEN) set({ isSocketReady: true, btStatusMessage: 'Systeem verbonden' });

    socket.onopen = () => {
      socketRetryDelay = 1000;
      set({ isSocketReady: true, btStatusMessage: 'Systeem verbonden' });
      const lastDevice = localStorage.getItem('lastConnectedBT');
      if (lastDevice) sendToSocket('CONNECT_BT_DEVICE', { address: lastDevice });
    };

    socket.onclose = () => {
      set({ isSocketReady: false, btStatusMessage: 'Verbinding met server verbroken, opnieuw verbinden...' });
      setTimeout(() => get().initSocketListeners(), socketRetryDelay);
      socketRetryDelay = Math.min(socketRetryDelay * 2, 10000); // 1, 2, 4, 8, 10, 10 ... seconden
    };

    socket.onmessage = (event: any) => {
      const msg = JSON.parse(event.data);
      switch (msg.event) {
        case 'BT_DEVICE_FOUND':
          set((state) => state.btDevices.some(d => d.address === msg.data.address) ? state : { btDevices: [...state.btDevices, { ...msg.data, connected: !!msg.data.connected }] });
          break;
        case 'BT_STATUS':
          set((state) => ({ btStatusMessage: msg.message, btRadioOn: msg.radioOn ?? state.btRadioOn }));
          break;
        // Wat er speelt (Windows-mediabediening, ook muziek van de telefoon via Bluetooth)
        // Spotify gaat voor: Windows ziet muziek van de telefoon via Bluetooth niet (geen AVRCP-gegevens)
        case 'MEDIA_STATE':
          if (get().nowPlayingSource === 'spotify' || get().nowPlayingSource === 'android') break;
          if (msg.data.title) {
            set({
              nowPlayingSource: 'system',
              currentTrack: msg.data.title, currentArtist: msg.data.artist, isPlaying: msg.data.isPlaying,
              mediaPosition: msg.data.position, mediaDuration: msg.data.duration
            });
          } else if (get().nowPlayingSource === 'system') {
            set({ nowPlayingSource: null, currentTrack: '', currentArtist: '', isPlaying: false, mediaPosition: 0, mediaDuration: 0, albumArt: null });
          }
          break;
        case 'MEDIA_COVER':
          if (get().nowPlayingSource !== 'spotify' && get().nowPlayingSource !== 'android') set({ albumArt: msg.data });
          break;
        // --- Telefoon (van server/scripts/phone.js) ---
        case 'PHONE_INCOMING':
          get().receiveIncomingCall(msg.data.name, msg.data.number);
          break;
        case 'PHONE_CALL_STATE':
          if (msg.data.state === 'idle') set({ call: IDLE_CALL });
          else set((state) => ({ call: {
            ...state.call, ...msg.data,
            startedAt: msg.data.state === 'active' ? (state.call.startedAt ?? Date.now()) : state.call.startedAt
          } }));
          break;
        case 'PHONE_CONTACTS':
          set({ phoneContacts: msg.data || [] });
          break;
        case 'PHONE_RECENTS':
          set({ phoneRecents: msg.data || [] });
          break;
        case 'PHONE_STATUS':
          set({ phoneStatus: msg.message || null });
          break;
        case 'BT_AUDIO':
          set({ btAudioState: msg.state });
          break;
        case 'BT_DISCOVERABLE':
          set({
            btStatusMessage: msg.message,
            btDiscoverable: { on: !!msg.on, until: msg.on && msg.seconds ? Date.now() + msg.seconds * 1000 : null, name: msg.name || '' }
          });
          break;
        case 'BT_ERROR':
          set({ isScanning: false, btStatusMessage: msg.message });
          break;
        case 'BT_SCAN_FINISHED':
          set((state) => ({
            isScanning: false,
            btRadioOn: msg.radioOn ?? state.btRadioOn,
            // Bij Bluetooth uit blijft de melding van BT_STATUS staan ("Bluetooth staat uit...")
            btStatusMessage: msg.radioOn === false
              ? state.btStatusMessage
              : msg.count > 0 ? `${msg.count} telefoon(s) gevonden` : 'Geen telefoons gevonden. Open Bluetooth op je telefoon zodat hij zichtbaar is.'
          }));
          break;
        case 'BT_CONNECTED':
          set((state) => {
            // Verbonden telefoon onthouden (My Devices), zodat hij later zonder scan te verbinden is
            const found = state.btDevices.find((d) => d.address === msg.data.address)
              || state.btKnownDevices.find((d) => d.address === msg.data.address);
            const known = found
              ? [{ name: found.name, address: found.address, mac: found.mac }, ...state.btKnownDevices.filter((d) => d.address !== found.address)]
              : state.btKnownDevices;
            return {
              btStatusMessage: 'Verbonden!',
              btConnectedAddress: msg.data.address,
              btKnownDevices: known,
              btDevices: state.btDevices.map(d => d.address === msg.data.address ? { ...d, connected: true } : d)
            };
          });
          break;
        case 'BT_DISCONNECTED':
          set((state) => ({
            btStatusMessage: 'Ontkoppeld.',
            btConnectedAddress: state.btConnectedAddress === msg.data.address ? null : state.btConnectedAddress,
            btDevices: state.btDevices.map(d => d.address === msg.data.address ? { ...d, connected: false } : d)
          }));
          break;
        // Koplampstand van de auto via OBD2 (server stuurt { on: true/false }); stuurt het thema in Auto-modus.
        case 'OBD_HEADLIGHTS': set({ vehicleLightsOn: !!msg.data?.on }); break;
      }
    };
  },

  closeAll: () => set({
    panelApp: null,
    isMenuOpen: false,
    isMapOpen: false,
    isQuickActionsOpen: false,
    isKeyboardOpen: false,
    isVolumeOpen: false,
    isAudioSettingsOpen: false,
    isMusicOpen: false,
    isCarPlayOpen: false,
    isCameraOpen: false,
    isPhoneOpen: false,
    isCanMonitorOpen: false,
    isTheaterOpen: false,
    isArcadeOpen: false,
    isToyboxOpen: false,
    isDiagnosticsOpen: false,
    activeWebApp: null,
    isAppEditMode: false
  }),

  // CAN-monitor-app (half scherm, zoals Settings): live signalen van het CAN-kastje/de radio
  isCanMonitorOpen: false,
  openCanMonitor: () => {
    get().addRecentApp('canmonitor');
    set({
      isCanMonitorOpen: true, isMenuOpen: false, isMusicOpen: false, isPhoneOpen: false, isMapOpen: false,
      activeWebApp: null, isCarPlayOpen: false, isCameraOpen: false, isQuickActionsOpen: false,
    });
  },
  closeCanMonitor: () => set({ isCanMonitorOpen: false }),

  // Contacten, Agenda, Berichten (half scherm, naast de auto) met gegevens van de telefoon
  panelApp: null,
  openPanelApp: (app) => {
    get().addRecentApp(app);
    set({
      panelApp: app, isTheaterOpen: false, isArcadeOpen: false, isToyboxOpen: false, isDiagnosticsOpen: false, isCanMonitorOpen: false,
      isMenuOpen: false, isMusicOpen: false, isPhoneOpen: false, isMapOpen: false, activeWebApp: null, isCarPlayOpen: false,
      isCameraOpen: false, isQuickActionsOpen: false,
    });
  },
  closePanelApp: () => set({ panelApp: null }),

  // Theater (half scherm, naast de auto): tegels van videoapps; geïnstalleerd = openen, anders de Play Store
  isTheaterOpen: false,
  openTheater: () => {
    get().addRecentApp('netflix');
    set({
      isTheaterOpen: true, isArcadeOpen: false, isToyboxOpen: false, isDiagnosticsOpen: false, isCanMonitorOpen: false, isMenuOpen: false, isMusicOpen: false, isPhoneOpen: false, isMapOpen: false,
      activeWebApp: null, isCarPlayOpen: false, isCameraOpen: false, isQuickActionsOpen: false,
    });
  },
  closeTheater: () => set({ isTheaterOpen: false }),

  // Arcade (half scherm, naast de auto): uitgelicht spel bovenaan, rij met alle geïnstalleerde games eronder
  isArcadeOpen: false,
  openArcade: () => {
    get().addRecentApp('arcade');
    set({
      isArcadeOpen: true, isTheaterOpen: false, isToyboxOpen: false, isDiagnosticsOpen: false, isCanMonitorOpen: false, isMenuOpen: false, isMusicOpen: false, isPhoneOpen: false,
      isMapOpen: false, activeWebApp: null, isCarPlayOpen: false, isCameraOpen: false, isQuickActionsOpen: false,
    });
  },
  closeArcade: () => set({ isArcadeOpen: false }),

  // Toybox (half scherm, naast de auto): speeltjes zoals Regenboogvloer, Tekenblok en Haardvuur
  isToyboxOpen: false,
  openToybox: () => {
    get().addRecentApp('toybox');
    set({
      isToyboxOpen: true, isArcadeOpen: false, isDiagnosticsOpen: false, isTheaterOpen: false, isCanMonitorOpen: false, isMenuOpen: false, isMusicOpen: false,
      isPhoneOpen: false, isMapOpen: false, activeWebApp: null, isCarPlayOpen: false, isCameraOpen: false, isQuickActionsOpen: false,
    });
  },
  closeToybox: () => set({ isToyboxOpen: false }),

  // Diagnose (half scherm, naast de auto): logboek van PandaOS en Probleem melden
  isDiagnosticsOpen: false,
  openDiagnostics: () => {
    get().addRecentApp('diagnostics');
    set({
      isDiagnosticsOpen: true, isToyboxOpen: false, isArcadeOpen: false, isTheaterOpen: false, isCanMonitorOpen: false, isMenuOpen: false,
      isMusicOpen: false, isPhoneOpen: false, isMapOpen: false, activeWebApp: null, isCarPlayOpen: false, isCameraOpen: false, isQuickActionsOpen: false,
    });
  },
  closeDiagnostics: () => set({ isDiagnosticsOpen: false }),
}), {
  name: 'pandaos-settings',
  version: 2,
  storage: createJSONStorage(() => localStorage),
  // Versie 2: standaard afgestemd op Davids auto. Oude opslag had "Automaat" als standaard (nooit zelf gekozen,
  // de auto is handgeschakeld); die gaat eenmalig naar handgeschakeld. Andere eigen keuzes blijven staan.
  migrate: (persisted, version) => {
    const saved = (persisted || {}) as Partial<UIState>;
    if (version < 2 && saved.vehicleSettings?.transmission === 'Automatic') {
      saved.vehicleSettings = { ...saved.vehicleSettings, transmission: MY_VEHICLE_SETTINGS.transmission ?? 'Manual' };
    }
    return saved as UIState;
  },
  partialize: (state) => Object.fromEntries(PERSISTED_KEYS.map((key) => [key, state[key]])) as Partial<UIState>,
  // Nieuwe velden in bijv. displaySettings krijgen hun standaardwaarde, ook als er al een oudere opslag is
  merge: (persisted, current) => {
    const saved = (persisted || {}) as Partial<UIState>;
    return {
      ...current,
      ...saved,
      displaySettings: { ...current.displaySettings, ...saved.displaySettings },
      lightsSettings: { ...current.lightsSettings, ...saved.lightsSettings },
      navigationSettings: { ...current.navigationSettings, ...saved.navigationSettings },
      vehicleSettings: { ...current.vehicleSettings, ...saved.vehicleSettings },
      audioSettings: { ...current.audioSettings, ...saved.audioSettings },
      safetySettings: { ...current.safetySettings, ...saved.safetySettings },
      appSettings: { ...current.appSettings, ...saved.appSettings },
      // Trip A en B blijven bewaard; de huidige rit begint bij elke start op nul
      trips: { ...current.trips, ...saved.trips, current: emptyTrip() },
    };
  },
}));