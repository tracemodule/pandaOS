// Weer en buitentemperatuur voor de bovenbalk (zoals bij Tesla linksboven). Bron: Open-Meteo (gratis, geen sleutel).
// Plek: GPS van de radio (afgerond op ±10 km, meer is niet nodig voor het weer); zonder GPS een plaats bij de gekozen
// tijdzone (Instellingen > Scherm) of de tijdzone van het apparaat. Elke 15 minuten opnieuw; laatste stand onthouden.
import { useEffect, useState } from 'react';
import { useUIStore } from '../store/uiStore';

export type Weather = { temp: number; code: number; isDay: boolean; at: number };

const CACHE_KEY = 'pandaos-weather';
const REFRESH_MS = 15 * 60_000;

// Hoofdsteden per tijdzone (alleen gebruikt als er geen GPS is)
const ZONE_PLACES: Record<string, [number, number]> = {
  'Europe/Amsterdam': [52.37, 4.9], 'Europe/Brussels': [50.85, 4.35], 'Europe/Berlin': [52.52, 13.4],
  'Europe/Paris': [48.86, 2.35], 'Europe/London': [51.51, -0.13], 'Europe/Luxembourg': [49.61, 6.13],
  'Europe/Madrid': [40.42, -3.7], 'Europe/Rome': [41.9, 12.5], 'Europe/Vienna': [48.21, 16.37],
  'Europe/Zurich': [47.38, 8.54], 'Europe/Copenhagen': [55.68, 12.57], 'Europe/Stockholm': [59.33, 18.07],
  'Europe/Oslo': [59.91, 10.75], 'Europe/Warsaw': [52.23, 21.01], 'Europe/Prague': [50.08, 14.44],
  'Europe/Lisbon': [38.72, -9.14], 'Europe/Dublin': [53.35, -6.26], 'Europe/Istanbul': [41.01, 28.98],
  'America/New_York': [40.71, -74.0], 'America/Chicago': [41.88, -87.63], 'America/Los_Angeles': [34.05, -118.24],
  'Asia/Tokyo': [35.68, 139.69], 'Australia/Sydney': [-33.87, 151.21],
};

const readCache = (): Weather | null => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null'); } catch { return null; }
};

const gpsPlace = () => new Promise<[number, number] | null>((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(
    (p) => resolve([p.coords.latitude, p.coords.longitude]),
    () => resolve(null),
    { maximumAge: 30 * 60_000, timeout: 8000 },
  );
});

const fetchWeather = async (zone: string): Promise<Weather | null> => {
  const place = (await gpsPlace()) ?? ZONE_PLACES[zone] ?? ZONE_PLACES['Europe/Amsterdam'];
  const [lat, lon] = place.map((v) => Math.round(v * 10) / 10);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day`;
  const response = await fetch(url, { signal: AbortSignal.timeout?.(10000) });
  if (!response.ok) return null;
  const data = await response.json();
  const current = data?.current;
  if (typeof current?.temperature_2m !== 'number') return null;
  return { temp: current.temperature_2m, code: current.weather_code ?? 0, isDay: current.is_day !== 0, at: Date.now() };
};

// Hook: laatste weerstand (of null zolang onbekend / uitgezet)
export const useWeather = (): Weather | null => {
  const enabled = useUIStore((s) => s.displaySettings?.showWeather !== false);
  const zone = useUIStore((s) => s.displaySettings?.timeZone) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [weather, setWeather] = useState<Weather | null>(() => {
    const cached = readCache();
    return cached && Date.now() - cached.at < 3 * 3600_000 ? cached : null; // ouder dan 3 uur: niet meer tonen
  });
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const update = async () => {
      const cached = readCache();
      if (cached && Date.now() - cached.at < REFRESH_MS) { setWeather(cached); return; }
      try {
        const next = await fetchWeather(zone);
        if (next && !stopped) { setWeather(next); localStorage.setItem(CACHE_KEY, JSON.stringify(next)); }
      } catch { /* geen internet: laatste stand blijft staan */ }
    };
    update();
    const timer = setInterval(update, 60_000); // elke minuut kijken of de 15 minuten om zijn
    return () => { stopped = true; clearInterval(timer); };
  }, [enabled, zone]);
  return enabled ? weather : null;
};

// WMO-weercode → soort weer (voor het icoon)
export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';
export const weatherKind = (code: number): WeatherKind =>
  code === 0 ? 'clear' : code <= 2 ? 'partly' : code === 3 ? 'cloudy' : code <= 48 ? 'fog'
    : code <= 57 ? 'drizzle' : code <= 67 || (code >= 80 && code <= 82) ? 'rain'
    : code <= 77 || code === 85 || code === 86 ? 'snow' : 'storm';
