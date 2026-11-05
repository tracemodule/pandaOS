import React, { useCallback, useEffect, useRef } from 'react';
import { useUIStore } from '../../../store/uiStore';
import VolumeBar from './VolumeBar';
import { getEffectiveTheme } from '../../../settings';

interface VolumePopupProps {
  // Element waarbinnen klikken de popup NIET sluiten (het volume-stepper blok met de speaker en pijltjes)
  anchorRef: React.RefObject<HTMLElement | null>;
}

const AUTO_CLOSE_MS = 3000;
const WHEEL_STEP = 1;

// Volume-popup: liggende balk boven de dock (zoals in de video, 08:24), rechts boven de volumeknoppen.
// 'volume' in de store blijft de enige bron van waarheid.
const VolumePopup: React.FC<VolumePopupProps> = ({ anchorRef }) => {
  const { volume, setVolume, isVolumeOpen, toggleVolume, screenMode, vehicleLightsOn } = useUIStore();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';

  const popupRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);

  const closePopup = useCallback(() => {
    if (useUIStore.getState().isVolumeOpen) toggleVolume();
  }, [toggleVolume]);

  // Auto-close: timer opnieuw starten bij elke interactie (ook volumewijziging via de pijltjes)
  const restartAutoClose = useCallback(() => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      if (!draggingRef.current) closePopup();
      else restartAutoClose();
    }, AUTO_CLOSE_MS);
  }, [closePopup]);

  useEffect(() => {
    if (!isVolumeOpen) return;
    restartAutoClose();
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, [isVolumeOpen, volume, restartAutoClose]);

  // Klik buiten de popup (en buiten het speaker/pijltjes-blok) sluit hem
  useEffect(() => {
    if (!isVolumeOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popupRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      closePopup();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isVolumeOpen, anchorRef, closePopup]);

  if (!isVolumeOpen) return null;

  return (
    <div ref={popupRef} className="tsl-volume-popup" onClick={(e) => e.stopPropagation()}
      onWheel={(e) => { setVolume(useUIStore.getState().volume + (e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP)); restartAutoClose(); }}>
      <VolumeBar isDarkMode={isDarkMode} onInteract={restartAutoClose}
        onSettings={() => useUIStore.getState().openVolumePage()} />
    </div>
  );
};

export default VolumePopup;
