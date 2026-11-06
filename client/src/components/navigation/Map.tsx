import React, { useEffect, useState } from 'react';
import {
  Search, CornerUpLeft, CornerUpRight, MoveUp, RotateCw, Battery, MoreHorizontal, X, Plus, Minus, Navigation2, MapPin,
  Satellite, TrafficCone, MapPinned, Fuel, Info
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { useUIStore } from '../../store/uiStore';
import { getEffectiveTheme } from '../../settings';
import { useT } from '../../i18n';
import 'leaflet/dist/leaflet.css';
import './_map.scss';
import { diag } from '../../services/diagnostics';
import { PlacePickerModal } from './PlacePicker';
import { getSpeedCameras } from '../../services/speedCameras';
import MapPlaces, {
  categoryForSearch, searchNearby, placeAddress, distanceMeters, iconFor, PLACE_ICONS, PLACE_KINDS, type Place, type PlaceQuery
} from './MapPlaces';
import {
  DEFAULT_MAPBOX_TOKEN, mapboxTiles, mapboxPlainTiles, mapboxSatelliteTiles, MAPBOX_ATTRIBUTION, ESRI_SATELLITE_TILES, ESRI_ATTRIBUTION
} from './mapbox';
import PlaceCard from './PlaceCard';

// --- PDOK (gratis, Kadaster): kaart en adreszoeker voor Nederland ---
// BRT Achtergrondkaart, thema "grijs" (rustig, past bij de Tesla-stijl). Andere thema's: standaard, pastel, water.
const PDOK_TILES = 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png';
const PDOK_ATTRIBUTION = 'Kaartgegevens &copy; <a href="https://www.kadaster.nl">Kadaster</a>';
// Buiten Nederland heeft PDOK geen kaart (lege, grijze tegels). Daar, en als PDOK niet bereikbaar is, de wereldkaart
// van OpenStreetMap (gratis met naamsvermelding; CARTO vraagt sinds 2026 een API-sleutel).
const WORLD_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const WORLD_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
// Grove omtrek van Nederland [lengtegraad, breedtegraad]; een rechthoek is te grof (Keulen, Antwerpen vallen erin)
const NL_OUTLINE: [number, number][] = [
  [3.36, 51.37], [3.85, 51.21], [4.25, 51.38], [4.78, 51.43], [5.10, 51.43], [5.65, 51.20], [5.85, 51.15], [5.64, 50.85],
  [5.69, 50.75], [6.03, 50.72], [6.12, 50.90], [5.95, 51.05], [6.22, 51.38], [6.10, 51.85], [6.45, 51.85], [6.83, 51.96],
  [7.07, 52.24], [7.05, 52.63], [7.22, 53.24], [6.90, 53.45], [5.80, 53.50], [4.70, 53.20], [4.50, 52.80], [4.30, 52.30],
  [3.95, 51.85], [3.40, 51.55],
];
const inNetherlands = ([lat, lon]: [number, number]) => {
  let inside = false;
  for (let i = 0, j = NL_OUTLINE.length - 1; i < NL_OUTLINE.length; j = i++) {
    const [xi, yi] = NL_OUTLINE[i], [xj, yj] = NL_OUTLINE[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
// Waarom de kaart niet laadt, voor de melding op de kaart en het logboek
const mapProblem = () => {
  if (!navigator.onLine) return 'No internet connection: the map cannot load.';
  if (new Date().getFullYear() < 2025) return 'The clock of the radio is wrong, so secure connections fail. Set the date and time.';
  return 'The map server cannot be reached. Check the internet connection of the radio.';
};
// Location API: adressen eerst, woonplaatsen daarna. Coördinaten in CRS84 = [lengtegraad, breedtegraad].
const PDOK_SEARCH = 'https://api.pdok.nl/kadaster/location-api/v1/search'
  + '?adres[relevance]=1&adres[version]=1&woonplaats[relevance]=0.5&woonplaats[version]=1'
  + '&limit=5&crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84&q=';

// --- Custom Auto Marker Icoon ---
const carIconSVG = `
<svg width="40" height="40" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M50 10 L85 90 L50 75 L15 90 Z" fill="#e31937" stroke="white" stroke-width="5" stroke-linejoin="round"/>
</svg>`;

const createCarIcon = (heading: number) => {
  return L.divIcon({
    html: `<div style="transform: rotate(${heading}deg); transition: transform 0.2s ease;">${carIconSVG}</div>`,
    className: 'custom-car-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

// Afstand zoals Tesla hem toont: meters onder 1 km, daarna km met één decimaal
const formatDistance = (meters: number) =>
  meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;

const formatArrival = (seconds: number, departAt?: number | null) =>
  new Date((departAt ?? Date.now()) + seconds * 1000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

// Reistijd: "45 min" of "1 u 20 min"
const formatDuration = (seconds: number) => {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} u ${minutes % 60} min`;
};

// --- Map Controller (TomTom Logica) ---
const MapController = ({ position, isNavigating, is3D, recenterKey, fitPoints, following, onUserMove, onMapTap }: any) => {
  const map = useMap();

  // Zelf de kaart wegschuiven: niet meer de auto volgen (knop Centreren verschijnt); tik op de kaart = zoomknoppen
  useEffect(() => {
    const drag = () => onUserMove?.();
    const tap = () => onMapTap?.();
    map.on('dragstart', drag);
    map.on('click', tap);
    return () => { map.off('dragstart', drag); map.off('click', tap); };
  }, [map, onUserMove, onMapTap]);

  // Routevoorstel: uitzoomen zodat de auto en alle routes in beeld zijn (één keer per nieuwe route)
  const fitKey = fitPoints ? `${fitPoints.length}:${fitPoints[0]}:${fitPoints[fitPoints.length - 1]}` : '';
  useEffect(() => {
    if (!fitPoints || fitPoints.length < 2 || isNavigating) return;
    map.fitBounds(L.latLngBounds(fitPoints), { padding: [60, 60], animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, isNavigating, map]);

  // Leaflet meet zijn maat één keer. Het kaartpaneel groeit/krimpt mee met de split-view (0% → 70%),
  // dus bij elke maatverandering opnieuw meten; anders blijven delen van de kaart grijs.
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  useEffect(() => {
    if (!following) return;
    if (isNavigating) {
      map.setView(position, 18, { animate: true });
      // We gebruiken CSS classes op de map container voor het 3D effect
      const mapContainer = map.getContainer();
      if (is3D) {
        mapContainer.classList.add('tomtom-view');
      } else {
        mapContainer.classList.remove('tomtom-view');
      }
    } else if (!fitPoints) {
      map.setView(position, Math.max(map.getZoom(), 15), { animate: true });
      map.getContainer().classList.remove('tomtom-view');
    } else {
      map.getContainer().classList.remove('tomtom-view');
    }
  }, [position, isNavigating, is3D, map, recenterKey, fitPoints, following]);

  return null;
};

const Map: React.FC = () => {
  const {
    openKeyboard, closeKeyboard, keyboardValue,
    setKeyboardValue, isNavigating, setNavigating, screenMode, vehicleLightsOn, navigationSettings
  } = useUIStore();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  // Kaart: PandaOS (PDOK/OSM, standaard) of Mapbox (met eigen token uit Instellingen > Navigatie)
  const [mapboxFailed, setMapboxFailed] = useState(false);
  const mapboxToken = (navigationSettings.mapboxToken ?? '').trim() || DEFAULT_MAPBOX_TOKEN;
  const useMapbox = navigationSettings.mapProvider === 'mapbox' && mapboxToken.startsWith('pk.') && !mapboxFailed;
  // Knoppen rechts: satelliet, verkeer (alleen Mapbox), plekken, tankstations (bewaard in Instellingen > Navigatie)
  const satellite = !!navigationSettings.mapSatellite;
  const traffic = navigationSettings.mapTraffic !== false;
  const trafficAvailable = useMapbox && !satellite;
  const placesList = navigationSettings.places ?? [];
  const placesShown = !navigationSettings.placesHidden && placesList.length > 0;
  const fuelShown = placesShown && placesList.includes('fuel');
  // Token controleren met één tegel: ongeldig (401/403) = terug naar de PandaOS-kaart
  useEffect(() => {
    setMapboxFailed(false);
    if (navigationSettings.mapProvider !== 'mapbox') return;
    fetch(mapboxTiles(mapboxToken, false).replace('{z}/{x}/{y}', '1/1/1'))
      .then((r) => { if (r.status === 401 || r.status === 403) { setMapboxFailed(true); diag('warn', 'Navigatie', `Mapbox-token geweigerd (${r.status})`); } })
      .catch(() => { /* offline: tegels proberen het zelf */ });
  }, [mapboxToken, navigationSettings.mapProvider]);

  // States
  const [position, setPosition] = useState<[number, number]>([52.3676, 4.9041]);
  const t = useT();
  const [heading, setHeading] = useState(0);
  const [is3D, setIs3D] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<any>(null);
  // Thuis/Werk instellen: het volgende gekozen zoekresultaat wordt die plek (in plaats van een route)
  const [settingPlace, setSettingPlace] = useState<'home' | 'work' | null>(null);
  const [placeModal, setPlaceModal] = useState<'home' | 'work' | null>(null); // pop-up adres instellen
  // Vaste flitspalen (OpenStreetMap), bijgewerkt als er nieuwe zijn opgehaald
  const [speedCameras, setSpeedCameras] = useState(getSpeedCameras());
  useEffect(() => { const on = () => setSpeedCameras([...getSpeedCameras()]); window.addEventListener('pandaos-speed-cameras', on); return () => window.removeEventListener('pandaos-speed-cameras', on); }, []);
  const [routeData, setRouteData] = useState<any>(null);
  // Alle routes van OSRM (de gekozen staat in routeData); tik op het tijdlabel = die route kiezen
  const [routes, setRoutes] = useState<any[]>([]);
  // Later vertrekken (drie puntjes): vertrektijd; aankomst = vertrek + reistijd
  const [departAt, setDepartAt] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [departPicker, setDepartPicker] = useState(false);
  // Vrij rondkijken: volgt de auto tot je de kaart wegschuift; tik op de kaart = knoppen in/uitzoomen + Gereed
  const [following, setFollowing] = useState(true);
  const [zoomButtons, setZoomButtons] = useState(false);
  const mapRef = React.useRef<L.Map | null>(null);
  const [isRoutePreview, setIsRoutePreview] = useState(false);
  // Kaartje van een plek (tik op een plek of op (i) in de zoekresultaten)
  const [placeCard, setPlaceCard] = useState<Place | null>(null);
  // Zoeken op soort ("tanken", "eten", "parkeren"): plekken in de buurt, gesorteerd op afstand
  const [category, setCategory] = useState<{ query: PlaceQuery; status: 'loading' | 'done' | 'offline' | 'error'; places: Place[] } | null>(null);
  const positionRef = React.useRef(position);
  positionRef.current = position;
  // Korte melding op de kaart (bijv. waarom Verkeer niet kan)
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = React.useRef<number | undefined>(undefined);
  const showHint = (text: string) => { setHint(text); window.clearTimeout(hintTimer.current); hintTimer.current = window.setTimeout(() => setHint(null), 4000); };
  // Satelliet via Mapbox: lukt dat niet (token geweigerd), dan Esri
  const [satMapboxFailed, setSatMapboxFailed] = useState(false);
  // Kaarttegels: telt geladen en mislukte tegels; na herhaald mislukken de wereldkaart en een melding
  const [pdokFailed, setPdokFailed] = useState(false);
  const [tileProblem, setTileProblem] = useState<string | null>(null);
  const tileStats = React.useRef({ loaded: 0, failed: 0, reported: false });
  const useWorldMap = pdokFailed || !inNetherlands(position);
  const tileEvents = React.useMemo(() => ({
    tileload: () => { tileStats.current.loaded++; tileStats.current.failed = 0; setTileProblem(null); },
    tileerror: () => {
      const stats = tileStats.current;
      stats.failed++;
      if (stats.failed < 6) return;
      if (!useWorldMap) { setPdokFailed(true); stats.failed = 0; diag('warn', 'Navigatie', 'PDOK-kaart laadt niet, over op de wereldkaart'); return; }
      setTileProblem(mapProblem());
      if (!stats.reported) { stats.reported = true; diag('error', 'Navigatie', `Kaart laadt niet: ${mapProblem()} (online=${navigator.onLine}, klok=${new Date().toISOString()})`); }
    },
  }), [useWorldMap]);
  const satStats = React.useRef({ failed: 0 });
  const satEvents = React.useMemo(() => ({
    tileload: () => { satStats.current.failed = 0; setTileProblem(null); },
    tileerror: () => {
      if (++satStats.current.failed < 6) return;
      satStats.current.failed = 0;
      if (mapboxToken.startsWith('pk.') && !satMapboxFailed && navigator.onLine) { setSatMapboxFailed(true); diag('warn', 'Navigatie', 'Mapbox-satelliet laadt niet, over op Esri'); return; }
      setTileProblem(mapProblem());
    },
  }), [mapboxToken, satMapboxFailed]);

  // 1. Live GPS Tracking met Heading (Richting)
  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setPosition([pos.coords.latitude, pos.coords.longitude]);
          if (pos.coords.heading !== null) {
            setHeading(pos.coords.heading);
          }
        },
        (err) => { console.error(err); diag('warn', 'Navigatie', `GPS-positie: ${err.message}`); },
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // 2. Adres Zoeken API (PDOK Location API). Alleen zoeken als het Navi-zoekveld actief is,
  // want keyboardValue wordt ook door andere zoekvelden (Settings) gebruikt.
  useEffect(() => {
    // Een soort plek ("tanken", "eten", "parkeren"): plekken in de buurt in plaats van adressen
    const query = isSearching && !isNavigating ? categoryForSearch(keyboardValue) : null;
    if (query) {
      setSearchResults([]);
      setCategory({ query, status: 'loading', places: [] });
      let cancelled = false;
      const timer = setTimeout(async () => {
        const list = await searchNearby(query, positionRef.current, mapboxToken, useUIStore.getState().navigationSettings.fuelType ?? 'euro95');
        if (cancelled) return;
        setCategory({ query, places: list ?? [], status: list ? 'done' : navigator.onLine ? 'error' : 'offline' });
      }, 400);
      return () => { cancelled = true; clearTimeout(timer); };
    }
    setCategory(null);
    if (!isSearching || keyboardValue.length < 3 || isNavigating) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(PDOK_SEARCH + encodeURIComponent(keyboardValue));
        const data = await response.json();
        setSearchResults((data.features || []).map((f: any) => ({
          display_name: f.properties.display_name,
          lon: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1]
        })));
      } catch (e) { console.error(e); }
    }, 400);
    return () => clearTimeout(timer);
  }, [keyboardValue, isNavigating, isSearching, mapboxToken]);

  // 3. Route berekenen
  const calculateRoute = async (destLat: number, destLon: number) => {
    try {
      // Vermijd-opties uit Settings > Navigation; weigert de server ze, dan zonder opnieuw proberen
      const { avoidMotorways, avoidTolls, avoidFerries } = useUIStore.getState().navigationSettings;
      const exclude = [avoidMotorways && 'motorway', avoidTolls && 'toll', avoidFerries && 'ferry'].filter(Boolean).join(',');
      const baseUrl = `https://router.project-osrm.org/route/v1/driving/${position[1]},${position[0]};${destLon},${destLat}?overview=full&geometries=geojson&steps=true&alternatives=3`;
      let data = await (await fetch(exclude ? `${baseUrl}&exclude=${exclude}` : baseUrl)).json();
      if (exclude && data.code !== 'Ok') data = await (await fetch(baseUrl)).json();
      if (data.routes && data.routes[0]) {
        const all = data.routes.map((route: any) => ({
          distance: route.distance,
          duration: route.duration,
          geometry: route.geometry.coordinates.map((c: any) => [c[1], c[0]]),
          steps: route.legs[0].steps,
        }));
        setRoutes(all);
        setRouteData(all[0]);
        setIsRoutePreview(true);
      }
    } catch (e) { console.error(e); }
  };

  const getNavIcon = (step: any, size = 48) => {
    if (!step) return <MoveUp size={size} />;
    const modifier = step.maneuver.modifier;
    const type = step.maneuver.type;
    if (type.includes('roundabout')) return <RotateCw size={size} />;
    if (modifier?.includes('left')) return <CornerUpLeft size={size} />;
    if (modifier?.includes('right')) return <CornerUpRight size={size} />;
    return <MoveUp size={size} />;
  };

  const handleSelectAddress = (address: any) => {
    if (settingPlace) {
      useUIStore.getState().updateNavigationSetting(settingPlace, { name: address.display_name, lat: address.lat, lon: address.lon });
      setSettingPlace(null);
      setKeyboardValue('');
      setSearchResults([]);
      setIsSearching(false);
      closeKeyboard();
      return;
    }
    setPlaceCard(null);
    if (isNavigating) setNavigating(false);
    setSelectedDestination({ lat: address.lat, lon: address.lon, name: address.display_name });
    setKeyboardValue(address.display_name.split(',')[0]);
    setSearchResults([]);
    setIsSearching(false);
    closeKeyboard();
    calculateRoute(address.lat, address.lon);
  };

  // Route naar Thuis/Werk (knoppen hieronder, of het kaartje Navigeren op het startscherm)
  const goToPlace = (place: 'home' | 'work') => {
    const saved = useUIStore.getState().navigationSettings[place];
    if (!saved) { setPlaceModal(place); return; }
    handleSelectAddress({ display_name: saved.name, lat: saved.lat, lon: saved.lon });
  };
  useEffect(() => {
    const onPlace = (e: Event) => goToPlace((e as CustomEvent<'home' | 'work'>).detail);
    window.addEventListener('pandaos-nav-place', onPlace);
    return () => window.removeEventListener('pandaos-nav-place', onPlace);
  });

  // Plek (zoekresultaat of kaartje) als bestemming: de gewone routeflow
  const navigateToPlace = (p: Place) =>
    handleSelectAddress({ display_name: [p.name || t(p.label), placeAddress(p)].filter(Boolean).join(', '), lat: p.lat, lon: p.lon });
  const openPlaceCard = (p: Place) => {
    setPlaceCard(p);
    setIsSearching(false);
    closeKeyboard();
  };

  // Knoppen rechts op de kaart
  const setNav = useUIStore.getState().updateNavigationSetting;
  const toggleTraffic = () => {
    if (!useMapbox) { showHint(t('Traffic needs the Mapbox map (Settings > Navigation).')); return; }
    if (satellite) { showHint(t('Traffic is not shown on the satellite view.')); return; }
    setNav('mapTraffic', !traffic);
  };
  const togglePlaces = () => {
    if (placesShown) { setNav('placesHidden', true); return; }
    if (placesList.length === 0) setNav('places', ['fuel', 'food', 'parking']);
    setNav('placesHidden', false);
  };
  const toggleFuel = () => {
    if (fuelShown) { setNav('places', placesList.filter((k) => k !== 'fuel')); return; }
    if (!placesList.includes('fuel')) setNav('places', [...placesList, 'fuel']);
    setNav('placesHidden', false);
  };

  const clearSearch = () => {
    setPlaceCard(null);
    setRoutes([]);
    setDepartAt(null);
    setMoreOpen(false);
    setIsRoutePreview(false);
    setNavigating(false);
    setKeyboardValue('');
    setRouteData(null);
    setSelectedDestination(null);
    setSearchResults([]);
  };

  const destinationName = selectedDestination?.name.split(',')[0] || '';
  const nextStep = routeData?.steps?.[1];
  const upcomingSteps = routeData?.steps?.slice(2, 4) || [];

  return (
    // Klikken op de kaart en de kaarten erop mag Navi niet sluiten (SplashScreen sluit apps bij een klik op de kaart)
    <div className={`tsl-map-container ${isDarkMode ? 'dark-mode' : ''} ${is3D ? 'is-3d-active' : ''} ${useMapbox ? 'is-mapbox' : ''} ${satellite ? 'is-satellite' : ''}`}
      onClick={(e) => e.stopPropagation()}>
      <div className="map-layer">
        <MapContainer ref={mapRef} center={position} zoom={15} zoomControl={false} style={{ width: '100%', height: '100%' }}>
          {satellite
            ? (mapboxToken.startsWith('pk.') && !satMapboxFailed && !mapboxFailed
              ? <TileLayer key="sat-mapbox" url={mapboxSatelliteTiles(mapboxToken)} attribution={MAPBOX_ATTRIBUTION}
                  tileSize={512} zoomOffset={-1} maxZoom={20} maxNativeZoom={20} eventHandlers={satEvents} />
              : <TileLayer key="sat-esri" url={ESRI_SATELLITE_TILES} attribution={ESRI_ATTRIBUTION} maxZoom={20} maxNativeZoom={18} eventHandlers={satEvents} />)
            : useMapbox
            ? <TileLayer key={`mapbox-${isDarkMode}-${traffic}`} url={traffic ? mapboxTiles(mapboxToken, isDarkMode) : mapboxPlainTiles(mapboxToken, isDarkMode)}
                attribution={MAPBOX_ATTRIBUTION} tileSize={512} zoomOffset={-1} maxZoom={20} maxNativeZoom={20} />
            : useWorldMap
            ? <TileLayer key="world" url={WORLD_TILES} attribution={WORLD_ATTRIBUTION} maxZoom={19} maxNativeZoom={19} eventHandlers={tileEvents} />
            : <TileLayer key="pdok" url={PDOK_TILES} attribution={PDOK_ATTRIBUTION} maxZoom={19} maxNativeZoom={19} eventHandlers={tileEvents} />}

          {/* De Auto Marker */}
          <Marker position={position} icon={createCarIcon(heading)} />

          {selectedDestination && <Marker position={[selectedDestination.lat, selectedDestination.lon]} />}
          {useUIStore.getState().safetySettings.speedCameraWarning !== false && speedCameras.map((c) => (
            <CircleMarker key={c.id} center={[c.lat, c.lon]} radius={6}
              pathOptions={{ color: '#ffffff', weight: 2, fillColor: c.kind === 'section' ? '#f5a623' : '#ed4e3b', fillOpacity: 1 }} />
          ))}
          {!isNavigating && routes.filter((r) => r !== routeData).map((r, i) => (
            <Polyline key={`alt-${i}`} positions={r.geometry} color={isDarkMode ? '#8a8f98' : '#9aa0a8'} weight={7} opacity={0.75}
              eventHandlers={{ click: () => setRouteData(r) }} />
          ))}
          {routeData && <Polyline positions={routeData.geometry} color="#3e6ae1" weight={8} opacity={0.9} />}
          {!isNavigating && routes.map((r, i) => (
            <Marker key={`label-${i}`} position={r.geometry[Math.floor(r.geometry.length / 2)]}
              icon={L.divIcon({ className: '', iconSize: [0, 0],
                html: `<div class="route-time-label ${r === routeData ? 'is-active' : ''}">${formatDuration(r.duration)}</div>` })}
              eventHandlers={{ click: () => setRouteData(r) }} />
          ))}

          <MapPlaces hidden={!!navigationSettings.placesHidden} onSelect={setPlaceCard} />
          {/* Resultaten van zoeken op soort ook op de kaart */}
          {isSearching && category?.places.map((p) => (
            <Marker key={`cat-${p.id}`} position={[p.lat, p.lon]} icon={iconFor(p.kind)} eventHandlers={{ click: () => openPlaceCard(p) }} />
          ))}
          {placeCard && <Marker key="place-card" position={[placeCard.lat, placeCard.lon]} />}
          <MapController position={position} isNavigating={isNavigating} is3D={is3D} recenterKey={recenterKey}
            following={following} onUserMove={() => setFollowing(false)} onMapTap={() => setZoomButtons(true)}
            fitPoints={isRoutePreview && routes.length > 0 ? [position, ...routes.flatMap((r) => r.geometry.filter((_: any, i: number) => i % 10 === 0))] : null} />
        </MapContainer>
      </div>

      {tileProblem && <div className="tsl-map-problem">{t(tileProblem)}</div>}
      {placeModal && <PlacePickerModal place={placeModal} onClose={() => setPlaceModal(null)} />}

      {/* Linkerkolom (Figma: 16 px van links, 64 px van boven, onder de statusbalk) */}
      <div className="nav-left-column">
        {/* Navigatieveld (Figma 410 × 80, hier 320 × 56) — tijdens het rijden vervangen door de afslag */}
        {!isNavigating && (
          <div className="tsl-nav-search">
            <Search size={22} strokeWidth={2} />
            <input
              type="text"
              placeholder={t('Navigate')}
              value={isSearching || selectedDestination ? keyboardValue : ''}
              onChange={(e) => setKeyboardValue(e.target.value)}
              onFocus={() => { setIsSearching(true); openKeyboard(selectedDestination ? '' : keyboardValue); }}
            />
            {(keyboardValue && (isSearching || selectedDestination)) && (
              <button className="clear-btn" onClick={clearSearch} aria-label={t('Clear')}><X size={20} /></button>
            )}
          </div>
        )}

        {/* Zoeken op soort: plekken in de buurt (tik = route, (i) = kaartje) */}
        {!isNavigating && category && (
          <div className="tsl-nav-results">
            {category.status === 'loading' && <div className="result-empty">{t('Searching nearby…')}</div>}
            {category.status === 'offline' && <div className="result-empty">{t('No internet connection')}</div>}
            {category.status === 'error' && <div className="result-empty">{t('Places could not be loaded. Try again later.')}</div>}
            {category.status === 'done' && category.places.length === 0 && <div className="result-empty">{t('Nothing found nearby')}</div>}
            {category.places.map((p) => (
              <div key={p.id} className="result-row is-place">
                <button className="result-main" onClick={() => navigateToPlace(p)}>
                  <span className="map-place" style={{ background: PLACE_KINDS.find((k) => k.id === p.kind)?.color }}
                    dangerouslySetInnerHTML={{ __html: PLACE_ICONS[p.kind] }} />
                  <div className="result-text">
                    <span className="result-title">{p.name || t(p.label)}</span>
                    <span className="result-sub">{[formatDistance(p.distance ?? 0), placeAddress(p)].filter(Boolean).join(' · ')}</span>
                  </div>
                </button>
                <button className="result-info" aria-label={t('Details')} onClick={() => openPlaceCard(p)}><Info size={20} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Zoekresultaten */}
        {!isNavigating && searchResults.length > 0 && (
          <div className="tsl-nav-results">
            {searchResults.map((r, i) => (
              <button key={i} className="result-row" onClick={() => handleSelectAddress(r)}>
                <MapPin size={18} />
                <div className="result-text">
                  <span className="result-title">{r.display_name.split(',')[0]}</span>
                  <span className="result-sub">{r.display_name.split(',').slice(1).join(',').trim()}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Afslag - primair (Figma 464 × 139, hier 360 × 100) */}
        {isNavigating && routeData?.steps && (
          <div className="tsl-direction-primary">
            <div className="direction-icon">{getNavIcon(nextStep, 40)}</div>
            <div className="direction-info">
              <span className="distance">{formatDistance(routeData.steps[0].distance)}</span>
              <span className="street-name">{nextStep?.name || t('Continue on the road')}</span>
            </div>
          </div>
        )}

        {/* Afslagen daarna - secundair */}
        {isNavigating && upcomingSteps.length > 0 && (
          <div className="tsl-direction-secondary">
            {upcomingSteps.map((step: any, i: number) => (
              <div key={i} className="secondary-row">
                {getNavIcon(step, 22)}
                <span className="street-name">{step.name || t('Continue on the road')}</span>
                <span className="distance">{formatDistance(step.distance)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bestemmingskaart (Figma "Destination Summary", hier 360 breed): routevoorbeeld en tijdens het rijden */}
      {/* Kaartje van een plek: naam, soort, adres, afstand, openingstijden; Navigeren of sluiten */}
      {placeCard && (
        <PlaceCard place={placeCard} distance={formatDistance(distanceMeters(position, [placeCard.lat, placeCard.lon]))}
          onNavigate={() => navigateToPlace(placeCard)} onClose={() => setPlaceCard(null)} />
      )}

      {routeData && (isRoutePreview || isNavigating) && !placeCard && (
        <div className="tsl-destination-summary">
          <div className="summary-top">
            <div className="summary-main">
              <span className="arrival">{formatArrival(routeData.duration, departAt)}</span>
              <span className="destination">{destinationName}</span>
            </div>
            <div className="summary-stats">
              <span>{formatDuration(routeData.duration)} · {formatDistance(routeData.distance)}</span>
              {departAt && <span>{t('Departure')} {new Date(departAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>}
              <span className="battery">90% <Battery size={16} /></span>
            </div>
          </div>
          <div className="summary-actions">
            {isNavigating ? (
              <button onClick={clearSearch}>{t('End Trip')}</button>
            ) : (
              <button className="primary" onClick={() => { setNavigating(true); setIsRoutePreview(false); }}>{t('Start')}</button>
            )}
            <span className="divider" />
            <button className="more" aria-label={t('More')} onClick={() => setMoreOpen(!moreOpen)}><MoreHorizontal size={20} /></button>
          </div>
          {moreOpen && (
            <div className="summary-more-menu">
              <button onClick={() => { setDepartPicker(true); setMoreOpen(false); }}>{t('Depart later')}</button>
              {departAt && <button onClick={() => { setDepartAt(null); setMoreOpen(false); }}>{t('Depart now')}</button>}
            </div>
          )}
        </div>
      )}

      {/* Later vertrekken: vertrektijd kiezen (aankomst rekent mee) */}
      {departPicker && (
        <div className="tsl-modal-backdrop" onClick={() => setDepartPicker(false)}>
          <div className={`tsl-modal tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <span className="tsl-modal-title">{t('Depart later')}</span>
            <div className="tsl-segmented is-wide" style={{ flexWrap: 'wrap', height: 'auto' }}>
              {[15, 30, 60, 120].map((min) => (
                <button key={min} style={{ flex: '1 0 22%', minHeight: 42 }}
                  onClick={() => { setDepartAt(Date.now() + min * 60_000); setDepartPicker(false); }}>
                  {min < 60 ? `+${min} min` : `+${min / 60} u`}
                </button>
              ))}
            </div>
            {routeData && <small className="tsl-hint">{t('Arrival is calculated from the departure time. Traffic is not included.')}</small>}
          </div>
        </div>
      )}

      {hint && <div className="tsl-map-problem is-hint">{hint}</div>}

      {/* Knoppenkolom rechts (Tesla): 2D/3D, satelliet, verkeer, plekken, tankstations, centreren. 48 x 48 per knop. */}
      <div className="map-controls-right">
        {/* 2D / 3D: kantelt de kaart alsof je rijdt */}
        <button className={`map-btn ${is3D ? 'is-active' : ''}`} onClick={() => setIs3D(!is3D)} aria-label="3D/2D">
          <span className="map-btn-text">{is3D ? '3D' : '2D'}</span>
        </button>
        <button className={`map-btn ${satellite ? 'is-active' : ''}`} aria-label={t('Satellite')} aria-pressed={satellite}
          onClick={() => setNav('mapSatellite', !satellite)}><Satellite size={22} /></button>
        <button className={`map-btn ${trafficAvailable && traffic ? 'is-active' : ''} ${trafficAvailable ? '' : 'is-disabled'}`}
          aria-label={t('Traffic')} aria-pressed={trafficAvailable && traffic} onClick={toggleTraffic}><TrafficCone size={22} /></button>
        <button className={`map-btn ${placesShown ? 'is-active' : ''}`} aria-label={t('Places')} aria-pressed={placesShown}
          onClick={togglePlaces}><MapPinned size={22} /></button>
        <button className={`map-btn ${fuelShown ? 'is-active' : ''}`} aria-label={t('Petrol stations')} aria-pressed={fuelShown}
          onClick={toggleFuel}><Fuel size={22} /></button>
        {/* Weggeschoven van je locatie: centreren */}
        {!following && (
          <button className="map-btn" aria-label={t('Recenter')} onClick={() => { setFollowing(true); setRecenterKey((k) => k + 1); }}>
            <Navigation2 size={22} />
          </button>
        )}
      </div>

      {/* Na een tik op de kaart: inzoomen, uitzoomen en Gereed */}
      {zoomButtons && (
        <div className="map-zoom-controls">
          <button className="map-btn" aria-label={t('Zoom in')} onClick={() => mapRef.current?.zoomIn()}><Plus size={22} /></button>
          <button className="map-btn" aria-label={t('Zoom out')} onClick={() => mapRef.current?.zoomOut()}><Minus size={22} /></button>
          <button className="map-zoom-done" onClick={() => setZoomButtons(false)}>{t('Done')}</button>
        </div>
      )}
    </div>
  );
};

export default Map;
