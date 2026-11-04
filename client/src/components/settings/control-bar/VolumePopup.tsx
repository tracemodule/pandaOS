import React, { useCallback, useEffect, useRef } from 'react';
import { useUIStore } from '../../../store/uiStore';
import { getEffectiveTheme } from '../../../settings';

interface VolumePopupProps {
  // Element waarbinnen klikken de popup NIET sluiten (het volume-stepper blok met de speaker en pijltjes)
  anchorRef: React.RefObject<HTMLElement | null>;
}

const AUTO_CLOSE_MS = 3000;
const WHEEL_STEP = 2;

// Verticale volume-popup in Tesla-stijl, direct boven het speaker-icoon in de ControlBar.
// 'volume' in de store blijft de enige bron van waarheid.
const VolumePopup: React.FC<VolumePopupProps> = ({ anchorRef }) => {
  const { volume, setVolume, isVolumeOpen, toggleVolume, screenMode, vehicleLightsOn } = useUIStore();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';

  const popupRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
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

  // Bovenkant track = 100, onderkant = 0
  const setFromClientY = (clientY: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = 1 - (clientY - rect.top) / rect.height;
    setVolume(Math.round(Math.max(0, Math.min(1, ratio)) * 100));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromClientY(e.clientY);
    restartAutoClose();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setFromClientY(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    restartAutoClose();
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const current = useUIStore.getState().volume;
    setVolume(current + (e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP));
    restartAutoClose();
  };

  if (!isVolumeOpen) return null;

  return (
    <div
      ref={popupRef}
      className={`tsl-volume-popup ${isDarkMode ? 'is-dark' : 'is-light'}`}
      onClick={(e) => e.stopPropagation()}
      onWheel={handleWheel}
    >
      <div className="volume-popup-value">{volume}</div>
      <div
        ref={trackRef}
        className="volume-popup-track"
        role="slider"
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={volume}
        aria-orientation="vertical"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="volume-popup-fill" style={{ height: `${volume}%` }} />
      </div>
    </div>
  );
};

export default VolumePopup;
