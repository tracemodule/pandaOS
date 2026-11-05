// PandaOS boven andere apps (index.html#overlay, Android: PandaOverlay.kt).
// Het venster van de launcher groeit alleen mee als hier iets te zien is:
//  - 'panel': het PandaOS-menu (zelfde menu als in PandaOS, geopend met een veeg omlaag bovenaan);
//  - 'volume': de volumecontainer, zodra het volume verandert terwijl je in een andere app zit;
//  - 'idle': niets (alleen de veegstrook van Android).
import React, { useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { getEffectiveTheme } from '../../settings';
import PandaPanel from '../panel/PandaPanel';
import VolumeBar from '../settings/control-bar/VolumeBar';
import './_overlay.scss';

const bridge = () => (window as any).PandaAndroid;
const AUTO_CLOSE_MS = 3000;
type Mode = 'idle' | 'volume' | 'panel';

const OverlayApp: React.FC = () => {
  const { volume, isVolumeOpen, screenMode, vehicleLightsOn } = useUIStore();
  const [mode, setMode] = useState<Mode>('idle');
  const modeRef = useRef<Mode>('idle');
  const closeTimer = useRef<number | null>(null);
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';

  // Doorzichtige pagina: alleen het menu of de container is te zien
  useEffect(() => {
    document.documentElement.classList.add('pandaos-overlay');
    const onMode = (e: Event) => {
      const next = (e as CustomEvent<Mode>).detail;
      modeRef.current = next;
      setMode(next);
      if (next !== 'volume') useUIStore.setState({ isVolumeOpen: false });
    };
    window.addEventListener('pandaos-overlay-mode', onMode);
    return () => window.removeEventListener('pandaos-overlay-mode', onMode);
  }, []);

  // Volume veranderd (knop van de radio): container tonen, 3 s na de laatste wijziging weer weg
  useEffect(() => {
    if (!isVolumeOpen || modeRef.current === 'panel') return;
    if (modeRef.current !== 'volume') bridge()?.overlaySetMode('volume');
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => { if (modeRef.current === 'volume') bridge()?.overlaySetMode('idle'); }, AUTO_CLOSE_MS);
  }, [isVolumeOpen, volume]);

  return (
    <>
      {mode === 'volume' && (
        <div className="overlay-volume">
          {/* Zelfde liggende balk als boven de dock; het instellingen-icoon opent PandaOS bij de geluidsinstellingen */}
          <VolumeBar isDarkMode={isDarkMode} onSettings={() => bridge()?.openPandaOS('Volume')}
            onInteract={() => useUIStore.setState({ isVolumeOpen: true })} />
        </div>
      )}
      {mode === 'panel' && <PandaPanel overlay onClose={() => bridge()?.overlaySetMode('idle')} />}
    </>
  );
};

export default OverlayApp;
