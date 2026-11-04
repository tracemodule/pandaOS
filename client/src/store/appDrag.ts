// Apps slepen naar de dock (favorieten links van de lijn) of naar het kruis (weghalen).
// Met pointer-events, zodat het ook met aanraken werkt: HTML5-drag-and-drop werkt niet met touch in de
// Android-WebView van de radio. Doelen in de dock hebben data-drop="pinned" (met data-index) of data-drop="remove".
import { create } from 'zustand';
import { useUIStore } from './uiStore';

interface DragState {
  id: string; // app-id, of 'pkg:<pakket>' voor een Android-app
  icon: string;
  x: number;
  y: number;
  over: string | null; // 'pinned:<index>' | 'remove' | null
}

export const useAppDrag = create<{ drag: DragState | null }>(() => ({ drag: null }));

const DRAG_THRESHOLD = 8; // px bewegen voordat het slepen begint
const LONG_PRESS_MS = 600; // lang indrukken = bewerkmodus

// Welk dock-doel ligt onder de vinger?
const dropTargetAt = (x: number, y: number): string | null => {
  const el = document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null;
  if (!el) return null;
  if (el.dataset.drop === 'remove') return 'remove';
  if (el.dataset.drop === 'pinned') return `pinned:${el.dataset.index ?? useUIStore.getState().pinnedApps.length}`;
  return null;
};

interface PressOptions {
  id: string;
  icon: string;
  onTap?: () => void; // loslaten zonder slepen in de bewerkmodus (bijv. app-menu: vastzetten)
  longPress?: boolean; // lang indrukken zet de bewerkmodus aan (standaard ja)
}

// Aanroepen vanuit onPointerDown op een app-pictogram (app-menu of dock)
export const pressApp = (e: React.PointerEvent, { id, icon, onTap, longPress: allowLongPress = true }: PressOptions) => {
  if (e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  let dragging = false;
  let moved = false;
  let longPressed = false; // loslaten na lang indrukken is geen tik (anders zou de app meteen vastgezet worden)

  // Lang indrukken buiten de bewerkmodus: bewerkmodus aan (daarna kun je slepen)
  const longPress = window.setTimeout(() => {
    if (allowLongPress && !moved && !useUIStore.getState().isAppEditMode) {
      longPressed = true;
      useUIStore.getState().setAppEditMode(true);
    }
  }, LONG_PRESS_MS);

  const onMove = (ev: PointerEvent) => {
    const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
    if (dist > DRAG_THRESHOLD) moved = true;
    if (!dragging && moved && useUIStore.getState().isAppEditMode) dragging = true;
    if (dragging) {
      ev.preventDefault();
      useAppDrag.setState({ drag: { id, icon, x: ev.clientX, y: ev.clientY, over: dropTargetAt(ev.clientX, ev.clientY) } });
    }
  };

  const finish = (ev: PointerEvent) => {
    window.clearTimeout(longPress);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    const store = useUIStore.getState();
    if (dragging) {
      const target = ev.type === 'pointerup' ? dropTargetAt(ev.clientX, ev.clientY) : null;
      if (target === 'remove') store.unpinApp(id);
      else if (target?.startsWith('pinned:')) store.placePinnedApp(id, Number(target.slice(7)));
    } else if (!moved && !longPressed && store.isAppEditMode && onTap) {
      onTap();
    }
    useAppDrag.setState({ drag: null });
  };

  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
};
