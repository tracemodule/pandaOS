// Controlelampjes onder de versnelling (P R N D), onder elkaar en als omtrek (outline), alleen wat aan staat.
// De gordel staat altijd onderaan, onder de lampjes.
// Kleuren zoals in de auto: stadslicht/dimlicht/mistlicht voor en knipperlichten groen, grootlicht blauw,
// mistachterlicht oranje, gordel rood. Gegevens komen uit carState (CAN-kastje of geleerde koppelingen).
import React from 'react';
import { useUIStore } from '../../../../store/uiStore';
import { useT } from '../../../../i18n';

const GREEN = '#2fbf4a';
const BLUE = '#2f6fe8';
const AMBER = '#f5a623';
const RED = '#e5322d';
const SIZE = 26;

type IconProps = { color: string };

// Lamp met lichtbundel; rays: 'down' = dimlicht, 'straight' = grootlicht
const Headlamp: React.FC<IconProps & { rays: 'down' | 'straight'; fog?: 'front' | 'rear' }> = ({ color, rays, fog }) => {
  const rear = fog === 'rear';
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      style={rear ? { transform: 'scaleX(-1)' } : undefined}>
      {/* Lampkap: rond aan de achterkant, plat aan de voorkant */}
      <path d="M14 5c-4.5 0-8 3-8 7s3.5 7 8 7z" />
      {rays === 'straight'
        ? <><path d="M17 7h5" /><path d="M17 10.3h5" /><path d="M17 13.7h5" /><path d="M17 17h5" /></>
        : <><path d="M17 7l5 1.5" /><path d="M17 10.3l5 1.5" /><path d="M17 13.7l5 1.5" /><path d="M17 17l5 1.5" /></>}
      {/* Mistlamp: golvende lijn door de bundel */}
      {fog && <path d="M16.5 4c1 2.5-1 4.5 0 8s-1 5.5 0 8" />}
    </svg>
  );
};

// Stadslicht: twee kleine lampjes die van elkaar af schijnen
const ParkingLights: React.FC<IconProps> = ({ color }) => (
  <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
    <path d="M9 8a4 4 0 0 0 0 8z" />
    <path d="M15 8a4 4 0 0 1 0 8z" />
    <path d="M5.5 9L3 8" /><path d="M5.5 12H2.5" /><path d="M5.5 15L3 16" />
    <path d="M18.5 9L21 8" /><path d="M18.5 12h3" /><path d="M18.5 15L21 16" />
  </svg>
);

// Knipperlicht: pijl naar links of rechts
const Blinker: React.FC<IconProps & { side: 'left' | 'right' }> = ({ color, side }) => (
  <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" style={side === 'right' ? { transform: 'scaleX(-1)' } : undefined}>
    <path d="M2.5 12l8.5-7.5V9h10.5v6H11v4.5z" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
  </svg>
);

// Gordel niet om: zittend poppetje met de gordel schuin over de borst
const Seatbelt: React.FC<IconProps> = ({ color }) => (
  <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="4" r="2.2" />
    <path d="M8 21v-6l-2-1V9.5A2.5 2.5 0 0 1 8.5 7h4A2.5 2.5 0 0 1 15 9.5V14h3l1.5 7" />
    <path d="M7 8l9 9" strokeWidth={2.4} />
  </svg>
);

const WarningLights: React.FC = () => {
  const t = useT();
  const carState = useUIStore((s) => s.carState);
  const { lights, highBeam, fogFront, fogRear, blinker, seatbeltUnfastened } = carState;

  const items: { key: string; label: string; icon: React.ReactNode; blink?: boolean }[] = [];
  if (blinker === 'left' || blinker === 'hazard') items.push({ key: 'bl', label: 'Left indicator', icon: <Blinker color={GREEN} side="left" />, blink: true });
  if (lights === 'parking') items.push({ key: 'park', label: 'Parking lights', icon: <ParkingLights color={GREEN} /> });
  if (lights === 'low') items.push({ key: 'low', label: 'Low beam', icon: <Headlamp color={GREEN} rays="down" /> });
  if (highBeam) items.push({ key: 'high', label: 'High beam', icon: <Headlamp color={BLUE} rays="straight" /> });
  if (fogFront) items.push({ key: 'fogf', label: 'Front fog lights', icon: <Headlamp color={GREEN} rays="down" fog="front" /> });
  if (fogRear) items.push({ key: 'fogr', label: 'Rear fog light', icon: <Headlamp color={AMBER} rays="straight" fog="rear" /> });
  if (blinker === 'right' || blinker === 'hazard') items.push({ key: 'br', label: 'Right indicator', icon: <Blinker color={GREEN} side="right" />, blink: true });

  // Gordel altijd als laatste, onder de lampjes
  if (seatbeltUnfastened === true) items.push({ key: 'belt', label: 'Seatbelt not fastened', icon: <Seatbelt color={RED} /> });
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
      {items.map((item) => (
        <span key={item.key} title={t(item.label)} aria-label={t(item.label)}
          className={item.blink ? 'tsl-indicator-blink' : undefined}
          style={{ display: 'flex', transform: 'scale(var(--text-scale, 1))', transformOrigin: 'left center' }}>
          {item.icon}
        </span>
      ))}
    </div>
  );
};

export default WarningLights;
