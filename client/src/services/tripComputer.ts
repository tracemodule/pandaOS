// Ritcomputer: telt afstand, rijtijd en topsnelheid met GPS (geen OBD2 nodig).
// Op de radio komt GPS van de ingebouwde ontvanger; op de laptop is het meestal een grove wifi-positie
// zonder snelheid, dan blijven de tellers vrijwel stil.
import { useUIStore } from '../store/uiStore';
import { updateSpeedLimit } from './speedLimit';
import { recordSample, restoreDrive, tickDriveLog } from './driveLog';
import { updateSpeedCameras } from './speedCameras';

const MIN_MOVING_KMH = 3; // langzamer telt als stilstaan (GPS schommelt ook als je stilstaat)
const MAX_ACCURACY_M = 50; // onnauwkeurige metingen overslaan
const MAX_GAP_S = 30; // na een lange onderbreking (tunnel, slaapstand) geen sprong in afstand

const START_KMH = 7; // vanaf hier (twee keer achter elkaar) telt het als rijden
const START_ACCURACY_M = 20; // rijden alleen starten bij een goede GPS-fix

let watchId: number | null = null;
let prevSpeedMs: number | null = null; // vorige gemeten snelheid (hard optrekken/remmen)
let moving = false;
let startCount = 0;
let stopCount = 0;
let last: { lat: number; lon: number; time: number } | null = null;

// Afstand in meter tussen twee punten (haversine)
const distanceBetween = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// Kompasrichting (0 = noord) van punt 1 naar punt 2
const bearingBetween = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

const handlePosition = (pos: GeolocationPosition) => {
  const { latitude: lat, longitude: lon, accuracy, speed, heading } = pos.coords;
  if (accuracy > MAX_ACCURACY_M) return;

  const now = pos.timestamp;
  const previous = last;
  last = { lat, lon, time: now };
  if (!previous) return;

  const seconds = (now - previous.time) / 1000;
  if (seconds <= 0 || seconds > MAX_GAP_S) return;

  const meters = distanceBetween(previous.lat, previous.lon, lat, lon);
  // Snelheid van de GPS zelf als die er is, anders berekend uit de verplaatsing
  const speedKmh = (speed ?? meters / seconds) * 3.6;

  // Stilstaan/rijden met speling: GPS schommelt bij stilstand soms tot ~5 km/h. Pas rijden als twee metingen achter
  // elkaar boven START_KMH liggen (met een goede fix), pas stilstaan als twee metingen onder MIN_MOVING_KMH liggen.
  if (!moving) {
    const candidate = speedKmh >= START_KMH && accuracy <= START_ACCURACY_M;
    startCount = candidate ? startCount + 1 : 0;
    if (startCount >= 2) { moving = true; stopCount = 0; }
  } else {
    stopCount = speedKmh < MIN_MOVING_KMH ? stopCount + 1 : 0;
    if (stopCount >= 2) { moving = false; startCount = 0; }
  }

  // Zet ook de versnelling: D bij rijden, P bij stilstand (R komt van het achteruit-signaal).
  // Een dashboard wijst wettelijk altijd iets te hoog aan; met de correctie (Settings > Display) toont PandaOS
  // hetzelfde als de teller van de auto.
  const offset = useUIStore.getState().displaySettings?.speedometerOffset ?? 0;
  useUIStore.getState().setGpsSpeed(moving ? Math.max(1, Math.round(speedKmh + offset)) : 0);
  // Ritten: route en cijfers per rit (alleen met een redelijke fix)
  recordSample(lat, lon, moving, speedKmh / 3.6, accuracy <= START_ACCURACY_M ? prevSpeedMs : null, seconds, moving ? meters : 0, now);
  prevSpeedMs = accuracy <= START_ACCURACY_M ? speedKmh / 3.6 : null;

  if (moving) {
    useUIStore.getState().addTripSample(meters, seconds, speedKmh);
    // Maximumsnelheid van de weg bijwerken (voor de snelheidswaarschuwing)
    // Rijrichting: van de GPS zelf, anders uit de verplaatsing (pas vanaf ~5 m, anders is het ruis)
    const course = heading !== null && Number.isFinite(heading) ? heading
      : meters >= 5 ? bearingBetween(previous.lat, previous.lon, lat, lon) : null;
    updateSpeedLimit(lat, lon, course);
    updateSpeedCameras(lat, lon, course);
  }
};

export const startTripComputer = () => {
  restoreDrive(); // rit van de vorige keer afsluiten (radio ging uit met de auto)
  window.setInterval(tickDriveLog, 30_000);
  // Testen/laptop: GPS-metingen nadoen (node tools/pandaos.mjs js "pandaTrips.feed(...)")
  (window as any).pandaTrips = { feed: (lat: number, lon: number, speedMs: number, time: number, accuracy = 5) =>
    handlePosition({ coords: { latitude: lat, longitude: lon, accuracy, speed: speedMs, heading: null }, timestamp: time } as any) };
  if (watchId !== null || !('geolocation' in navigator)) return;
  watchId = navigator.geolocation.watchPosition(handlePosition, (err) => console.warn('Ritcomputer GPS:', err.message), {
    enableHighAccuracy: true,
    maximumAge: 1000,
  });
};
