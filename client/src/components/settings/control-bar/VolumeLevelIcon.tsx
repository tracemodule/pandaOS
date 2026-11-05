import React from 'react';

// Speaker in de dock (zoals in de video, 08:11): de speaker zelf in de tekstkleur, drie boogjes die meegaan met het
// volume. Een boogje boven het huidige volume is grijs. Bij 0: kruisje naast de speaker.
const VolumeLevelIcon: React.FC<{ volume: number; max: number; size?: number }> = ({ volume, max, size = 24 }) => {
  const ratio = max > 0 ? volume / max : 0;
  const lit = volume <= 0 ? 0 : ratio <= 1 / 3 ? 1 : ratio <= 2 / 3 ? 2 : 3;
  const arc = (n: number) => ({ stroke: 'currentColor', opacity: n <= lit ? 1 : 0.3 });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="currentColor" />
      {volume <= 0 ? (
        <>
          <path d="m16 9 6 6" stroke="currentColor" />
          <path d="m22 9-6 6" stroke="currentColor" />
        </>
      ) : (
        <>
          <path d="M14.5 10a2.8 2.8 0 0 1 0 4" {...arc(1)} />
          <path d="M17.3 7.6a6.5 6.5 0 0 1 0 8.8" {...arc(2)} />
          <path d="M20 5a10.5 10.5 0 0 1 0 14" {...arc(3)} />
        </>
      )}
    </svg>
  );
};

export default VolumeLevelIcon;
