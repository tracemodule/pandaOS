// Mapbox voor de PandaOS-kaart (Instellingen > Navigatie > Kaart: Mapbox) en de plekken op de kaart.
// Standaard de PandaOS-token; een eigen token kan in de instellingen. De standaardtoken staat NIET in de code (GitHub
// weigert tokens in de repo): hij komt bij het bouwen uit client/.env.local (VITE_MAPBOX_TOKEN=pk...), dat niet in git
// staat. Zonder dat bestand is er geen standaardtoken en gebruikt PandaOS de eigen kaart tot je er zelf een invult.
// De kaart komt als gewone tegels (afbeeldingen): geen tweede WebGL-tekening naast de 3D-auto.
export const DEFAULT_MAPBOX_TOKEN: string = (import.meta as any).env?.VITE_MAPBOX_TOKEN ?? '';

// Navigatie-stijl van Mapbox: overdag licht, 's nachts donker
export const mapboxTiles = (token: string, dark: boolean) =>
  `https://api.mapbox.com/styles/v1/mapbox/${dark ? 'navigation-night-v1' : 'navigation-day-v1'}/tiles/512/{z}/{x}/{y}?access_token=${token}`;

export const MAPBOX_ATTRIBUTION = '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
