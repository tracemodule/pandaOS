// Keuzetegels zoals de tweede rij van "Controls" in de Tesla UI Kit (Figma): één kader met vakken, in elk vak een
// icoon in het midden met de tekst eronder; het gekozen vak is licht (of grijs in donker). Bij veel opties
// lopen de vakken door op een volgende rij (max. `columns` per rij).
// onLongPress: lang indrukken (0,6 s), bijv. om een eigen kleur te hernoemen of te verwijderen.
import React, { useRef } from 'react';

// active: zelf aangeven of dit vak aan staat (voor aan/uit-vakken waarvan er meer tegelijk aan kunnen)
export type IconTile = { id: string; label: string; icon: React.ReactNode; active?: boolean; onClick?: () => void; onLongPress?: () => void };

const LONG_PRESS_MS = 600;

const Tile: React.FC<{ tile: IconTile; active: boolean; onChange?: (id: string) => void }> = ({ tile, active, onChange }) => {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; };
  return (
    <button className={active ? 'is-active' : ''}
      onPointerDown={() => {
        fired.current = false;
        if (tile.onLongPress) timer.current = window.setTimeout(() => { fired.current = true; tile.onLongPress!(); }, LONG_PRESS_MS);
      }}
      onPointerUp={clear} onPointerLeave={clear} onPointerCancel={clear}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (fired.current) { fired.current = false; return; } // lang ingedrukt: geen gewone keuze
        if (tile.onClick) tile.onClick(); else onChange?.(tile.id);
      }}>
      <span className="tsl-icon-tile-icon">{tile.icon}</span>
      <span className="tsl-icon-tile-label">{tile.label}</span>
    </button>
  );
};

const IconTiles: React.FC<{ tiles: IconTile[]; value?: string; onChange?: (id: string) => void; columns?: number }> =
  ({ tiles, value, onChange, columns = 5 }) => (
    <div className="tsl-icon-tiles" style={{ gridTemplateColumns: `repeat(${Math.min(tiles.length, columns)}, 1fr)` }}>
      {tiles.map((tile) => <Tile key={tile.id} tile={tile} active={tile.active ?? value === tile.id} onChange={onChange} />)}
    </div>
  );

export default IconTiles;

// --- Kleine iconen voor de Voertuig-tegels ---

// Ronde kleur (lak, velgen, spiegels, grill). pattern: carbon = geweven patroon, chrome = glans
export const ColorDot: React.FC<{ color: string; pattern?: 'carbon' | 'chrome' }> = ({ color, pattern }) => (
  <span className="tsl-color-dot" style={{
    background: pattern === 'carbon'
      ? 'repeating-linear-gradient(45deg, #2b2b2b 0 3px, #111 3px 6px)'
      : pattern === 'chrome' ? 'linear-gradient(135deg, #f4f6f8, #9aa1a8 45%, #eef1f3 55%, #7d848b)' : color,
  }} />
);

// Zijruit met tint: 0 = geen, 1 licht ... 4 limo
export const TintIcon: React.FC<{ level: number }> = ({ level }) => (
  <svg width="34" height="26" viewBox="0 0 34 26" fill="none">
    <path d="M3 23 L9 4 H25 Q29 4 30 8 L31 23 Z" fill="#171717" fillOpacity={[0, 0.2, 0.45, 0.7, 0.92][level]}
      stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

// Achterbumper met de uitlaten op hun plek
export const ExhaustIcon: React.FC<{ pipes: number[] }> = ({ pipes }) => (
  <svg width="44" height="26" viewBox="0 0 44 26" fill="none">
    <path d="M3 6 H41 V14 Q41 18 37 18 H7 Q3 18 3 14 Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    {pipes.map((x) => <circle key={x} cx={x} cy="21" r="2.6" fill="currentColor" />)}
  </svg>
);

// Versnellingsbak: H-patroon (alle drie de keuzes gebruiken dit icoon)
export const ManualIcon: React.FC = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M5 5 V23 M14 5 V23 M23 5 V23 M5 14 H23" />
    {[5, 14, 23].flatMap((x) => [5, 23].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="currentColor" stroke="none" />))}
  </svg>
);
