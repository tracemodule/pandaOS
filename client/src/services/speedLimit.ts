// Maximumsnelheid van de weg waar je rijdt, uit OpenStreetMap (Overpass API, tag 'maxspeed').
// Werkwijze: één keer alle wegen in een straal van 400 m ophalen (met hun lijnen), en daarna bij elke GPS-meting
// zelf de weg kiezen waar de auto op rijdt: de dichtstbijzijnde weg die in dezelfde richting loopt als de auto.
// Pas als je bijna uit dat gebied bent, wordt het volgende stuk opgehaald. Zo kloppen kruisingen en parallelle
// wegen beter, en werkt het ook even zonder internet (tunnel, slechte dekking).
import { useUIStore } from '../store/uiStore';
import { diag } from './diagnostics';

// Openbare servers zijn soms overbelast (504/429) of traag: de volgende proberen, met een tijdslimiet
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const FETCH_TIMEOUT_MS = 40000;
const AHEAD_M = 250; // gebied vóór de auto ophalen (in de rijrichting), zodat het op tijd binnen is
const AREA_RADIUS_M = 500; // zoveel wegen eromheen ophalen
const REFETCH_FROM_EDGE_M = 200; // dichter dan dit bij de rand van het gebied: volgende stuk ophalen
const RETRY_MS = 20000; // na een mislukte vraag niet meteen opnieuw
const MAX_MATCH_M = 30; // verder van elke weg af: geen weg (parkeerplaats, onnauwkeurige GPS)

// Wegen waar je met de auto rijdt (geen fietspaden, voetpaden of parkeerterreinen)
const CAR_ROADS = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|road|'
  + 'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';

type Road = { limit: number | null; points: [number, number][]; oneway: boolean };

let area: { lat: number; lon: number; roads: Road[] } | null = null;
let busy = false;
let lastFailure = 0;
let lastReported: number | null | undefined;

// --- Waarde van 'maxspeed' lezen ---
// "50", "50 mph", landcodes zoals "NL:urban" / "DE:rural" / "NL:zone30", "walk", "none".
const IMPLICIT: Record<string, number> = {
  'NL:urban': 50, 'NL:rural': 80, 'NL:motorway': 130, 'NL:trunk': 100,
  'BE:urban': 50, 'BE-VLG:rural': 70, 'BE-WAL:rural': 90, 'BE:motorway': 120,
  'DE:urban': 50, 'DE:rural': 100, 'FR:urban': 50, 'FR:rural': 80, 'FR:motorway': 130,
};

export const parseMaxspeed = (value?: string): number | null => {
  if (!value) return null;
  const v = value.trim();
  const number = v.match(/^(\d+)\s*(mph)?$/);
  if (number) return number[2] ? Math.round(Number(number[1]) * 1.609344) : Number(number[1]);
  if (IMPLICIT[v]) return IMPLICIT[v];
  const zone = v.match(/:zone:?(\d+)$/i);
  if (zone) return Number(zone[1]);
  if (v === 'walk') return 15;
  return null; // 'none' (Duitse Autobahn), 'signals' enz.: geen vast bord
};

// --- 'maxspeed:conditional' met tijden, bv. "130 @ (19:00-06:00)" (Nederlandse snelwegen: overdag 100) ---
const minutesOf = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };

export const conditionalLimit = (value: string | undefined, now = new Date()): number | null => {
  if (!value) return null;
  const current = now.getHours() * 60 + now.getMinutes();
  for (const part of value.split(';')) {
    const m = part.match(/^\s*([^@]+?)\s*@\s*\(([^)]*)\)\s*$/);
    if (!m) continue;
    const limit = parseMaxspeed(m[1]);
    const times = m[2].match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g);
    // Alleen voorwaarden met alleen tijden begrijpen we (geen 'wet', 'Mo-Fr' of gewicht)
    if (limit === null || !times || /wet|snow|weight|[A-Z][a-z]-[A-Z][a-z]/.test(m[2])) continue;
    for (const range of times) {
      const [from, to] = range.split('-').map((s) => minutesOf(s.trim()));
      const inside = from <= to ? current >= from && current < to : current >= from || current < to;
      if (inside) return limit;
    }
  }
  return null;
};

// --- Meetkunde (vlakke benadering: prima voor afstanden van een paar honderd meter) ---
const M_PER_DEG = 111320;
const toXY = (lat: number, lon: number, refLat: number): [number, number] =>
  [lon * M_PER_DEG * Math.cos((refLat * Math.PI) / 180), lat * M_PER_DEG];

const metersBetween = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const [x1, y1] = toXY(lat1, lon1, lat1);
  const [x2, y2] = toXY(lat2, lon2, lat1);
  return Math.hypot(x2 - x1, y2 - y1);
};

// Afstand van punt tot een stuk weg, plus de richting (kompasgraden) van dat stuk
const toSegment = (p: [number, number], a: [number, number], b: [number, number]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  const distance = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
  return { distance, bearing: (bearing + 360) % 360 };
};

// De weg waar de auto op rijdt: dichtstbij, en met een strafpunt als de richting niet klopt
export const matchRoad = (roads: Road[], lat: number, lon: number, heading: number | null): Road | null => {
  const p = toXY(lat, lon, lat);
  let best: { road: Road; score: number } | null = null;
  for (const road of roads) {
    for (let i = 1; i < road.points.length; i++) {
      const a = toXY(road.points[i - 1][0], road.points[i - 1][1], lat);
      const b = toXY(road.points[i][0], road.points[i][1], lat);
      const { distance, bearing } = toSegment(p, a, b);
      if (distance > MAX_MATCH_M) continue;
      let score = distance;
      if (heading !== null && Number.isFinite(heading)) {
        const diff = Math.abs(((heading - bearing + 540) % 360) - 180); // 0..180
        // Haaks op de weg = waarschijnlijk een kruisende weg; tegen de rijrichting van eenrichtingsweg = verkeerd
        score += 20 * Math.abs(Math.sin((diff * Math.PI) / 180));
        if (road.oneway && diff > 90) score += 25;
      }
      if (!best || score < best.score) best = { road, score };
    }
  }
  return best?.road ?? null;
};

// Punt op afstand meters in kompasrichting heading
const ahead = (lat: number, lon: number, heading: number, meters: number): [number, number] => {
  const rad = (heading * Math.PI) / 180;
  return [lat + (meters * Math.cos(rad)) / M_PER_DEG, lon + (meters * Math.sin(rad)) / (M_PER_DEG * Math.cos((lat * Math.PI) / 180))];
};

// --- Ophalen bij Overpass ---
const fetchArea = async (lat: number, lon: number) => {
  const query = `[out:json][timeout:10];way(around:${AREA_RADIUS_M},${lat},${lon})[highway~"^(${CAR_ROADS})$"];out tags geom;`;
  let lastError: unknown;
  for (const url of OVERPASS_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const response = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(query)}`, signal: controller.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).finally(() => clearTimeout(timer));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const now = new Date();
      const roads: Road[] = (data.elements ?? [])
        .filter((e: any) => e.type === 'way' && Array.isArray(e.geometry))
        .map((e: any) => ({
          limit: conditionalLimit(e.tags?.['maxspeed:conditional'], now) ?? parseMaxspeed(e.tags?.maxspeed),
          points: e.geometry.map((g: any) => [g.lat, g.lon] as [number, number]),
          oneway: e.tags?.oneway === 'yes' || /motorway/.test(e.tags?.highway ?? ''),
        }));
      return roads;
    } catch (error) { lastError = error; }
  }
  throw lastError;
};

const publish = (limit: number | null) => {
  if (limit === lastReported) return;
  lastReported = limit;
  useUIStore.getState().setSpeedLimit(limit);
};

// Aangeroepen door de ritcomputer bij elke GPS-meting tijdens het rijden
export const updateSpeedLimit = (lat: number, lon: number, heading: number | null) => {
  if (area) {
    const road = matchRoad(area.roads, lat, lon, heading);
    publish(road ? road.limit : null);
  }

  const needArea = !area || metersBetween(area.lat, area.lon, lat, lon) > AREA_RADIUS_M - REFETCH_FROM_EDGE_M;
  if (!needArea || busy || Date.now() - lastFailure < RETRY_MS) return;
  busy = true;
  // Middelpunt een stuk vóór de auto: de weg die je op rijdt is dan al binnen voordat je er bent
  const [cLat, cLon] = heading !== null && Number.isFinite(heading) ? ahead(lat, lon, heading, AHEAD_M) : [lat, lon];
  fetchArea(cLat, cLon)
    .then((roads) => {
      area = { lat: cLat, lon: cLon, roads };
      const road = matchRoad(roads, lat, lon, heading);
      publish(road ? road.limit : null);
    })
    .catch((error) => {
      lastFailure = Date.now();
      diag('warn', 'Maximumsnelheid', `Wegen ophalen lukt niet: ${error instanceof Error ? error.message : error}`);
      // Buiten het opgehaalde gebied en geen internet: geen bord tonen in plaats van een oud, verkeerd bord
      if (area && metersBetween(area.lat, area.lon, lat, lon) > AREA_RADIUS_M) publish(null);
    })
    .finally(() => { busy = false; });
};
