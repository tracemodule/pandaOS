import React, { useEffect, useState } from 'react';
import {
  Search, Compass, Globe, List, MapPin, Zap,
  CornerUpLeft, CornerUpRight, MoveUp, RotateCw,
  Battery, MoreHorizontal, X
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { useUIStore } from '../../store/uiStore';
import { getEffectiveTheme } from '../../settings';
import { useT } from '../../i18n';
import 'leaflet/dist/leaflet.css';
import './_map.scss';
import { diag } from '../../services/diagnostics';

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

const formatArrival = (seconds: number) =>
  new Date(Date.now() + seconds * 1000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

// --- Map Controller (TomTom Logica) ---
const MapController = ({ position, isNavigating, is3D, recenterKey }: any) => {
  const map = useMap();

  // Leaflet meet zijn maat één keer. Het kaartpaneel groeit/krimpt mee met de split-view (0% → 70%),
  // dus bij elke maatverandering opnieuw meten; anders blijven delen van de kaart grijs.
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  useEffect(() => {
    if (isNavigating) {
      map.setView(position, 18, { animate: true });
      // We gebruiken CSS classes op de map container voor het 3D effect
      const mapContainer = map.getContainer();
      if (is3D) {
        mapContainer.classList.add('tomtom-view');
      } else {
        mapContainer.classList.remove('tomtom-view');
      }
    } else {
      map.setView(position, 15, { animate: true });
      map.getContainer().classList.remove('tomtom-view');
    }
  }, [position, isNavigating, is3D, map, recenterKey]);

  return null;
};

const Map: React.FC = () => {
  const {
    openKeyboard, closeKeyboard, keyboardValue,
    setKeyboardValue, isNavigating, setNavigating, screenMode, vehicleLightsOn
  } = useUIStore();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';

  // States
  const [position, setPosition] = useState<[number, number]>([52.3676, 4.9041]);
  const t = useT();
  const [heading, setHeading] = useState(0);
  const [is3D, setIs3D] = useState(true);
  const [recenterKey, setRecenterKey] = useState(0);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<any>(null);
  const [routeData, setRouteData] = useState<any>(null);
  const [isRoutePreview, setIsRoutePreview] = useState(false);
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
  }, [keyboardValue, isNavigating, isSearching]);

  // 3. Route berekenen
  const calculateRoute = async (destLat: number, destLon: number) => {
    try {
      // Vermijd-opties uit Settings > Navigation; weigert de server ze, dan zonder opnieuw proberen
      const { avoidMotorways, avoidTolls, avoidFerries } = useUIStore.getState().navigationSettings;
      const exclude = [avoidMotorways && 'motorway', avoidTolls && 'toll', avoidFerries && 'ferry'].filter(Boolean).join(',');
      const baseUrl = `https://router.project-osrm.org/route/v1/driving/${position[1]},${position[0]};${destLon},${destLat}?overview=full&geometries=geojson&steps=true`;
      let data = await (await fetch(exclude ? `${baseUrl}&exclude=${exclude}` : baseUrl)).json();
      if (exclude && data.code !== 'Ok') data = await (await fetch(baseUrl)).json();
      if (data.routes && data.routes[0]) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates.map((c: any) => [c[1], c[0]]);
        setRouteData({
          distance: route.distance,
          duration: route.duration,
          geometry: coordinates,
          steps: route.legs[0].steps
        });
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
    setSelectedDestination({ lat: address.lat, lon: address.lon, name: address.display_name });
    setKeyboardValue(address.display_name.split(',')[0]);
    setSearchResults([]);
    setIsSearching(false);
    closeKeyboard();
    calculateRoute(address.lat, address.lon);
  };

  const clearSearch = () => {
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
    <div className={`tsl-map-container ${isDarkMode ? 'dark-mode' : ''} ${isNavigating && is3D ? 'is-3d-active' : ''}`}
      onClick={(e) => e.stopPropagation()}>
      <div className="map-layer">
        <MapContainer center={position} zoom={15} zoomControl={false} style={{ width: '100%', height: '100%' }}>
          {useWorldMap
            ? <TileLayer key="world" url={WORLD_TILES} attribution={WORLD_ATTRIBUTION} maxZoom={19} maxNativeZoom={19} eventHandlers={tileEvents} />
            : <TileLayer key="pdok" url={PDOK_TILES} attribution={PDOK_ATTRIBUTION} maxZoom={19} maxNativeZoom={19} eventHandlers={tileEvents} />}

          {/* De Auto Marker */}
          <Marker position={position} icon={createCarIcon(heading)} />

          {selectedDestination && <Marker position={[selectedDestination.lat, selectedDestination.lon]} />}
          {routeData && <Polyline positions={routeData.geometry} color="#3e6ae1" weight={8} opacity={0.8} />}

          <MapController position={position} isNavigating={isNavigating} is3D={is3D} recenterKey={recenterKey} />
        </MapContainer>
      </div>

      {tileProblem && <div className="tsl-map-problem">{t(tileProblem)}</div>}

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
      {routeData && (isRoutePreview || isNavigating) && (
        <div className="tsl-destination-summary">
          <div className="summary-top">
            <div className="summary-main">
              <span className="arrival">{formatArrival(routeData.duration)}</span>
              <span className="destination">{destinationName}</span>
            </div>
            <div className="summary-stats">
              <span>{Math.round(routeData.duration / 60)} min · {formatDistance(routeData.distance)}</span>
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
            <button className="more" aria-label={t('More')}><MoreHorizontal size={20} /></button>
          </div>
        </div>
      )}

      {/* Rechterknoppen (Figma: los kompas, daaronder vier knoppen in één kaart; 56 breed) */}
      <div className="map-controls-right">
        <button className="map-btn compass" onClick={() => setIs3D(!is3D)} aria-label="3D/2D">
          <Compass size={24} style={{ transform: is3D ? 'rotateX(45deg)' : 'none', transition: '0.3s' }} />
        </button>
        <div className="map-btn-group">
          <button className="map-btn" aria-label={t('Satellite')}><Globe size={22} /></button>
          <button className="map-btn" aria-label={t('Route list')}><List size={22} /></button>
          <button className="map-btn" onClick={() => setRecenterKey((k) => k + 1)} aria-label={t('Recenter')}><MapPin size={22} /></button>
          <button className="map-btn" aria-label={t('Charging stations')}><Zap size={22} /></button>
        </div>
      </div>
    </div>
  );
};

export default Map;
