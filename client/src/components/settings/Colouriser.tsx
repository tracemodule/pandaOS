// Colouriser (Settings > Vehicle > Paint), zoals in de Tesla: kleurenring (tint), vlak (verzadiging/helderheid),
// lakafwerking Solid / Metallic / Matte en '+' om de kleur te bewaren als eigen kleurvakje.
// De 3D-auto kleurt direct mee; Sluiten houdt de kleur.
import React, { useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useT } from '../../i18n';

const MAX_CUSTOM = 6;

// --- Kleurrekenen: hex <-> HSV (h 0-360, s en v 0-1) ---
const hexToHsv = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
};
const hsvToHex = (h: number, s: number, v: number) => {
  const f = (k: number) => {
    const x = (k + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(x, 4 - x, 1))) * 255);
  };
  return '#' + [f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, '0')).join('');
};

// target 'rims': zelfde kiezer voor de velgkleur (zonder lakafwerking)
const Colouriser: React.FC<{ onClose: () => void; target?: 'paint' | 'rims' }> = ({ onClose, target = 'paint' }) => {
  const t = useT();
  const vehicle = useUIStore((s) => s.vehicleSettings);
  const update = useUIStore((s) => s.updateVehicleSetting);
  const colorKey = target === 'rims' ? 'rimColor' : 'paintColor';
  const customKey = target === 'rims' ? 'customRims' : 'customPaints';
  const [hsv, setHsv] = useState(() => hexToHsv(vehicle[colorKey]));
  const ring = useRef<HTMLDivElement>(null);
  const square = useRef<HTMLDivElement>(null);
  const custom = vehicle[customKey] ?? [];

  const apply = (next: { h: number; s: number; v: number }) => {
    setHsv(next);
    update(colorKey, hsvToHex(next.h, next.s, next.v));
  };

  // Slepen op de ring of in het vlak (aanraken en muis via pointer events)
  const drag = (handler: (e: React.PointerEvent) => void) => ({
    onPointerDown: (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); handler(e); },
    onPointerMove: (e: React.PointerEvent) => { if (e.buttons) handler(e); },
  });
  const onRing = (e: React.PointerEvent) => {
    const r = ring.current!.getBoundingClientRect();
    const angle = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    // conic-gradient begint bovenaan (rood) en loopt met de klok mee
    apply({ ...hsv, h: ((angle * 180) / Math.PI + 90 + 360) % 360 });
  };
  const onSquare = (e: React.PointerEvent) => {
    const r = square.current!.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    apply({ ...hsv, s, v });
  };

  const ringRadius = 75 - 13; // midden van de ring (150 px breed, 26 px dik)
  const hueRad = ((hsv.h - 90) * Math.PI) / 180;
  const current = hsvToHex(hsv.h, hsv.s, hsv.v);

  const saveCustom = () => {
    if (custom.some((c) => c.toLowerCase() === current.toLowerCase())) return;
    update(customKey, [current, ...custom].slice(0, MAX_CUSTOM));
  };

  return (
    <div className="tsl-modal-backdrop" onClick={onClose}>
      <div className="tsl-modal" onClick={(e) => e.stopPropagation()}>
        <button className="tsl-modal-close" aria-label={t('Close')} onClick={onClose}><X size={20} /></button>
        <span className="tsl-modal-title">{t('Colouriser')}</span>

        <div className="tsl-colouriser">
          <div ref={ring} className="tsl-hue-ring" {...drag(onRing)}>
            <span className="tsl-picker-dot" style={{ left: 75 + ringRadius * Math.cos(hueRad), top: 75 + ringRadius * Math.sin(hueRad),
              background: hsvToHex(hsv.h, 1, 1) }} />
          </div>
          <div ref={square} className="tsl-sv-square" {...drag(onSquare)}
            style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(hsv.h, 1, 1)})` }}>
            <span className="tsl-picker-dot" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }} />
          </div>
        </div>

        {target === 'paint' && (
        <div className="tsl-section">
          <span className="tsl-title">{t('Paint Type')}</span>
          <div className="tsl-segmented">
            {(['Solid', 'Metallic', 'Matte'] as const).map((finish) => (
              <button key={finish} className={(vehicle.paintFinish ?? 'Metallic') === finish ? 'is-active' : ''}
                onClick={() => update('paintFinish', finish)}>{t(finish)}</button>
            ))}
          </div>
        </div>
        )}

        {/* Eigen kleuren: '+' bewaart de huidige kleur, tik op een vakje om hem terug te zetten */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="tsl-btn is-small" aria-label={t('Save colour')} onClick={saveCustom}><Plus size={18} /></button>
          {custom.map((hex) => (
            <button key={hex} aria-label={hex} onClick={() => apply(hexToHsv(hex))}
              style={{ width: 32, height: 32, borderRadius: '50%', background: hex, cursor: 'pointer',
                border: current.toLowerCase() === hex.toLowerCase() ? '3px solid var(--tsl-blue)' : '2px solid var(--tsl-border)' }} />
          ))}
          <span className="tsl-hint" style={{ marginLeft: 'auto', fontFamily: 'monospace' }}>{current}</span>
        </div>
      </div>
    </div>
  );
};

export default Colouriser;
