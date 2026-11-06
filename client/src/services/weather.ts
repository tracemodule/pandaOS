// Weer en buitentemperatuur voor de bovenbalk (zoals bij Tesla linksboven). Bron: Open-Meteo (gratis, geen sleutel).
// Plek: GPS van de radio (afgerond op ±10 km, meer is niet nodig voor het weer); zonder GPS een plaats bij de gekozen
// tijdzone (Instellingen > Scherm) of de tijdzone van het apparaat. Elke 15 minuten opnieuw; laatste stand onthouden.
// Dezelfde aanvraag levert ook de gegevens voor de weer-popup (useWeatherDetails, zie components/weather/WeatherPopup.tsx).
import { useEffect, useState } from 'react';
import { useUIStore } from '../store/uiStore';

export type Weather = { temp: number; code: number; isDay: boolean; at: number };

const CACHE_KEY = 'pandaos-weather';
const DETAILS_KEY = 'pandaos-weather-details';
const PLACE_KEY = 'pandaos-weather-place';
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

// Laatste weerstand zonder zelf op te halen (Toybox > Weer op de auto); de bovenbalk (useWeather) houdt hem vers.
// Ouder dan 3 uur telt niet.
export const cachedWeather = (): Weather | null => {
  const cached = readCache();
  return cached && Date.now() - cached.at < 3 * 3600_000 ? cached : null;
};

const gpsPlace = () => new Promise<[number, number] | null>((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(
    (p) => resolve([p.coords.latitude, p.coords.longitude]),
    () => resolve(null),
    { maximumAge: 30 * 60_000, timeout: 8000 },
  );
});

// Uitgebreide weerstand voor de weer-popup (tik op de temperatuur in de bovenbalk)
export type HourForecast = { time: number; temp: number; code: number; isDay: boolean; rainChance: number | null };
export type WeatherDetails = Weather & {
  humidity: number | null;   // %
  windSpeed: number | null;  // km/u
  windDir: number | null;    // graden (waar de wind vandaan komt)
  uv: number | null;
  rainChance: number | null; // %
  high: number | null;       // vandaag, °C
  low: number | null;
  hourly: HourForecast[];    // komende 12 uur (time in ms)
  aqi: number | null;        // Europese luchtkwaliteitsindex (0–100+)
  lat: number; lon: number;  // afgeronde positie (1 decimaal)
  gps: boolean;              // positie uit GPS (anders uit de tijdzone)
  zone: string;
};

const readDetails = (): WeatherDetails | null => {
  try { return JSON.parse(localStorage.getItem(DETAILS_KEY) ?? 'null'); } catch { return null; }
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Luchtkwaliteit (aparte Open-Meteo-dienst); mislukt = gewoon geen waarde
const fetchAqi = async (lat: number, lon: number): Promise<number | null> => {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi`;
    const response = await fetch(url, { signal: AbortSignal.timeout?.(10000) });
    if (!response.ok) return null;
    return num((await response.json())?.current?.european_aqi);
  } catch { return null; }
};

// Eén Open-Meteo-aanvraag voor bovenbalk én popup
const fetchDetails = async (zone: string): Promise<WeatherDetails | null> => {
  const gps = await gpsPlace();
  const place = gps ?? ZONE_PLACES[zone] ?? ZONE_PLACES['Europe/Amsterdam'];
  const [lat, lon] = place.map((v) => Math.round(v * 10) / 10);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,weather_code,is_day,relative_humidity_2m,wind_speed_10m,wind_direction_10m,uv_index,precipitation_probability'
    + '&hourly=temperature_2m,weather_code,precipitation_probability,is_day&forecast_hours=12'
    + '&daily=temperature_2m_max,temperature_2m_min&forecast_days=2&timezone=auto&timeformat=unixtime';
  const [response, aqi] = await Promise.all([fetch(url, { signal: AbortSignal.timeout?.(10000) }), fetchAqi(lat, lon)]);
  if (!response.ok) return null;
  const data = await response.json();
  const current = data?.current;
  if (typeof current?.temperature_2m !== 'number') return null;
  const h = data?.hourly ?? {};
  const times: unknown[] = Array.isArray(h.time) ? h.time : [];
  const hourly: HourForecast[] = [];
  times.forEach((t, i) => {
    const temp = num(h.temperature_2m?.[i]);
    if (typeof t !== 'number' || temp === null) return;
    hourly.push({ time: t * 1000, temp, code: h.weather_code?.[i] ?? 0, isDay: h.is_day?.[i] !== 0, rainChance: num(h.precipitation_probability?.[i]) });
  });
  return {
    temp: current.temperature_2m, code: current.weather_code ?? 0, isDay: current.is_day !== 0, at: Date.now(),
    humidity: num(current.relative_humidity_2m), windSpeed: num(current.wind_speed_10m),
    windDir: num(current.wind_direction_10m), uv: num(current.uv_index),
    rainChance: num(current.precipitation_probability) ?? hourly[0]?.rainChance ?? null,
    high: num(data?.daily?.temperature_2m_max?.[0]), low: num(data?.daily?.temperature_2m_min?.[0]),
    hourly, aqi, lat, lon, gps: !!gps, zone,
  };
};

// Beide caches bijwerken (bovenbalk + popup)
const storeDetails = (d: WeatherDetails): Weather => {
  const basic: Weather = { temp: d.temp, code: d.code, isDay: d.isDay, at: d.at };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(basic));
    localStorage.setItem(DETAILS_KEY, JSON.stringify(d));
  } catch { /* opslag vol: niet erg */ }
  return basic;
};

const fetchWeather = async (zone: string): Promise<Weather | null> => {
  const details = await fetchDetails(zone);
  return details ? storeDetails(details) : null;
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
        const next = await fetchWeather(zone); // bewaart zelf in de cache
        if (next && !stopped) setWeather(next);
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

// WMO-weercode → omschrijving (Engelse sleutel voor useT(); NL staat in i18n.ts)
export const weatherText = (code: number): string =>
  code === 0 ? 'Clear sky' : code === 1 ? 'Mostly clear' : code === 2 ? 'Partly cloudy' : code === 3 ? 'Overcast'
    : code <= 48 ? 'Fog' : code <= 57 ? 'Drizzle' : code === 66 || code === 67 ? 'Freezing rain'
    : code <= 65 ? 'Rain' : code <= 77 ? 'Snow' : code <= 82 ? 'Rain showers' : code <= 86 ? 'Snow showers'
    : 'Thunderstorm';

// Plaatsnaam bij de (afgeronde) positie: OpenStreetMap Nominatim, per positie onthouden.
// Zonder GPS (plaats uit de tijdzone) of zonder internet: de stad uit de tijdzone.
const zoneCity = (zone: string) => (zone.split('/').pop() ?? zone).replace(/_/g, ' ');

const readPlaces = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(PLACE_KEY) ?? '{}') ?? {}; } catch { return {}; }
};

const fetchPlaceName = async (lat: number, lon: number, language: string): Promise<string | null> => {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${lat}&lon=${lon}&accept-language=${language}`;
  const response = await fetch(url, { signal: AbortSignal.timeout?.(10000) });
  if (!response.ok) return null;
  const a = (await response.json())?.address ?? {};
  const name = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state;
  return typeof name === 'string' && name ? name : null;
};

export type WeatherDetailsState = {
  details: WeatherDetails | null; // laatste stand (ook als die oud is)
  place: string | null;
  loading: boolean;               // bezig met ophalen en nog niets om te tonen
  offline: boolean;               // laatste poging mislukt (geen internet)
};

// Hook voor de weer-popup: haalt alleen op zolang `enabled` (popup open) en de stand ouder is dan 15 minuten
export const useWeatherDetails = (enabled: boolean): WeatherDetailsState => {
  const zone = useUIStore((s) => s.displaySettings?.timeZone) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const language = useUIStore((s) => s.displaySettings?.language) ?? 'nl';
  const [details, setDetails] = useState<WeatherDetails | null>(readDetails);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [place, setPlace] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const update = async () => {
      const cached = readDetails();
      if (cached) setDetails(cached);
      if (cached && cached.zone === zone && Date.now() - cached.at < REFRESH_MS) { setOffline(false); return; }
      setLoading(true);
      try {
        const next = await fetchDetails(zone);
        if (stopped) return;
        if (next) { storeDetails(next); setDetails(next); setOffline(false); } else setOffline(true);
      } catch { if (!stopped) setOffline(true); }
      finally { if (!stopped) setLoading(false); }
    };
    update();
    const timer = setInterval(update, 60_000);
    return () => { stopped = true; clearInterval(timer); };
  }, [enabled, zone]);

  const lat = details?.lat, lon = details?.lon, gps = details?.gps, dZone = details?.zone;
  useEffect(() => {
    if (!enabled || lat == null || lon == null) return;
    const fallback = zoneCity(dZone || zone);
    if (!gps) { setPlace(fallback); return; }
    const key = `${lat},${lon},${language}`;
    const known = readPlaces()[key];
    if (known) { setPlace(known); return; }
    setPlace((p) => p ?? fallback);
    let stopped = false;
    fetchPlaceName(lat, lon, language).then((name) => {
      if (!name || stopped) return;
      setPlace(name);
      try { localStorage.setItem(PLACE_KEY, JSON.stringify({ ...readPlaces(), [key]: name })); } catch { /* niet erg */ }
    }).catch(() => { /* geen internet: tijdzonestad blijft staan */ });
    return () => { stopped = true; };
  }, [enabled, lat, lon, gps, dZone, zone, language]);

  return { details, place, loading: loading && !details, offline };
};
