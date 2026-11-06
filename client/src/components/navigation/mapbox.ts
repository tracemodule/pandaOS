// Mapbox voor de PandaOS-kaart (Instellingen > Navigatie > Kaart: Mapbox) en de plekken op de kaart.
// Standaard de PandaOS-token; een eigen token kan in de instellingen. De standaardtoken staat NIET in de code (GitHub
// weigert tokens in de repo): hij komt bij het bouwen uit client/.env.local (VITE_MAPBOX_TOKEN=pk...), dat niet in git
// staat. Zonder dat bestand is er geen standaardtoken en gebruikt PandaOS de eigen kaart tot je er zelf een invult.
// De kaart komt als gewone tegels (afbeeldingen): geen tweede WebGL-tekening naast de 3D-auto.
export const DEFAULT_MAPBOX_TOKEN: string = (import.meta as any).env?.VITE_MAPBOX_TOKEN ?? '';

// Navigatie-stijl van Mapbox: overdag licht, 's nachts donker
export const mapboxTiles = (token: string, dark: boolean) =>
  `https://api.mapbox.com/styles/v1/mapbox/${dark ? 'navigation-night-v1' : 'navigation-day-v1'}/tiles/512/{z}/{x}/{y}?access_token=${token}`;

// Zonder verkeer (knop Verkeer uit): gewone straatkaart, 's nachts donker
export const mapboxPlainTiles = (token: string, dark: boolean) =>
  `https://api.mapbox.com/styles/v1/mapbox/${dark ? 'dark-v11' : 'streets-v12'}/tiles/512/{z}/{x}/{y}?access_token=${token}`;

// Satelliet (knop Satelliet): met token Mapbox (512-tegels, zoomOffset -1), anders Esri World Imagery (256-tegels)
export const mapboxSatelliteTiles = (token: string) =>
  `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}?access_token=${token}`;
export const ESRI_SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const ESRI_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

export const MAPBOX_ATTRIBUTION ='© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
