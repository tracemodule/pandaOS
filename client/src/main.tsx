import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { initAndroidBridge } from './services/androidBridge';
import { startDiagnostics } from './services/diagnostics';

// Diagnose-logboek (Settings > Software > Diagnose): eerst, zodat ook fouten bij het opstarten erin komen
startDiagnostics();

// Aanspreekpunt voor de Android-launcher (window.PandaOS); op laptop/Pi gebeurt er verder niets mee
initAndroidBridge();

// De verbinding met de PandaOS-server (ws://localhost:8080) maakt en bewaakt de store zelf
// (uiStore.initSocketListeners), inclusief automatisch opnieuw verbinden als de server even wegvalt.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
