// Ritcomputer: telt afstand, rijtijd en topsnelheid met GPS (geen OBD2 nodig).
// Op de radio komt GPS van de ingebouwde ontvanger; op de laptop is het meestal een grove wifi-positie
// zonder snelheid, dan blijven de tellers vrijwel stil.
import { useUIStore } from '../store/uiStore';
import { updateSpeedLimit } from './speedLimit';

const MIN_MOVING_KMH = 3; // langzamer telt als stilstaan (GPS schommelt ook als je stilstaat)
const MAX_ACCURACY_M = 50; // onnauwkeurige metingen overslaan
const MAX_GAP_S = 30; // na een lange onderbreking (tunnel, slaapstand) geen sprong in afstand

let watchId: number | null = null;
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

const handlePosition = (pos: GeolocationPosition) => {
  const { latitude: lat, longitude: lon, accuracy, speed } = pos.coords;
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

  // Zet ook de versnelling: D bij rijden, P bij stilstand (R komt van het achteruit-signaal)
  useUIStore.getState().setGpsSpeed(speedKmh >= MIN_MOVING_KMH ? Math.round(speedKmh) : 0);
  if (speedKmh >= MIN_MOVING_KMH) {
    useUIStore.getState().addTripSample(meters, seconds, speedKmh);
    // Maximumsnelheid van de weg bijwerken (voor de snelheidswaarschuwing)
    updateSpeedLimit(lat, lon, (aLat, aLon) => distanceBetween(aLat, aLon, lat, lon));
  }
};

export const startTripComputer = () => {
  if (watchId !== null || !('geolocation' in navigator)) return;
  watchId = navigator.geolocation.watchPosition(handlePosition, (err) => console.warn('Ritcomputer GPS:', err.message), {
    enableHighAccuracy: true,
    maximumAge: 1000,
  });
};
