// Handige plekken op de PandaOS-kaart (Instellingen > Navigatie > Op de kaart): tankstations (met je brandstof),
// laadpalen, eten, parkeren, boodschappen en toiletten. Uit OpenStreetMap (Overpass), voor het zichtbare deel van de
// kaart vanaf zoomniveau 13, opnieuw na het verschuiven (met een korte pauze). Tik op een plek = kaartje met details.
// Bron: Mapbox-zoeken per soort (betrouwbaar, met de PandaOS-token; een uur bewaard per stukje kaart), anders
// OpenStreetMap (Overpass). Toiletten alleen uit OpenStreetMap.
// Dezelfde ophaalcode doet ook het zoeken op soort ("tanken", "eten", "parkeren" in het zoekveld): searchNearby.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useUIStore } from '../../store/uiStore';
import { diag } from '../../services/diagnostics';
import { DEFAULT_MAPBOX_TOKEN } from './mapbox';

export type PlaceKind = 'fuel' | 'charging' | 'food' | 'parking' | 'groceries' | 'toilets';
// Witte iconen (SVG, paden van lucide) in een gekleurd rondje
const svg = (inner: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
export const PLACE_ICONS: Record<string, string> = {
  fuel: svg('<line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>'),
  charging: svg('<path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"/><path d="m2 22 3-3"/><path d="M7.5 13.5 10 11"/><path d="M10.5 16.5 13 14"/><path d="m18 3-4 4h6l-4 4"/>'),
  food: svg('<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>'),
  parking: svg('<path d="M8 21V3h6a5 5 0 0 1 0 10H8"/>'),
  groceries: svg('<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>'),
  toilets: svg('<circle cx="7" cy="4" r="2"/><circle cx="17" cy="4" r="2"/><path d="M5 22v-7H3l2-7h4l2 7H9v7"/><path d="M15 22V8h4v14"/>'),
};

export const PLACE_KINDS: { id: PlaceKind; label: string; color: string; query: string }[] = [
  { id: 'fuel', label: 'Petrol stations', color: '#e04e3b', query: 'nwr[amenity=fuel]' },
  { id: 'charging', label: 'Charging stations', color: '#3ba55d', query: 'nwr[amenity=charging_station]' },
  { id: 'food', label: 'Food and drinks', color: '#f5a623', query: 'nwr[amenity~"^(restaurant|fast_food|cafe)$"]' },
  { id: 'parking', label: 'Parking', color: '#3e6ae1', query: 'nwr[amenity=parking][access!=private]' },
  { id: 'groceries', label: 'Groceries', color: '#8e44ad', query: 'nwr[shop~"^(supermarket|convenience)$"]' },
  { id: 'toilets', label: 'Toilets', color: '#7f8c8d', query: 'nwr[amenity=toilets]' },
];

// Brandstof (Instellingen > Navigatie): welk OpenStreetMap-label een tankstation daarvoor moet hebben
export const FUEL_TAGS: Record<string, string> = {
  euro95: 'fuel:octane_95', e10: 'fuel:e10', diesel: 'fuel:diesel', lpg: 'fuel:lpg', super98: 'fuel:octane_98',
};

export type Place = {
  id: string; kind: PlaceKind; lat: number; lon: number; name: string; tags: Record<string, string>;
  label: string; // soort, voor de lijst en het kaartje ("Petrol stations", "Coffee")
  distance?: number; // meters vanaf de auto
};

// Eén soort plek om op te halen: Mapbox-categorie, Overpass-query en hoe je hem in OpenStreetMap herkent
export type PlaceQuery = { kind: PlaceKind; label: string; mapbox?: string; overpass: string; match: (tags: Record<string, string>) => boolean };

const QUERIES: Record<PlaceKind, PlaceQuery> = {
  fuel: { kind: 'fuel', label: 'Petrol stations', mapbox: 'gas_station', overpass: 'nwr[amenity=fuel]', match: (t) => t.amenity === 'fuel' },
  charging: { kind: 'charging', label: 'Charging stations', mapbox: 'charging_station', overpass: 'nwr[amenity=charging_station]', match: (t) => t.amenity === 'charging_station' },
  food: { kind: 'food', label: 'Food and drinks', mapbox: 'food_and_drink', overpass: 'nwr[amenity~"^(restaurant|fast_food|cafe)$"]', match: (t) => /^(restaurant|fast_food|cafe)$/.test(t.amenity ?? '') },
  parking: { kind: 'parking', label: 'Parking', mapbox: 'parking_lot', overpass: 'nwr[amenity=parking][access!=private]', match: (t) => t.amenity === 'parking' },
  groceries: { kind: 'groceries', label: 'Groceries', mapbox: 'supermarket', overpass: 'nwr[shop~"^(supermarket|convenience)$"]', match: (t) => /^(supermarket|convenience)$/.test(t.shop ?? '') },
  toilets: { kind: 'toilets', label: 'Toilets', overpass: 'nwr[amenity=toilets]', match: (t) => t.amenity === 'toilets' },
};
// Alleen voor zoeken op soort: koffie (icoon en kleur van eten)
const COFFEE: PlaceQuery = { kind: 'food', label: 'Coffee', mapbox: 'coffee', overpass: 'nwr[amenity=cafe]', match: (t) => t.amenity === 'cafe' };

// Woorden in het zoekveld die "plekken van deze soort in de buurt" betekenen (NL en EN, zonder accenten)
const CATEGORY_WORDS: [PlaceQuery, string[]][] = [
  [QUERIES.fuel, ['tanken', 'tankstation', 'tankstations', 'benzine', 'benzinepomp', 'benzinestation', 'pomp', 'fuel', 'gas', 'gas station', 'petrol', 'petrol station', 'diesel', 'lpg']],
  [QUERIES.charging, ['laden', 'laadpaal', 'laadpalen', 'laadstation', 'opladen', 'charging', 'charger', 'charging station', 'ev']],
  [COFFEE, ['koffie', 'coffee', 'cafe', 'koffiebar', 'espresso']],
  [QUERIES.food, ['eten', 'restaurant', 'restaurants', 'food', 'fastfood', 'fast food', 'snackbar', 'lunch', 'diner', 'eat', 'avondeten']],
  [QUERIES.parking, ['parkeren', 'parkeerplaats', 'parkeerplaatsen', 'parkeergarage', 'parking']],
  [QUERIES.groceries, ['supermarkt', 'supermarkten', 'boodschappen', 'supermarket', 'groceries', 'grocery']],
  [QUERIES.toilets, ['toilet', 'toiletten', 'wc', 'toilets', 'restroom']],
];
export const categoryForSearch = (text: string): PlaceQuery | null => {
  const word = text.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  if (!word) return null;
  return CATEGORY_WORDS.find(([, words]) => words.includes(word))?.[0] ?? null;
};

// Afstand in meters (haversine)
export const distanceMeters = (a: [number, number], b: [number, number]) => {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
};

// Adres voor de lijst en het kaartje: Mapbox geeft straat + plaats, OpenStreetMap losse addr:-labels
export const placeAddress = (p: Place) => {
  const t = p.tags;
  const street = t.address || [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  const city = t.city || t['addr:city'] || '';
  return [street, city].filter(Boolean).join(', ');
};

// Eén soort via Mapbox (null = mislukt). Bewaard per cacheKey (een uur), zo blijft het aantal verzoeken laag.
const mapboxCache = new Map<string, { at: number; places: Place[] }>();
export const fetchMapboxCategory = async (q: PlaceQuery, center: { lat: number; lon: number }, token: string,
  opts: { cacheKey: string; bbox?: [number, number, number, number]; limit?: number }): Promise<Place[] | null> => {
  if (!q.mapbox || !token) return null;
  const key = `${q.mapbox}:${opts.cacheKey}`;
  const hit = mapboxCache.get(key);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.places;
  try {
    const url = `https://api.mapbox.com/search/searchbox/v1/category/${q.mapbox}?proximity=${center.lon.toFixed(4)},${center.lat.toFixed(4)}`
      + (opts.bbox ? `&bbox=${opts.bbox.map((n) => n.toFixed(4)).join(',')}` : '')
      + `&limit=${opts.limit ?? 25}&language=nl&access_token=${token}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const list: Place[] = (data.features ?? []).map((f: any) => {
      const p = f.properties ?? {};
      return {
        id: `mb-${p.mapbox_id ?? f.geometry.coordinates.join(',')}`, kind: q.kind, label: q.label,
        lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: p.name ?? '',
        tags: { address: p.address ?? '', city: p.context?.place?.name ?? '', phone: p.metadata?.phone ?? '' },
      };
    });
    mapboxCache.set(key, { at: Date.now(), places: list });
    return list;
  } catch (error) { diag('warn', 'map', `Plekken via Mapbox (${q.mapbox}): ${error}`); return null; }
};

// Soorten via OpenStreetMap (Overpass) in een rechthoek "zuid,west,noord,oost" (null = alle servers mislukt)
const OVERPASS_TIMEOUT = 12000;
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
export const fetchOverpass = async (queries: PlaceQuery[], bbox: string, fuel: string, limit = 300): Promise<Place[] | null> => {
  const parts = queries.map((q) => `${q.overpass}(${bbox});`).join('');
  const query = `[out:json][timeout:20];(${parts});out center ${limit};`;
  for (const url of OVERPASS_URLS) {
    try {
      const controller = new AbortController();
      const t = window.setTimeout(() => controller.abort(), OVERPASS_TIMEOUT);
      const response = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(query)}`, signal: controller.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).finally(() => window.clearTimeout(t));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const list: Place[] = [];
      for (const e of data.elements ?? []) {
        const lat = e.lat ?? e.center?.lat; const lon = e.lon ?? e.center?.lon; const tags = e.tags ?? {};
        if (lat == null || lon == null) continue;
        const q = queries.find((k) => k.match(tags));
        if (!q) continue;
        // Tankstation zonder jouw brandstof (als het station dat aangeeft) overslaan
        if (q.kind === 'fuel' && FUEL_TAGS[fuel] && tags[FUEL_TAGS[fuel]] === 'no') continue;
        list.push({ id: `${e.type}${e.id}`, kind: q.kind, label: q.label, lat, lon, name: tags.name ?? tags.brand ?? tags.operator ?? '', tags });
      }
      return list;
    } catch (error) { diag('warn', 'map', `Plekken ophalen (${url}): ${error}`); }
  }
  return null;
};

// Zoeken op soort rond de auto: eerst Mapbox, anders OpenStreetMap binnen ca. 6 km. Gesorteerd op afstand.
// null = niet gelukt (geen internet of alle servers weg), [] = niets gevonden.
export const searchNearby = async (q: PlaceQuery, at: [number, number], token: string, fuel: string): Promise<Place[] | null> => {
  if (!navigator.onLine) return null;
  let list = await fetchMapboxCategory(q, { lat: at[0], lon: at[1] }, token, { cacheKey: `near:${at[0].toFixed(2)}:${at[1].toFixed(2)}`, limit: 15 });
  if (!list || list.length === 0) {
    const dLat = 0.055, dLon = 0.09;
    const bbox = `${(at[0] - dLat).toFixed(3)},${(at[1] - dLon).toFixed(3)},${(at[0] + dLat).toFixed(3)},${(at[1] + dLon).toFixed(3)}`;
    list = (await fetchOverpass([q], bbox, fuel, 150)) ?? list;
  }
  if (!list) return null;
  return list.map((p) => ({ ...p, distance: distanceMeters(at, [p.lat, p.lon]) }))
    .sort((a, b) => a.distance! - b.distance!).slice(0, 15);
};

const iconCache = new Map<PlaceKind, L.DivIcon>();
export const iconFor = (kind: PlaceKind) => {
  if (!iconCache.has(kind)) {
    const k = PLACE_KINDS.find((p) => p.id === kind)!;
    iconCache.set(kind, L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13],
      html: `<div class="map-place" style="background:${k.color}">${PLACE_ICONS[kind]}</div>` }));
  }
  return iconCache.get(kind)!;
};

// hidden: knop Plekken op de kaart (verbergt alles zonder de keuze in Instellingen te wissen)
const MapPlaces: React.FC<{ hidden?: boolean; onSelect?: (place: Place) => void }> = ({ hidden, onSelect }) => {
  const { navigationSettings } = useUIStore();
  const placesKey = hidden ? '' : (navigationSettings.places ?? []).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const enabled = useMemo(() => (placesKey ? placesKey.split(',') : []) as PlaceKind[], [placesKey]);
  const fuel = navigationSettings.fuelType ?? 'euro95';
  const [places, setPlaces] = useState<Place[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const lastKey = useRef('');

  const token = (navigationSettings.mapboxToken ?? '').trim() || DEFAULT_MAPBOX_TOKEN;

  const load = useCallback(async (map: L.Map) => {
    if (enabled.length === 0 || map.getZoom() < 13) { lastKey.current = ''; setPlaces((p) => (p.length ? [] : p)); return; }
    const b = map.getBounds();
    const bbox = `${b.getSouth().toFixed(3)},${b.getWest().toFixed(3)},${b.getNorth().toFixed(3)},${b.getEast().toFixed(3)}`;
    const key = `${bbox}|${enabled.join(',')}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    // Eerst Mapbox; wat daar niet lukt (of toiletten) via OpenStreetMap
    const c = map.getCenter();
    const found: Place[] = [];
    const rest: PlaceQuery[] = [];
    await Promise.all(enabled.map(async (kind) => {
      const list = await fetchMapboxCategory(QUERIES[kind], { lat: c.lat, lon: c.lng }, token, {
        cacheKey: `${c.lat.toFixed(2)}:${c.lng.toFixed(2)}:${Math.round(map.getZoom())}`,
        bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      });
      if (list) found.push(...list); else rest.push(QUERIES[kind]);
    }));
    if (lastKey.current !== key) return; // intussen verschoven of uitgezet
    setPlaces(found);
    if (rest.length === 0) return;
    const list = await fetchOverpass(rest, bbox, fuel);
    if (lastKey.current !== key) return;
    if (list) setPlaces([...found, ...list]);
    else lastKey.current = ''; // later opnieuw proberen
  }, [enabled, fuel, token]);

  const map = useMapEvents({
    moveend: () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => load(map), 700); },
  });
  useEffect(() => { lastKey.current = ''; load(map); }, [load, map]);

  if (enabled.length === 0) return null;
  return (
    <>
      {places.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lon]} icon={iconFor(p.kind)}
          eventHandlers={{ click: () => onSelect?.(p) }} />
      ))}
    </>
  );
};

export default MapPlaces;
