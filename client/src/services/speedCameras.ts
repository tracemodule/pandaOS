// Vaste flitspalen en trajectcontroles uit OpenStreetMap (Overpass API): highway=speed_camera en
// enforcement-relaties (maxspeed, average_speed). Mobiele controles zitten niet in open data.
// Ophalen in een straal van 8 km; opnieuw als de auto meer dan 5 km verder is. Waarschuwen als een flitspaal binnen
// 500 m vóór de auto ligt (in de rijrichting), één keer per flitspaal.
import { useUIStore } from '../store/uiStore';
import { diag } from './diagnostics';

export type SpeedCamera = { id: number; lat: number; lon: number; maxspeed: number | null; kind: 'fixed' | 'section'; direction: number | null };

const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const RADIUS_M = 8000;
const REFETCH_M = 5000;
const WARN_M = 500;
const RETRY_MS = 60_000;

let cameras: SpeedCamera[] = [];
let fetchedAt: { lat: number; lon: number } | null = null;
let busy = false;
let lastFailure = 0;
const warned = new Map<number, number>(); // flitspaal -> tijd van de waarschuwing

const toRad = (d: number) => (d * Math.PI) / 180;
const meters = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const dLat = toRad(bLat - aLat); const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};
const bearing = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const y = Math.sin(toRad(bLon - aLon)) * Math.cos(toRad(bLat));
  const x = Math.cos(toRad(aLat)) * Math.sin(toRad(bLat)) - Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(toRad(bLon - aLon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};
const angleDiff = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const parseSpeed = (v?: string) => { const m = v?.match(/^(\d+)/); return m ? Number(m[1]) : null; };
const parseDirection = (v?: string) => {
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const compass: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
  return compass[v.toUpperCase()] ?? null;
};

const fetchCameras = async (lat: number, lon: number): Promise<SpeedCamera[]> => {
  const query = `[out:json][timeout:25];(node(around:${RADIUS_M},${lat},${lon})[highway=speed_camera];`
    + `relation(around:${RADIUS_M},${lat},${lon})[type=enforcement][enforcement~"^(maxspeed|average_speed)$"];);out tags center;>;out skel;`;
  let lastError: unknown;
  for (const url of OVERPASS_URLS) {
    try {
      const response = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const nodes = new Map<number, { lat: number; lon: number }>();
      for (const e of data.elements ?? []) if (e.type === 'node') nodes.set(e.id, { lat: e.lat, lon: e.lon });
      const list: SpeedCamera[] = [];
      for (const e of data.elements ?? []) {
        if (e.type === 'node' && e.tags?.highway === 'speed_camera') {
          list.push({ id: e.id, lat: e.lat, lon: e.lon, maxspeed: parseSpeed(e.tags.maxspeed), kind: 'fixed', direction: parseDirection(e.tags.direction) });
        } else if (e.type === 'relation' && e.tags) {
          // Begin van de controle: het lid "from" of "device", anders het midden
          const start = e.members?.find((m: any) => m.role === 'from' || m.role === 'device');
          const point = (start && nodes.get(start.ref)) || e.center;
          if (point) list.push({ id: e.id, lat: point.lat, lon: point.lon, maxspeed: parseSpeed(e.tags.maxspeed),
            kind: e.tags.enforcement === 'average_speed' ? 'section' : 'fixed', direction: null });
        }
      }
      return list;
    } catch (error) { lastError = error; }
  }
  throw lastError;
};

export const getSpeedCameras = () => cameras;

// Bij elke GPS-meting (tripComputer): zo nodig ophalen, en kijken of er een flitspaal vóór de auto ligt
export const updateSpeedCameras = (lat: number, lon: number, heading: number | null) => {
  const settings = useUIStore.getState().safetySettings;
  if (settings.speedCameraWarning === false) { useUIStore.setState({ cameraAhead: null }); return; }

  if ((!fetchedAt || meters(fetchedAt.lat, fetchedAt.lon, lat, lon) > REFETCH_M) && !busy && Date.now() - lastFailure > RETRY_MS) {
    busy = true;
    fetchCameras(lat, lon)
      .then((list) => { cameras = list; fetchedAt = { lat, lon }; window.dispatchEvent(new Event('pandaos-speed-cameras')); })
      .catch((e) => { lastFailure = Date.now(); diag('warn', 'map', `Flitspalen ophalen mislukt: ${e}`); })
      .finally(() => { busy = false; });
  }

  // Dichtstbijzijnde flitspaal vóór de auto (binnen 45° van de rijrichting; met een richting op de paal: die moet kloppen)
  let ahead: { camera: SpeedCamera; distance: number } | null = null;
  for (const camera of cameras) {
    const distance = meters(lat, lon, camera.lat, camera.lon);
    if (distance > WARN_M) continue;
    if (heading !== null) {
      if (angleDiff(bearing(lat, lon, camera.lat, camera.lon), heading) > 45) continue;
      if (camera.direction !== null && angleDiff(camera.direction, heading) > 60) continue;
    }
    if (!ahead || distance < ahead.distance) ahead = { camera, distance };
  }
  const current = useUIStore.getState().cameraAhead;
  if (!ahead) { if (current) useUIStore.setState({ cameraAhead: null }); return; }
  const firstTime = !warned.has(ahead.camera.id) || Date.now() - (warned.get(ahead.camera.id) ?? 0) > 10 * 60_000;
  if (firstTime) warned.set(ahead.camera.id, Date.now());
  useUIStore.setState({ cameraAhead: { distance: Math.round(ahead.distance / 10) * 10, maxspeed: ahead.camera.maxspeed, kind: ahead.camera.kind, chime: firstTime } });
};
