// Toybox: gedeelde tijden en regels voor de effecten op de 3D-auto (zonder three.js, ook gebruikt door ToyboxApp).
// Alles verandert alleen het plaatje, nooit de echte auto.
import type { LightShowSettings } from '../../../../store/uiStore';

export const WASH_MS = 8000; // wasstraat: schuim (0-4,5 s), spoelen (4,5-6 s), glans (6-8 s)
export const BOOST_MS = 1600; // uitlaatvlammen
export const HOLIDAY_PREVIEW_MS = 20000; // "Nu tonen" bij Feestdagen

// Feestdagen: kerst = 1-31 december; vuurwerk = 31 december en 1 januari (lokale tijd van de radio)
export const holidaysOn = (d = new Date()) => ({
  christmas: d.getMonth() === 11,
  fireworks: (d.getMonth() === 11 && d.getDate() === 31) || (d.getMonth() === 0 && d.getDate() === 1),
});

// Lichtshow: welke lampen branden op een moment. beat = aantal tellen sinds de start (met fractie).
export type ShowLamps = { front: boolean; left: boolean; right: boolean; rear: boolean; reverse: boolean };
export const lightShowLamps = (pattern: LightShowSettings['pattern'], beat: number): ShowLamps => {
  const b = Math.floor(beat);
  const f = beat - b;
  const off: ShowLamps = { front: false, left: false, right: false, rear: false, reverse: false };
  switch (pattern) {
    case 'alternate': { // links en rechts om de beurt, voor/achter mee
      if (f > 0.6) return off;
      const even = b % 2 === 0;
      return { front: even, left: even, right: !even, rear: !even, reverse: false };
    }
    case 'chase': { // rondje: voor, rechts, achter, links
      if (f > 0.8) return off;
      const step = b % 4;
      return { front: step === 0, right: step === 1, rear: step === 2, left: step === 3, reverse: step === 2 };
    }
    case 'strobe': { // twee korte flitsen per tel, knipperlichten om de tel
      const flash = f < 0.12 || (f > 0.25 && f < 0.37);
      return { front: flash, rear: flash, reverse: flash, left: b % 2 === 0, right: b % 2 === 1 };
    }
    default: { // pulse: alles kort aan op elke tel
      const on = f < 0.35;
      return { front: on, left: on, right: on, rear: on, reverse: false };
    }
  }
};
