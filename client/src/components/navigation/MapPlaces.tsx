// Handige plekken op de PandaOS-kaart (Instellingen > Navigatie > Op de kaart): tankstations (met je brandstof),
// laadpalen, eten, parkeren, boodschappen en toiletten. Uit OpenStreetMap (Overpass), voor het zichtbare deel van de
// kaart vanaf zoomniveau 13, opnieuw na het verschuiven (met een korte pauze). Tik op een plek = naam en soort.
// Bron: Mapbox-zoeken per soort (betrouwbaar, met de PandaOS-token; een uur bewaard per stukje kaart), anders
// OpenStreetMap (Overpass). Toiletten alleen uit OpenStreetMap.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useUIStore } from '../../store/uiStore';
import { diag } from '../../services/diagnostics';
import { DEFAULT_MAPBOX_TOKEN } from './mapbox';

// Mapbox-categorieën per soort plek
const MAPBOX_CATEGORY: Partial<Record<string, string>> = {
  fuel: 'gas_station', charging: 'charging_station', food: 'food_and_drink', parking: 'parking_lot', groceries: 'supermarket',
};
const mapboxCache = new Map<string, { at: number; places: any[] }>();

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

type Place = { id: string; kind: PlaceKind; lat: number; lon: number; name: string; tags: Record<string, string> };

const OVERPASS_TIMEOUT = 12000;
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const iconCache = new Map<PlaceKind, L.DivIcon>();
const iconFor = (kind: PlaceKind) => {
  if (!iconCache.has(kind)) {
    const k = PLACE_KINDS.find((p) => p.id === kind)!;
    iconCache.set(kind, L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13],
      html: `<div class="map-place" style="background:${k.color}">${PLACE_ICONS[kind]}</div>` }));
  }
  return iconCache.get(kind)!;
};

const MapPlaces: React.FC = () => {
  const { navigationSettings } = useUIStore();
  const placesKey = (navigationSettings.places ?? []).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const enabled = useMemo(() => (placesKey ? placesKey.split(',') : []) as PlaceKind[], [placesKey]);
  const fuel = navigationSettings.fuelType ?? 'euro95';
  const [places, setPlaces] = useState<Place[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const lastKey = useRef('');

  const token = (navigationSettings.mapboxToken ?? '').trim() || DEFAULT_MAPBOX_TOKEN;

  // Eén soort via Mapbox (null = mislukt). Per stukje kaart (afgerond) een uur bewaard, zo blijft het aantal verzoeken laag.
  const fromMapbox = useCallback(async (kind: PlaceKind, map: L.Map): Promise<Place[] | null> => {
    const category = MAPBOX_CATEGORY[kind];
    if (!category || !token) return null;
    const c = map.getCenter(); const b = map.getBounds();
    const key = `${kind}:${c.lat.toFixed(2)}:${c.lng.toFixed(2)}:${Math.round(map.getZoom())}`;
    const hit = mapboxCache.get(key);
    if (hit && Date.now() - hit.at < 3_600_000) return hit.places;
    try {
      const url = `https://api.mapbox.com/search/searchbox/v1/category/${category}?proximity=${c.lng.toFixed(4)},${c.lat.toFixed(4)}`
        + `&bbox=${b.getWest().toFixed(4)},${b.getSouth().toFixed(4)},${b.getEast().toFixed(4)},${b.getNorth().toFixed(4)}`
        + `&limit=25&language=nl&access_token=${token}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const list: Place[] = (data.features ?? []).map((f: any) => ({
        id: `mb-${f.properties?.mapbox_id ?? f.geometry.coordinates.join(',')}`, kind,
        lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
        name: f.properties?.name ?? '', tags: { address: f.properties?.address ?? '' },
      }));
      mapboxCache.set(key, { at: Date.now(), places: list });
      return list;
    } catch (error) { diag('warn', 'map', `Plekken via Mapbox (${kind}): ${error}`); return null; }
  }, [token]);

  const load = useCallback(async (map: L.Map) => {
    if (enabled.length === 0 || map.getZoom() < 13) { setPlaces((p) => (p.length ? [] : p)); return; }
    const b = map.getBounds();
    const bbox = `${b.getSouth().toFixed(3)},${b.getWest().toFixed(3)},${b.getNorth().toFixed(3)},${b.getEast().toFixed(3)}`;
    const key = `${bbox}|${enabled.join(',')}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    // Eerst Mapbox; wat daar niet lukt (of toiletten) via OpenStreetMap
    const found: Place[] = [];
    const rest: PlaceKind[] = [];
    await Promise.all(enabled.map(async (kind) => {
      const list = await fromMapbox(kind, map);
      if (list) found.push(...list); else rest.push(kind);
    }));
    setPlaces(found);
    if (rest.length === 0) return;
    const parts = PLACE_KINDS.filter((k) => rest.includes(k.id)).map((k) => `${k.query}(${bbox});`).join('');
    const query = `[out:json][timeout:20];(${parts});out center 300;`;
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
          const kind = PLACE_KINDS.find((k) => {
            if (k.id === 'fuel') return tags.amenity === 'fuel';
            if (k.id === 'charging') return tags.amenity === 'charging_station';
            if (k.id === 'food') return /^(restaurant|fast_food|cafe)$/.test(tags.amenity ?? '');
            if (k.id === 'parking') return tags.amenity === 'parking';
            if (k.id === 'groceries') return /^(supermarket|convenience)$/.test(tags.shop ?? '');
            return tags.amenity === 'toilets';
          })?.id;
          if (!kind) continue;
          // Tankstation zonder jouw brandstof (als het station dat aangeeft) overslaan
          if (kind === 'fuel' && FUEL_TAGS[fuel] && tags[FUEL_TAGS[fuel]] === 'no') continue;
          list.push({ id: `${e.type}${e.id}`, kind, lat, lon, name: tags.name ?? tags.brand ?? tags.operator ?? '', tags });
        }
        setPlaces([...found, ...list]);
        return;
      } catch (error) { diag('warn', 'map', `Plekken ophalen (${url}): ${error}`); }
    }
    lastKey.current = ''; // later opnieuw proberen
  }, [enabled, fuel, fromMapbox]);

  const map = useMapEvents({
    moveend: () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => load(map), 700); },
  });
  useEffect(() => { lastKey.current = ''; load(map); }, [load, map]);

  return (
    <>
      {places.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lon]} icon={iconFor(p.kind)}>
          <Popup>
            <strong>{p.name || PLACE_KINDS.find((k) => k.id === p.kind)?.label}</strong>
            {p.tags.address && <div>{p.tags.address}</div>}
            {p.tags.opening_hours && <div>{p.tags.opening_hours}</div>}
          </Popup>
        </Marker>
      ))}
    </>
  );
};

export default MapPlaces;
