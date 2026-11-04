import React from 'react';

interface VolkswagenIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

// Simpel Volkswagen-achtig embleem: cirkel met een "V" boven een "W".
// Gebruikt currentColor, dus volgt dezelfde kleur (licht/donker) als de andere bar-iconen.
const VolkswagenIcon: React.FC<VolkswagenIconProps> = ({ size = 28, strokeWidth = 1.6, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-label="Volkswagen"
    role="img"
  >
    {/* Buitenring */}
    <circle cx="12" cy="12" r="10.5" />
    {/* V (bovenste helft) */}
    <polyline points="7.6,2.6 12,13.2 16.4,2.6" />
    {/* W (onderste helft) */}
    <polyline points="2.7,7.4 8,21.5 12,13.2 16,21.5 21.3,7.4" />
  </svg>
);

export default VolkswagenIcon;
