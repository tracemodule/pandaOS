// Alvast inladen tijdens het opstartscherm (VW-logo): de app-pictogrammen (PandaOS en Android) en het 3D-model.
// Het opstartscherm (BootScreen) verdwijnt pas als dit klaar is, zodat het app-menu en de auto meteen klaar staan
// in plaats van daarna nog te laden.
import { create } from 'zustand';
import { useGLTF } from '@react-three/drei';
import { getInstalledAppList, getAndroidAppIcon, isAlwaysHidden } from '../store/appLinks';
import { VEHICLE_MODELS } from '../components/screen/splash-screen/configuration/vehicleModels';

interface BootStatus {
  iconsReady: boolean;
  carReady: boolean; // de auto is geladen, voorbereid en één keer getekend (SidebarPane)
}

export const useBootStatus = create<BootStatus>(() => ({ iconsReady: false, carReady: false }));

// Alle pictogrammen in public/app-icons die PandaOS gebruikt (app-menu, dock, Settings > Apps)
const PANDAOS_ICONS = [
  'audio', 'android-settings', 'bluetooth', 'calendar', 'camera', 'caraoke', 'carplay', 'dashcam', 'energy',
  'maps', 'messages', 'music', 'netflix', 'phone', 'settings', 'spotify', 'toybox', 'tunein', 'youtube', 'zoom',
].map((name) => `/app-icons/${name}.svg`);

// Afbeelding laden én decoderen, zodat hij later meteen getekend kan worden
const decodeImage = (src: string) => new Promise<void>((resolve) => {
  if (!src) return resolve();
  const img = new Image();
  img.onload = () => {
    (img.decode ? img.decode().catch(() => undefined) : Promise.resolve()).then(() => resolve());
  };
  img.onerror = () => resolve(); // een kapot pictogram mag het opstarten niet tegenhouden
  img.src = src;
});

let started = false;
export const startPreload = () => {
  if (started) return;
  started = true;

  // 3D-model: downloaden en parsen begint nu al, nog voordat het canvas het vraagt
  VEHICLE_MODELS.forEach((model) => useGLTF.preload(model.url));

  // Android-pictogrammen: de launcher maakt ze één keer aan (daarna uit de cache van appLinks)
  const androidIcons = getInstalledAppList()
    .filter((app) => !isAlwaysHidden(app.package))
    .map((app) => getAndroidAppIcon(app.package));

  Promise.all([...PANDAOS_ICONS, ...androidIcons].map(decodeImage))
    .then(() => useBootStatus.setState({ iconsReady: true }));
};

// Vanuit SidebarPane: de auto is klaar
export const markCarReady = () => {
  if (!useBootStatus.getState().carReady) useBootStatus.setState({ carReady: true });
};
