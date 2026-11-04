// Diagnose-logboek van de webapp (Settings > Software > Diagnose). Loopt altijd mee, ook op de radio:
//  - fouten: JavaScript-fouten, mislukte beloftes, console.error
//  - gebeurtenissen: opstarten, versnelling (R/P/D), lichten, deuren, telefoon via Bluetooth, app openen mislukt ...
// Bewaard in localStorage (laatste 400 regels), dus ook na een herstart te zien.
// "Probleem melden" maakt hiervan één rapport met de gegevens van de radio (DiagLog.kt) en deelt het via Android.
import { useUIStore } from '../store/uiStore';

export type DiagLevel = 'info' | 'warn' | 'error';
export interface DiagEntry { time: number; level: DiagLevel; source: string; message: string }

const STORAGE_KEY = 'pandaos-diagnostics';
const MAX_ENTRIES = 400;

let entries: DiagEntry[] = (() => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
})();
const listeners = new Set<() => void>();
let saveTimer: number | undefined;

const save = () => {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch { /* opslag vol: alleen in het geheugen */ }
  }, 500);
};

export const diag = (level: DiagLevel, source: string, message: string) => {
  entries.push({ time: Date.now(), level, source, message: message.slice(0, 1000) });
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  save();
  listeners.forEach((l) => l());
};

export const getDiagEntries = () => entries;
export const clearDiagEntries = () => {
  entries = [];
  save();
  (window as any).PandaAndroid?.clearNativeDiagnostics?.();
  listeners.forEach((l) => l());
};
export const subscribeDiag = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

let started = false;
export const startDiagnostics = () => {
  if (started) return;
  started = true;
  diag('info', 'system', `PandaOS ${__PANDAOS_VERSION__} gestart (${(window as any).PandaAndroid ? 'radio' : 'laptop/Pi'})`);

  // Fouten in de webapp
  window.addEventListener('error', (e) => diag('error', 'webapp', `${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => diag('error', 'webapp', `Belofte mislukt: ${String((e.reason && (e.reason.message || e.reason)) ?? '')}`));
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    diag('error', 'console', args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ').slice(0, 500));
    originalError(...args);
  };

  // Gebeurtenissen van de auto en PandaOS
  useUIStore.subscribe((state, previous) => {
    if (state.gear !== previous.gear) diag('info', 'car', `Versnelling ${previous.gear} → ${state.gear}`);
    if (state.reverseActive !== previous.reverseActive) diag('info', 'car', `Achteruit-signaal ${state.reverseActive ? 'aan' : 'uit'}`);
    const car = state.carState, before = previous.carState;
    if (car.lights !== before.lights) diag('info', 'car', `Lichtschakelaar ${before.lights} → ${car.lights}`);
    if (car.blinker !== before.blinker) diag('info', 'car', `Knipperlicht ${car.blinker}`);
    for (const door of Object.keys(car.doors) as (keyof typeof car.doors)[]) {
      if (car.doors[door] !== before.doors[door]) diag('info', 'car', `Deur ${door} ${car.doors[door] ? 'open' : 'dicht'}`);
    }
    if (state.vehicleLightsOn !== previous.vehicleLightsOn) diag('info', 'car', `Verlichting (nachtstand) ${state.vehicleLightsOn}`);
    if (state.call.state !== previous.call.state) diag('info', 'phone', `Telefoon: ${state.call.state}`);
    if (state.nowPlayingSource !== previous.nowPlayingSource) diag('info', 'media', `Mediabron: ${state.nowPlayingSource ?? 'geen'}`);
  });
};

// Rapport voor "Probleem melden": versie, radio, instellingen, laatste regels van webapp en launcher
export const buildReport = (description = '', extra?: { title: string; lines: string[] }): string => {
  const store = useUIStore.getState();
  let native: { device?: Record<string, unknown>; entries?: { time: number; level: string; message: string }[] } = {};
  try { native = JSON.parse((window as any).PandaAndroid?.getNativeDiagnostics?.() ?? '{}'); } catch { /* geen launcher */ }
  const time = (t: number) => new Date(t).toLocaleString('nl-NL');
  const v = store.vehicleSettings;
  const lines = [
    `PandaOS probleemrapport — ${time(Date.now())}`,
    description ? `Omschrijving: ${description}` : '',
    '',
    `PandaOS ${__PANDAOS_VERSION__}`,
    `Radio: ${native.device ? JSON.stringify(native.device) : 'geen launcher (laptop/Pi)'}`,
    `Voertuig: ${v.model}, ${v.transmission}, CAN-kastje ${v.canbox ?? 'radio'}, protocol ${v.canProtocol ?? 'vw-pq35'}`,
    `Paneel: ${store.appSettings.panel}, thema: ${store.screenMode}, taal: ${store.displaySettings.language}`,
    `Autostatus: versnelling ${store.gear}, achteruit ${store.reverseActive}, lichten ${store.carState.lights}, deuren ${JSON.stringify(store.carState.doors)}`,
    '',
    '--- Launcher (laatste 80) ---',
    ...(native.entries ?? []).slice(-80).map((e) => `${time(e.time)} [${e.level}] ${e.message}`),
    '',
    '--- Webapp (laatste 150) ---',
    ...entries.slice(-150).map((e) => `${time(e.time)} [${e.level}] ${e.source}: ${e.message}`),
    ...(extra ? ['', `--- ${extra.title} ---`, ...(extra.lines.length ? extra.lines : ['(leeg)'])] : []),
  ];
  return lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n');
};

// Rapport maken en delen (radio: deelmenu van Android; laptop: naar het klembord)
export const reportProblem = async (description = '', extra?: { title: string; lines: string[] }): Promise<string> => {
  const report = buildReport(description, extra);
  diag('info', 'system', 'Probleem gemeld');
  const bridge = (window as any).PandaAndroid;
  if (bridge?.shareDiagnosticReport) return bridge.shareDiagnosticReport(report);
  await navigator.clipboard?.writeText(report).catch(() => undefined);
  return 'klembord';
};
