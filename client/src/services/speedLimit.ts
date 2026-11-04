// Maximumsnelheid van de weg waar je rijdt, uit OpenStreetMap (Overpass API, tag 'maxspeed').
// Wordt aangeroepen door de ritcomputer bij elke GPS-meting tijdens het rijden; vraagt hooguit
// elke 15 seconden en na 100 meter verplaatsing iets op. Zonder internet blijft de laatste waarde staan.
import { useUIStore } from '../store/uiStore';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const MIN_INTERVAL_MS = 15000;
const MIN_MOVE_M = 100;

let lastQuery: { lat: number; lon: number; time: number } | null = null;
let busy = false;

// 'maxspeed' kan "50", "50 mph", "NL:urban" enz. zijn; alleen een getal is bruikbaar
const parseMaxspeed = (value?: string): number | null => {
  if (!value) return null;
  const match = value.match(/^(\d+)\s*(mph)?/);
  if (!match) return null;
  const number = Number(match[1]);
  return match[2] ? Math.round(number * 1.609344) : number;
};

export const updateSpeedLimit = async (lat: number, lon: number, metersFrom: (aLat: number, aLon: number) => number) => {
  const now = Date.now();
  if (busy) return;
  if (lastQuery && (now - lastQuery.time < MIN_INTERVAL_MS || metersFrom(lastQuery.lat, lastQuery.lon) < MIN_MOVE_M)) return;

  busy = true;
  lastQuery = { lat, lon, time: now };
  try {
    const query = `[out:json][timeout:5];way(around:25,${lat},${lon})[highway][maxspeed];out tags 1;`;
    const response = await fetch(OVERPASS_URL, { method: 'POST', body: `data=${encodeURIComponent(query)}` });
    const data = await response.json();
    const limit = parseMaxspeed(data.elements?.[0]?.tags?.maxspeed);
    useUIStore.getState().setSpeedLimit(limit);
  } catch {
    // Geen verbinding: laatste bekende maximumsnelheid blijft staan
  } finally {
    busy = false;
  }
};
