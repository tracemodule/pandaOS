// Schuifregelaar in de stijl van de Figma Tesla UI Kit ("Brightness"): kader met rand, gevuld deel met de waarde,
// pictogrammen links en rechts. Slepen of tikken zet de waarde; werkt met muis en touch.
// Kleuren komen uit _tesla-ui.scss (moet binnen een .tsl-ui-container staan).
import React, { useRef } from 'react';

interface TeslaSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  centered?: boolean; // vulling vanaf het midden (bijv. balans of equalizer: -6 ... +6)
  disabled?: boolean;
}

const TeslaSlider: React.FC<TeslaSliderProps> = ({
  value, min, max, step = 1, onChange, format = (v) => String(v), iconLeft, iconRight, centered = false, disabled = false
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const valueFromPointer = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round((min + ratio * (max - min)) / step) * step;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    isDragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(valueFromPointer(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging.current) onChange(valueFromPointer(e.clientX));
  };
  const onPointerUp = () => { isDragging.current = false; };

  const ratio = (value - min) / (max - min);
  const zeroRatio = centered ? (0 - min) / (max - min) : 0;
  const fillLeft = Math.min(ratio, zeroRatio) * 100;
  const fillWidth = Math.abs(ratio - zeroRatio) * 100;

  return (
    <div className={`tsl-slider ${disabled ? 'is-disabled' : ''}`}>
      {iconLeft && <span className="tsl-slider-icon">{iconLeft}</span>}
      <div
        ref={trackRef}
        className="tsl-slider-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {centered && <span className="tsl-slider-zero" style={{ left: `${zeroRatio * 100}%` }} />}
        <span className="tsl-slider-fill" style={{ left: `${fillLeft}%`, width: `${Math.max(fillWidth, centered ? 0 : 6)}%` }} />
        <span className="tsl-slider-value">{format(value)}</span>
      </div>
      {iconRight && <span className="tsl-slider-icon">{iconRight}</span>}
    </div>
  );
};

export default TeslaSlider;
