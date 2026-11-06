import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { initAndroidBridge, initOverlayBridge } from './services/androidBridge';
import { initAudioFx } from './services/audioFx';
import { initObd } from './services/obd';
import { applyCanSignal, CAN_FUNCTIONS } from './services/canSignals';
import OverlayApp from './components/overlay/OverlayApp';
import { startDiagnostics } from './services/diagnostics';

// Diagnose-logboek (Settings > Software > Diagnose): eerst, zodat ook fouten bij het opstarten erin komen
startDiagnostics();

// Aanspreekpunt voor de Android-launcher (window.PandaOS); op laptop/Pi gebeurt er verder niets mee
// Voor DevTools op de laptop (chrome://inspect): de toestand van PandaOS bekijken en aanpassen
import { useUIStore } from './store/uiStore';
(window as any).pandaStore = useUIStore;
// Laptop (tools/pandaos.mjs can/sim): CAN-signalen langs dezelfde weg als het CAN-kastje
(window as any).pandaCan = { applyCanSignal, functions: CAN_FUNCTIONS };

// index.html#overlay = het menu en de volumecontainer boven andere apps (PandaOverlay.kt)
const isOverlay = window.location.hash === '#overlay';
if (isOverlay) initOverlayBridge(); else { initAndroidBridge(); initAudioFx(); initObd(); }

// De verbinding met de PandaOS-server (ws://localhost:8080) maakt en bewaakt de store zelf
// (uiStore.initSocketListeners), inclusief automatisch opnieuw verbinden als de server even wegvalt.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isOverlay ? <OverlayApp /> : <App />}
  </StrictMode>,
);
