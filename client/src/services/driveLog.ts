// Ritten opnemen (Instellingen > Ritten): elke rit van vertrek tot stilstand, met route, afstand, rijtijd, snelheden
// en momenten van hard optrekken en hard remmen. Gevoed door tripComputer.ts (GPS).
// Einde van een rit: 2 minuten stilgestaan. Gaat de radio eerder uit (auto uit), dan staat de rit tussentijds in
// localStorage en wordt hij bij de volgende start afgesloten.
import { useUIStore, type DriveRecord, type DriveEvent } from '../store/uiStore';

const ACTIVE_KEY = 'pandaos-active-drive';
const STOP_AFTER_MS = 2 * 60_000; // zolang stil = rit voorbij
const MIN_DISTANCE_M = 300; // kortere ritjes (parkeren, verplaatsen) niet bewaren
const POINT_EVERY_M = 15; // routepunt na zoveel meter
const MAX_POINTS = 400; // route inkorten als hij langer wordt
const HARSH_ACCEL = 3.0; // m/s² (± 0,3 g): hard optrekken
const HARSH_BRAKE = -3.5; // m/s²: hard remmen
const EVENT_GAP_MS = 5000; // één gebeurtenis per 5 s

type Active = DriveRecord & { lastMove: number; lastPoint: [number, number] | null; lastEvent: number };
let active: Active | null = null;
let lastSave = 0;

const thin = (points: [number, number][]) => (points.length <= MAX_POINTS ? points : points.filter((_, i) => i % 2 === 0 || i === points.length - 1));

const distanceBetween = (a: [number, number], b: [number, number]) => {
  const R = 6371000; const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]); const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const save = () => { try { if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active)); } catch { /* vol */ } };

const finish = () => {
  const drive = active;
  active = null;
  try { localStorage.removeItem(ACTIVE_KEY); } catch { /* */ }
  if (!drive || drive.distance < MIN_DISTANCE_M) return;
  const { lastMove, lastPoint, lastEvent, ...record } = drive;
  void lastPoint; void lastEvent;
  record.end = lastMove;
  useUIStore.getState().addDrive(record);
};

// Bij het opstarten: een rit van de vorige keer (radio ging uit) afsluiten
export const restoreDrive = () => {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return;
    active = JSON.parse(raw);
    if (active && Date.now() - active.lastMove > STOP_AFTER_MS) finish();
  } catch { active = null; }
};

// Elke GPS-meting. moving = rijdt volgens de ritcomputer; speed in m/s (gemeten), dt in s sinds de vorige meting
export const recordSample = (lat: number, lon: number, moving: boolean, speedMs: number, prevSpeedMs: number | null, dt: number, meters: number, now: number) => {
  // Ritten opnemen uit (Instellingen > Navigatie): niets bijhouden, een lopende rit vergeten
  if (useUIStore.getState().navigationSettings.recordDrives === false) { active = null; return; }
  if (moving) {
    if (!active) {
      active = { id: `${now}`, start: now, end: now, distance: 0, driveTime: 0, maxSpeed: 0, points: [[lat, lon]], events: [],
        lastMove: now, lastPoint: [lat, lon], lastEvent: 0 };
    }
    active.distance += meters;
    active.driveTime += dt;
    active.maxSpeed = Math.max(active.maxSpeed, speedMs * 3.6);
    active.lastMove = now;
    if (!active.lastPoint || distanceBetween(active.lastPoint, [lat, lon]) >= POINT_EVERY_M) {
      active.points = thin([...active.points, [lat, lon]]);
      active.lastPoint = [lat, lon];
    }
    // Hard optrekken of remmen: snelheidsverandering tussen twee meting kort na elkaar
    if (prevSpeedMs !== null && dt > 0 && dt <= 3 && now - active.lastEvent > EVENT_GAP_MS) {
      const accel = (speedMs - prevSpeedMs) / dt;
      const type: DriveEvent['type'] | null = accel >= HARSH_ACCEL ? 'accel' : accel <= HARSH_BRAKE ? 'brake' : null;
      if (type) {
        active.events.push({ type, lat, lon, time: now, value: Math.round(accel * 10) / 10 });
        active.lastEvent = now;
      }
    }
  } else if (active && now - active.lastMove > STOP_AFTER_MS) {
    finish();
    return;
  }
  if (active && now - lastSave > 30_000) { lastSave = now; save(); }
};

// Ook zonder GPS-meting (bijv. tunnel, stilstand zonder fix) de rit afsluiten na 2 minuten
export const tickDriveLog = () => { if (active && Date.now() - active.lastMove > STOP_AFTER_MS) finish(); };

export const getActiveDrive = () => active;
