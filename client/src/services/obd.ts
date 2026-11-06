// OBD2 via een ELM327-dongle (Bluetooth). De launcher (Android) praat met de dongle en geeft de toestand door:
//  - window.PandaAndroid.obdState() op vraag, en het DOM-event 'pandaos-obd' (detail = toestand) bij elke wijziging
//  - obdListDevices / obdConnect / obdDisconnect / obdSetAutoConnect / obdGetSettings / obdReadDtc / obdBluetoothInfo
// Op de laptop of met een oudere launcher bestaat dit niet: dan blijft de toestand null en toont de app dat.
//
// Deze module houdt de laatste toestand bij (kleine eigen store, useObdState() via useSyncExternalStore) en geeft
// buitentemperatuur en tankniveau door aan de autostatus (carState) zolang er een echte verbinding is.
// Snelheid gaat NIET naar de store: setGpsSpeed wordt al door GPS (ritcomputer) en het CAN-kastje gevuld; een derde
// bron zou ermee vechten. De OBD-snelheid staat alleen in de OBD2-app.
// Demo (gesimuleerde waarden van de launcher) blijft los van de auto, tenzij "Demowaarden gebruiken" aan staat.
import { useSyncExternalStore } from 'react';
import { useUIStore } from '../store/uiStore';

export type ObdConnState = 'idle' | 'connecting' | 'initializing' | 'connected' | 'error';

export interface ObdValues {
  rpm: number | null;
  speed: number | null;
  coolant: number | null;
  load: number | null;
  intakeTemp: number | null;
  throttle: number | null;
  fuel: number | null;
  ambient: number | null;
  fuelRate: number | null;
  voltage: number | null;
  distanceSinceClear: number | null;
}

export interface ObdDtc { stored: string[]; pending: string[]; readAt: number | null }

export interface ObdState {
  state: ObdConnState;
  device: { name: string; address: string } | null;
  protocol: string | null;
  error: string | null;
  supported: string[];
  values: ObdValues;
  dtc: ObdDtc | null;
  updatedAt: number | null;
  demo: boolean;
}

export interface ObdDevice { name: string; address: string; likelyObd?: boolean }
export interface ObdSettings { autoConnect: boolean; lastAddress: string | null; lastName: string | null }
export interface ObdBluetoothInfo {
  adapterEnabled?: boolean;
  bonded?: number | unknown[];
  connectedProfiles?: Record<string, unknown>;
  obdConnected?: boolean;
}

export interface ObdSnapshot {
  available: boolean; // launcher met OBD2-ondersteuning
  state: ObdState | null;
  demoFeed: boolean; // demowaarden toch naar de autostatus sturen
}

const DEMO_FEED_KEY = 'pandaos-obd-demo-feed';
const POLL_MS = 4000; // vangnet als er even geen event komt

const bridge = () => (window as any).PandaAndroid;
const hasBridge = () => typeof bridge()?.obdState === 'function';

const parse = <T>(text: unknown): T | null => {
  if (typeof text !== 'string' || !text) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
};

const EMPTY_VALUES: ObdValues = {
  rpm: null, speed: null, coolant: null, load: null, intakeTemp: null, throttle: null,
  fuel: null, ambient: null, fuelRate: null, voltage: null, distanceSinceClear: null,
};

// Toestand van de launcher netjes maken (ontbrekende velden = null), zodat de UI niet hoeft te twijfelen
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const normalize = (raw: any): ObdState | null => {
  if (!raw || typeof raw !== 'object') return null;
  const values = { ...EMPTY_VALUES };
  for (const key of Object.keys(EMPTY_VALUES) as (keyof ObdValues)[]) values[key] = num(raw.values?.[key]);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') as string[] : []);
  return {
    state: ['idle', 'connecting', 'initializing', 'connected', 'error'].includes(raw.state) ? raw.state : 'idle',
    device: raw.device && typeof raw.device === 'object' ? { name: String(raw.device.name ?? ''), address: String(raw.device.address ?? '') } : null,
    protocol: raw.protocol ? String(raw.protocol) : null,
    error: raw.error ? String(raw.error) : null,
    supported: list(raw.supported),
    values,
    dtc: raw.dtc && typeof raw.dtc === 'object'
      ? { stored: list(raw.dtc.stored), pending: list(raw.dtc.pending), readAt: num(raw.dtc.readAt) } : null,
    updatedAt: num(raw.updatedAt),
    demo: !!raw.demo,
  };
};

// --- Kleine store ---
let snapshot: ObdSnapshot = {
  available: false,
  state: null,
  demoFeed: (() => { try { return localStorage.getItem(DEMO_FEED_KEY) === '1'; } catch { return false; } })(),
};
const listeners = new Set<() => void>();
let lastEventAt = 0;
let started = false;

const emit = (next: Partial<ObdSnapshot>) => {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
  feedCarState();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const getObdSnapshot = () => snapshot;
export const useObd = () => useSyncExternalStore(subscribe, getObdSnapshot, getObdSnapshot);
export const useObdState = () => useObd().state;

// --- Autostatus voeden ---
let fedDemo = false; // laatste waarden kwamen uit demo: bij stoppen weer leegmaken
let lastFed: { outsideTemp?: number; fuelPercent?: number } = {};

const feedCarState = () => {
  const s = snapshot.state;
  const live = !!s && s.state === 'connected' && (!s.demo || snapshot.demoFeed);
  const store = useUIStore.getState();
  if (!live) {
    // Demo uit: de verzonnen waarden niet laten staan (alleen als niemand anders ze intussen heeft veranderd)
    if (fedDemo) {
      const reset: { outsideTemp?: null; fuelPercent?: null } = {};
      if (lastFed.outsideTemp !== undefined && store.carState.outsideTemp === lastFed.outsideTemp) reset.outsideTemp = null;
      if (lastFed.fuelPercent !== undefined && store.carState.fuelPercent === lastFed.fuelPercent) reset.fuelPercent = null;
      if (Object.keys(reset).length) store.setCarState(reset);
      fedDemo = false;
      lastFed = {};
    }
    return;
  }
  const partial: { outsideTemp?: number; fuelPercent?: number } = {};
  const { ambient, fuel } = s.values;
  if (ambient !== null && store.carState.outsideTemp !== Math.round(ambient)) partial.outsideTemp = Math.round(ambient);
  if (fuel !== null && store.carState.fuelPercent !== Math.round(fuel)) partial.fuelPercent = Math.round(fuel);
  if (Object.keys(partial).length) {
    store.setCarState(partial);
    lastFed = { ...lastFed, ...partial };
  }
  fedDemo = s.demo;
};

// --- Bridge ---
export const refreshObd = () => {
  if (!hasBridge()) { if (snapshot.available || snapshot.state) emit({ available: false, state: null }); return; }
  const state = normalize(parse(bridge().obdState()));
  emit({ available: true, state });
};

export const obdListDevices = (): ObdDevice[] => {
  const list = parse<ObdDevice[]>(bridge()?.obdListDevices?.());
  return Array.isArray(list) ? list.filter((d) => d && typeof d.address === 'string') : [];
};
export const obdGetSettings = (): ObdSettings | null => parse<ObdSettings>(bridge()?.obdGetSettings?.());
export const obdBluetoothInfo = (): ObdBluetoothInfo | null => parse<ObdBluetoothInfo>(bridge()?.obdBluetoothInfo?.());

export const obdConnect = (address: string) => {
  bridge()?.obdConnect?.(address);
  window.setTimeout(refreshObd, 300);
};
export const obdDisconnect = () => {
  bridge()?.obdDisconnect?.();
  window.setTimeout(refreshObd, 300);
};
export const obdSetAutoConnect = (on: boolean) => bridge()?.obdSetAutoConnect?.(on);
export const obdReadDtc = () => bridge()?.obdReadDtc?.(); // uitslag komt in de volgende toestand

export const setObdDemoFeed = (on: boolean) => {
  try { localStorage.setItem(DEMO_FEED_KEY, on ? '1' : '0'); } catch { /* geblokkeerd */ }
  emit({ demoFeed: on });
};

export const initObd = () => {
  if (started) return;
  started = true;
  window.addEventListener('pandaos-obd', (e: Event) => {
    lastEventAt = Date.now();
    const state = normalize((e as CustomEvent).detail);
    if (state) emit({ available: true, state });
  });
  refreshObd();
  // Vangnet: geen event in een tijdje (oudere launcher, gemiste event) → zelf vragen
  window.setInterval(() => { if (Date.now() - lastEventAt > POLL_MS) refreshObd(); }, POLL_MS);
  // Voor DevTools/tools: toestand bekijken
  (window as any).pandaObd = { get: getObdSnapshot, refresh: refreshObd };
};
