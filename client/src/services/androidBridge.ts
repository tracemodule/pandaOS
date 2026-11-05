// Brug met de Android-launcher (android/ in de projectmap).
// Web -> Android: window.PandaAndroid (zie appLinks.ts, de Wi-Fi- en Apps-tab in SettingsApp en de mediabediening in uiStore).
// Android -> web: window.PandaOS, hier geregistreerd. De launcher roept dit aan met evaluateJavascript,
// bijvoorbeeld bij de VOL-knoppen van de radio, het achteruit-signaal of als er iets anders gaat spelen.
import { useUIStore, VOLUME_MAX, fromPercent } from '../store/uiStore';
import { getLinkedAndroidPackage, launchAndroidPackage } from '../store/appLinks';
import { diag } from './diagnostics';
import { applyCanSignal } from './canSignals';

// Wat er speelt in een Android-app (MediaWatcher.kt); positie en duur in seconden
export interface AndroidNowPlaying {
  title: string;
  artist: string;
  app: string; // pakketnaam, bijv. com.spotify.music
  isPlaying: boolean;
  position: number;
  duration: number;
}

export interface PandaOSWebBridge {
  stepVolume: (delta: number) => void;
  setReverseSignal: (active: boolean) => void;
  systemVolume: (percent: number) => void;
  radioVolume: (value: number) => void;
  radioVolumes: (volumes: Record<string, number>) => void;
  volumeKey: () => void;
  radioSetting: (setting: { table: string; key: string; value: string }) => void;
  voiceInput: (event: { state: string; text?: string; error?: string }) => void;
  canSignal: (signal: { func: string; action: 'on' | 'off' | 'value'; value: string }) => void;
  setNowPlaying: (media: AndroidNowPlaying | null) => void;
  setNowPlayingCover: (url: string | null) => void;
  // Autostatus van het CAN-kastje (lichtschakelaar, knipperlichten, deuren, versnellingsbak); zie CarState in uiStore
  setCarState: (partial: Parameters<ReturnType<typeof useUIStore.getState>['setCarState']>[0]) => void;
  // Een Bluetooth-apparaat verbindt of verdwijnt (RadioConnectivity.kt)
  bluetoothConnected: (device: BluetoothDevice) => void;
  bluetoothDisconnected: (device: BluetoothDevice) => void;
  // Nieuwe of verdwenen melding van een Android-app (PandaOS-paneel werkt zijn lijst bij)
  notificationsChanged: () => void;
  openPanel: () => void;
  openSettingsTab: (tab: string) => void;
  halfAppClosed: () => void;
  permissionsChanged: () => void;
  overlayMode: (mode: string) => void;
  updateStatus: (status: { state: string; progress: number; message: string }) => void;
}

interface BluetoothDevice { name: string; address: string; phone: boolean }

// CarPlay automatisch openen (Settings > Apps > CarPlay): alleen bij een telefoon en als er een CarPlay-app gekozen is
const autoOpenCarPlay = (device: BluetoothDevice) => {
  const { appLinks } = useUIStore.getState();
  if (!device.phone || !appLinks.carplay?.autoOpen) return;
  const carplayApp = getLinkedAndroidPackage(appLinks, 'carplay');
  if (carplayApp) launchAndroidPackage(carplayApp);
};

// Bij het opstarten kan de telefoon al verbonden zijn (dan komt er geen melding meer): één keer nakijken
const checkPhoneAtStartup = () => {
  try {
    const state = JSON.parse((window as any).PandaAndroid?.getBluetoothState?.() ?? '{}');
    const phone = (state.devices ?? []).find((d: BluetoothDevice & { connected: boolean }) => d.connected && d.phone);
    if (phone) autoOpenCarPlay(phone);
  } catch { /* geen Bluetooth-status */ }
};

const EMPTY_MEDIA = { currentTrack: '', currentArtist: '', albumArt: null, isPlaying: false, mediaPosition: 0, mediaDuration: 0 };

export const initAndroidBridge = () => {
  const bridge: PandaOSWebBridge = {
    // VOL+/VOL-: stap 1, popup 3 seconden zichtbaar (zelfde als de pijltjes in de control-bar)
    stepVolume: (delta) => useUIStore.getState().stepVolume(delta),
    // R van de radio: toont R en straks de achteruitrijcamera
    setReverseSignal: (active) => {
      diag('info', 'car', `Achteruit-signaal van de radio: ${active ? 'aan' : 'uit'}`);
      useUIStore.getState().setReverseSignal(active);
    },
    // Android-mediavolume veranderd (VOL-knoppen van de radio, andere app): alleen de weergave bijwerken, de popup
    // tonen en niet terugsturen (anders een lus)
    // Gekoppeld CAN-signaal herkend door de launcher (CAN-monitor > Koppelen, CanLinks.kt)
    canSignal: (signal) => applyCanSignal(signal),
    // Systeeminstelling over geluid veranderd (CarSignals.kt): staat al in het logboek van de launcher; om het
    // volume van de radio te vinden. Hier (nog) niets mee doen.
    radioSetting: () => undefined,
    // Spraakinvoer (VoiceInput.kt) -> webtoetsenbord (Keyboard.tsx)
    voiceInput: (event) => window.dispatchEvent(new CustomEvent('pandaos-voice', { detail: event })),
    systemVolume: (percent) => {
      if ((window as any).PandaAndroid?.getMasterVolume?.() >= 0) return; // meestervolume gaat voor
      const volume = fromPercent(percent);
      if (useUIStore.getState().volume !== volume) useUIStore.setState({ volume, isVolumeOpen: true });
    },
    // Meestervolume van de radio veranderd (knop op het paneel, stuurknoppen, PandaOS zelf): 0-40
    radioVolume: (value) => {
      const volume = Math.max(0, Math.min(VOLUME_MAX, value));
      if (useUIStore.getState().volume !== volume) useUIStore.setState({ volume, isVolumeOpen: true });
    },
    // Alle vier de volumes van de radio (CarSignals.kt): onthouden en de volumepagina bijwerken
    radioVolumes: (volumes) => {
      try {
        const saved = JSON.parse(localStorage.getItem('pandaos-radio-volumes') ?? '{}');
        localStorage.setItem('pandaos-radio-volumes', JSON.stringify({ ...saved, ...volumes }));
      } catch { /* opslag vol */ }
      window.dispatchEvent(new Event('pandaos-radio-volumes'));
    },
    // Volumeknop ingedrukt terwijl PandaOS vooraan staat: de radio regelt het volume, PandaOS toont de popup
    volumeKey: () => useUIStore.setState({ isVolumeOpen: true }),

    // Mediakaart en Music volgen de Android-app die speelt; null = niets meer (dan mogen Spotify/Bluetooth weer)
    setNowPlaying: (media) => {
      const state = useUIStore.getState();
      if (!media) {
        if (state.nowPlayingSource === 'android') useUIStore.setState({ nowPlayingSource: null, ...EMPTY_MEDIA });
        return;
      }
      useUIStore.setState({
        nowPlayingSource: 'android',
        currentTrack: media.title,
        currentArtist: media.artist,
        isPlaying: media.isPlaying,
        mediaPosition: media.position,
        mediaDuration: media.duration,
      });
    },
    // Hoes apart, alleen bij een nieuw nummer (data-URL of internetadres)
    setNowPlayingCover: (url) => useUIStore.setState({ albumArt: url }),
    setCarState: (partial) => useUIStore.getState().setCarState(partial),
    bluetoothConnected: (device) => {
      diag('info', 'bluetooth', `Verbonden: ${device.name}${device.phone ? ' (telefoon)' : ''}`);
      if (device.phone) useUIStore.getState().showNotification(device.name, 'info', 'BLUETOOTH CONNECTED');
      autoOpenCarPlay(device);
    },
    notificationsChanged: () => window.dispatchEvent(new Event('pandaos-notifications')),
    // Veeg van bovenaf: de launcher heeft de Android-balk weggehaald, open het PandaOS-paneel
    openPanel: () => window.dispatchEvent(new Event('pandaos-open-panel')),
    // Vanuit het menu boven een andere app (PandaOverlay): PandaOS staat weer vooraan, dit scherm openen
    openSettingsTab: (tab) => {
      const store = useUIStore.getState();
      if (tab === 'Audio') { if (!store.isAudioSettingsOpen) store.toggleAudioSettings(); }
      else if (tab === 'Volume') store.openVolumePage();
      else store.openSettingsTab(tab as any);
    },
    overlayMode: () => undefined,
    // De halve Android-app is weg (op PandaOS getikt): de auto weer over het hele scherm
    permissionsChanged: () => window.dispatchEvent(new Event('pandaos-permissions')),
    halfAppClosed: () => window.dispatchEvent(new CustomEvent('pandaos-half-app', { detail: null })),
    // Voortgang van een software-update (UpdateInstaller.kt) -> Settings > Software
    updateStatus: (status) => {
      if (status.state === 'error') diag('error', 'update', status.message);
      if (status.state === 'installing') diag('info', 'update', 'Installeren');
      window.dispatchEvent(new CustomEvent('pandaos-update-status', { detail: status }));
    },
    bluetoothDisconnected: (device) => {
      if (device.phone) useUIStore.getState().showNotification(device.name, 'info', 'BLUETOOTH DISCONNECTED');
    },
  };
  (window as any).PandaOS = bridge;
  // Volume en achteruit zoals ze nu op de radio staan
  const android = (window as any).PandaAndroid;
  // Opgeslagen volume uit een oudere versie (0-100) omrekenen naar 0-40
  if (useUIStore.getState().volume > VOLUME_MAX) useUIStore.setState({ volume: fromPercent(useUIStore.getState().volume) });
  const master = android?.getMasterVolume?.() ?? -1;
  if (master >= 0) useUIStore.setState({ volume: Math.min(VOLUME_MAX, master) });
  else if (android?.getSystemVolume) {
    const percent = android.getSystemVolume();
    if (percent >= 0) useUIStore.setState({ volume: fromPercent(percent) });
  }
  if (android?.isReverseActive?.()) useUIStore.getState().setReverseSignal(true);
  // Na het opstartscherm (VW-logo) kijken of er al een telefoon verbonden is
  if ((window as any).PandaAndroid) window.setTimeout(checkPhoneAtStartup, 4000);
};

// Overlay boven andere apps (index.html#overlay): alleen wat het menu en de volumecontainer nodig hebben.
// Geen opstartcontroles (telefoon, CarPlay openen ...): dat doet PandaOS zelf al.
export const initOverlayBridge = () => {
  const showVolume = (volume: number) => {
    const clamped = Math.max(0, Math.min(VOLUME_MAX, volume));
    useUIStore.setState({ volume: clamped, isVolumeOpen: true });
  };
  (window as any).PandaOS = {
    radioVolume: (value: number) => showVolume(value),
    systemVolume: (percent: number) => {
      if ((window as any).PandaAndroid?.getMasterVolume?.() >= 0) return;
      showVolume(fromPercent(percent));
    },
    volumeKey: () => useUIStore.setState({ isVolumeOpen: true }),
    notificationsChanged: () => window.dispatchEvent(new Event('pandaos-notifications')),
    overlayMode: (mode: string) => window.dispatchEvent(new CustomEvent('pandaos-overlay-mode', { detail: mode })),
  };
  const android = (window as any).PandaAndroid;
  const master = android?.getMasterVolume?.() ?? -1;
  if (master >= 0) useUIStore.setState({ volume: Math.min(VOLUME_MAX, master) });
  else if (android?.getSystemVolume) {
    const percent = android.getSystemVolume();
    if (percent >= 0) useUIStore.setState({ volume: fromPercent(percent) });
  }
};
