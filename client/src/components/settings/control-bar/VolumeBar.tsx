import React, { useRef } from 'react';
import { Settings2 } from 'lucide-react';
import { useUIStore, VOLUME_MAX } from '../../../store/uiStore';

// Liggende volumebalk (zoals in de video, 08:24): links een instellingen-icoon naar de volumepagina, daarnaast
// een schuif van 0 tot 40 (het meestervolume van de radio) met het getal rechts.
// Gebruikt boven de dock (VolumePopup) en boven andere apps (OverlayApp).
interface VolumeBarProps {
  onSettings: () => void;
  onInteract?: () => void; // elke wijziging (popup langer openhouden)
  isDarkMode: boolean;
}

const VolumeBar: React.FC<VolumeBarProps> = ({ onSettings, onInteract, isDarkMode }) => {
  const { volume, setVolume } = useUIStore();
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Links op de schuif = 0, rechts = VOLUME_MAX
  const setFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    setVolume(Math.round(Math.max(0, Math.min(1, ratio)) * VOLUME_MAX));
    onInteract?.();
  };

  return (
    <div className={`tsl-volume-bar ${isDarkMode ? 'is-dark' : 'is-light'}`} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="volume-bar-settings" aria-label="Sound settings" onClick={onSettings}>
        <Settings2 size={22} />
      </button>
      <div
        ref={trackRef}
        className="volume-bar-track"
        role="slider"
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={VOLUME_MAX}
        aria-valuenow={volume}
        onPointerDown={(e) => { draggingRef.current = true; e.currentTarget.setPointerCapture(e.pointerId); setFromClientX(e.clientX); }}
        onPointerMove={(e) => { if (draggingRef.current) setFromClientX(e.clientX); }}
        onPointerUp={(e) => { draggingRef.current = false; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={() => { draggingRef.current = false; }}
      >
        <div className="volume-bar-fill" style={{ width: `${(volume / VOLUME_MAX) * 100}%` }} />
      </div>
      <span className="volume-bar-value">{volume}</span>
    </div>
  );
};

export default VolumeBar;
