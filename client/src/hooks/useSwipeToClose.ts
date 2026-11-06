// Wegvegen om te sluiten: pak een paneel vast en sleep het weg (apps naar rechts, het PandaOS-paneel omhoog).
// Het paneel volgt de vinger (alleen transform, geen overgang tijdens het slepen). Loslaten voorbij 25 % van het
// paneel of snel wegvegen (> 0,4 px/ms) sluit; anders veert het terug. Afgebroken (pointercancel) = terugveren.
//
// Pointer-gebeurtenissen op een eigen element (de greepstrook of het paneel zelf, met de juiste touch-action),
// zodat apps die stopPropagation doen de veeg niet kunnen opeten. Zodra de richting vaststaat pakt het element
// de pointer (setPointerCapture): de veeg blijft dan van ons, ook boven iframes, canvas of buiten de strook.
// De transform wordt rechtstreeks op het element gezet, niet via React-state: zo hoeft niet bij elke
// beweging het hele scherm opnieuw te renderen (de radio is traag).
import { useEffect, useRef, useState, type RefObject } from 'react';

export interface SwipeToCloseOptions {
  ref: RefObject<HTMLElement | null>; // waar de veeg begint (luisteraars + pointer capture)
  moveRef?: RefObject<HTMLElement | null>; // wat meeschuift (standaard ref)
  axis: 'x' | 'y';
  direction: 1 | -1; // 1 = naar rechts/omlaag sluiten, -1 = naar links/omhoog
  enabled: boolean;
  onClose: () => void;
  // Mag een veeg hier beginnen? (bijv. niet op een schuifbalk)
  canStart?: (x: number, y: number, target: Element, el: HTMLElement) => boolean;
  baseTransform?: string; // transform die het bewegende element al heeft (bijv. 'translateX(-50%)')
  closeFraction?: number; // deel van de paneelmaat waarna loslaten sluit
  flickVelocity?: number; // px/ms
  slop?: number; // px beweging voordat de richting vaststaat
  // capture: luisteren in de capture-fase (vóór de kinderen). Nodig als de veeg overal in een paneel mag beginnen:
  // knoppen en lijsten die stopPropagation doen, kunnen de veeg dan niet meer opeten.
  capture?: boolean;
  // Hoeveel sterker de beweging in de sluitrichting moet zijn dan dwars (1 = gewoon meer; 1.4 = duidelijk horizontaal)
  dominance?: number;
}

interface Gesture {
  id: number;
  x0: number; y0: number;
  active: boolean;
  offset: number;
  samples: { t: number; d: number }[];
}

const swallowClick = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); };

export function useSwipeToClose({
  ref, moveRef, axis, direction, enabled, onClose, canStart, baseTransform = '',
  closeFraction = 0.25, flickVelocity = 0.4, slop = 6, capture = false, dominance = 1,
}: SwipeToCloseOptions) {
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef(0);
  // Laatste versies van de callbacks, zodat de luisteraars niet bij elke render opnieuw hoeven
  const latest = useRef({ onClose, canStart, baseTransform });
  latest.current = { onClose, canStart, baseTransform };

  useEffect(() => {
    const el = ref.current;
    const mover = moveRef?.current ?? el;
    if (!enabled || !el || !mover) return;
    let gesture: Gesture | null = null;
    const timers: number[] = [];

    const apply = (offset: number) => {
      const move = axis === 'x' ? `translateX(${offset * direction}px)` : `translateY(${offset * direction}px)`;
      mover.style.transform = `${latest.current.baseTransform} ${move}`.trim();
    };
    const reset = () => { mover.style.transition = ''; mover.style.transform = ''; offsetRef.current = 0; };
    reset(); // (opnieuw) geopend: begin altijd op de gewone plek

    const stopListening = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
    };

    const onDown = (e: PointerEvent) => {
      if (gesture || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (!(e.target instanceof Element)) return;
      if (latest.current.canStart && !latest.current.canStart(e.clientX, e.clientY, e.target, el)) return;
      gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, active: false, offset: 0, samples: [] };
      // Op window in de capture-fase: kinderen die stopPropagation doen houden de beweging dan niet tegen
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onCancel, true);
    };

    const onMove = (e: PointerEvent) => {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      const main = (axis === 'x' ? e.clientX - g.x0 : e.clientY - g.y0) * direction;
      const cross = Math.abs(axis === 'x' ? e.clientY - g.y0 : e.clientX - g.x0);
      if (!g.active) {
        if (Math.max(Math.abs(main), cross) < slop) return;
        // Alleen als de beweging vooral in de sluitrichting gaat; anders is het scrollen of een schuifbalk
        if (main <= 0 || Math.abs(main) <= cross * dominance) { gesture = null; stopListening(); return; }
        g.active = true;
        try { el.setPointerCapture(g.id); } catch { /* pointer al weg */ }
        mover.style.transition = 'none';
        setDragging(true);
      }
      e.preventDefault();
      g.offset = Math.max(0, main);
      offsetRef.current = g.offset;
      const t = performance.now();
      g.samples.push({ t, d: g.offset });
      while (g.samples.length > 2 && t - g.samples[0].t > 100) g.samples.shift();
      apply(g.offset);
    };

    const end = (e: PointerEvent, cancelled: boolean) => {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      gesture = null;
      stopListening();
      if (!g.active) return;
      try { if (el.hasPointerCapture(g.id)) el.releasePointerCapture(g.id); } catch { /* al los */ }
      setDragging(false);
      // De klik die na het loslaten nog komt niet doorlaten (anders tikt de veeg een knop aan of sluit 'naast tikken')
      window.addEventListener('click', swallowClick, { capture: true, once: true });
      timers.push(window.setTimeout(() => window.removeEventListener('click', swallowClick, { capture: true }), 400));

      const size = axis === 'x' ? mover.offsetWidth : mover.offsetHeight;
      const first = g.samples[0];
      const last = g.samples[g.samples.length - 1];
      // Snelheid over de laatste 100 ms; stond de vinger al even stil voor het loslaten, dan geen veeg
      const velocity = first && last && last.t > first.t && performance.now() - last.t < 100
        ? (last.d - first.d) / (last.t - first.t) : 0;
      const close = !cancelled && (g.offset > size * closeFraction || velocity > flickVelocity);

      if (close) {
        // Verder wegschuiven, dan pas echt sluiten (zelfde actie als naast het paneel tikken)
        mover.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 1, 1)';
        apply(size);
        timers.push(window.setTimeout(() => {
          latest.current.onClose();
          // Vangnet: blijft het paneel toch open, dan terug op de gewone plek
          timers.push(window.setTimeout(reset, 450));
        }, 200));
      } else {
        mover.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
        apply(0);
        offsetRef.current = 0;
        timers.push(window.setTimeout(() => { if (!gesture) reset(); }, 260));
      }
    };
    const onUp = (e: PointerEvent) => end(e, false);
    const onCancel = (e: PointerEvent) => end(e, true);

    el.addEventListener('pointerdown', onDown, capture);
    return () => {
      el.removeEventListener('pointerdown', onDown, capture);
      stopListening();
      timers.forEach((t) => window.clearTimeout(t));
      gesture = null;
      reset();
      setDragging(false);
    };
  }, [ref, moveRef, axis, direction, enabled, closeFraction, flickVelocity, slop, capture, dominance]);

  return { dragging, offsetRef };
}

// Hulp voor canStart: begint de aanraking in iets dat zelf wil schuiven in de veegrichting?
// (een schuifbalk, of een lijst die nog verder kan scrollen)
export function startsInScrollable(target: Element, root: Element, axis: 'x' | 'y', direction: 1 | -1): boolean {
  // Schuifbalken, tekstvelden, de kaart en canvassen (spellen, 3D) houden horizontale bewegingen zelf
  if (target.closest('input[type="range"], input[type="text"], textarea, .tsl-slider, [data-no-swipe], .leaflet-container, canvas, iframe')) return true;
  for (let node: Element | null = target; node && node !== root; node = node.parentElement) {
    const style = getComputedStyle(node);
    const overflow = axis === 'x' ? style.overflowX : style.overflowY;
    if (overflow !== 'auto' && overflow !== 'scroll') continue;
    if (axis === 'x' ? node.scrollWidth <= node.clientWidth : node.scrollHeight <= node.clientHeight) continue;
    // Kan de inhoud nog schuiven in de richting waarin de vinger gaat? Dan is de veeg voor de inhoud.
    if (axis === 'x') {
      if (direction === 1 ? node.scrollLeft > 0 : node.scrollLeft + node.clientWidth < node.scrollWidth - 1) return true;
    } else if (direction === 1 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
  }
  return false;
}
