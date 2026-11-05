// App-koppelingen: welke PandaOS-apps er zijn en welke Android-apps je eraan kunt koppelen (Settings > Apps).
// Op de radio (Android-launcher, window.PandaAndroid) komen de geïnstalleerde apps van het apparaat zelf;
// op de laptop of de Pi zijn er geen Android-apps en opent altijd de PandaOS-versie.
// Een koppeling is 'pandaos', 'none', de id van een bekende optie (bijv. 'spotify-android'),
// of 'pkg:<pakketnaam>' voor een zelf gekozen app ("Andere app" / automatisch herkend).
import { useEffect, useState } from 'react';
import type { AppLink } from './uiStore';
import { diag } from '../services/diagnostics';

export interface AndroidAppOption {
  id: string;
  name: string;
  package?: string;
}

// Geïnstalleerde Android-app (van de launcher)
export interface AndroidApp {
  package: string;
  name: string;
}

export interface LinkableApp {
  id: string; // zelfde id als in de dock en het app-menu
  name: string;
  icon: string;
  options: AndroidAppOption[]; // bekende Android-apps naast de ingebouwde PandaOS-versie
  // Staat er een Android-app op het apparaat, dan is die de standaardkeuze (anders PandaOS)
  preferAndroid?: boolean;
  // Op de radio geen PandaOS-versie (Spotify, YouTube, Theater: altijd de Android-app; CarPlay: de dongle-versie
  // bestaat alleen op laptop/Pi)
  androidOnly?: boolean;
  // Niet geïnstalleerd: pictogram lichter, een tik opent deze app in de Play Store
  storePackage?: string;
  // Niet geïnstalleerd: niet tonen in het app-menu en de dock
  hideWhenMissing?: boolean;
  // Herkent geïnstalleerde apps aan naam of pakketnaam (CarPlay-apps, audio-app van de radio)
  detect?: RegExp;
  // "Andere app": elke geïnstalleerde app kiezen
  allowOther?: boolean;
  // Alleen in Settings > Apps, niet in het app-menu (bijv. Audio: geopend vanuit Music)
  settingsOnly?: boolean;
  // Opent altijd eerst de PandaOS-versie in het halve scherm; de gekoppelde Android-app via een knop
  // "Volledig scherm" (Nav: PandaOS-kaart, Google Maps/Waze volledig scherm)
  panelFirst?: boolean;
  // Android-app half openen (venster rechts naast de auto), met een knop voor volledig scherm (Nav, Energy)
  halfScreen?: boolean;
}

export const PANDAOS_TARGET = 'pandaos';
export const NONE_TARGET = 'none'; // geen app gekoppeld: het pictogram opent niets
const PKG_PREFIX = 'pkg:';

const bridge = () => (window as any).PandaAndroid;

// Draait PandaOS als launcher op Android (de radio)?
export const isAndroidLauncher = () => typeof bridge() !== 'undefined';

// Geïnstalleerde Android-apps met naam. Zonder launcher leeg.
export const getInstalledAppList = (): AndroidApp[] => {
  try {
    const b = bridge();
    if (b?.getInstalledAppList) return (JSON.parse(b.getInstalledAppList()) as AndroidApp[]).filter((a) => !isAlwaysHidden(a.package));
    if (b?.getInstalledApps) return (JSON.parse(b.getInstalledApps()) as string[]).map((p) => ({ package: p, name: p }));
  } catch {
    // launcher geeft geen (geldige) lijst: geen Android-apps
  }
  return [];
};

// Lijst voor componenten: opnieuw ophalen als PandaOS weer zichtbaar wordt (bijv. na installeren in de Play Store)
export const useInstalledApps = (): AndroidApp[] => {
  const [apps, setApps] = useState<AndroidApp[]>(getInstalledAppList);
  useEffect(() => {
    if (!isAndroidLauncher()) return;
    const update = () => { if (document.visibilityState === 'visible') setApps(getInstalledAppList()); };
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return apps;
};

export const getInstalledPackages = (): string[] => getInstalledAppList().map((a) => a.package);

// Android-apps die nooit in PandaOS verschijnen: de camera-app (PandaOS heeft zijn eigen achteruitrijcamera)
const ALWAYS_HIDDEN = new Set([
  'com.android.camera', 'com.android.camera2', 'com.google.android.GoogleCamera', 'org.codeaurora.snapcam',
]);
export const isAlwaysHidden = (pkg: string) => ALWAYS_HIDDEN.has(pkg) || /\.camera2?$/i.test(pkg);

// Eigen naam en pictogram voor sommige Android-apps (Android-instellingen naast de PandaOS-instellingen)
const APP_OVERRIDES: Record<string, { name: string; icon: string }> = {
  'com.android.settings': { name: 'Android Settings', icon: '/app-icons/android-settings.svg' },
};
export const getAndroidAppName = (app: AndroidApp) => APP_OVERRIDES[app.package]?.name ?? app.name;

// Pictogrammen van Android-apps (data-URL), één keer per app opgehaald
const iconCache = new Map<string, string>();
export const getAndroidAppIcon = (pkg: string): string => {
  if (APP_OVERRIDES[pkg]) return APP_OVERRIDES[pkg].icon;
  if (!iconCache.has(pkg)) iconCache.set(pkg, bridge()?.getAppIcon?.(pkg) ?? '');
  return iconCache.get(pkg)!;
};

// Android-app aan/uit in Settings > Apps (zichtbaar in het app-menu); opgeslagen als appLinks['pkg:<pakket>']
export const androidAppKey = (pkg: string) => PKG_PREFIX + pkg;
export const isAndroidAppVisible = (links: Record<string, AppLink>, pkg: string) =>
  !isAlwaysHidden(pkg) && links[androidAppKey(pkg)]?.enabled !== false;

export const LINKABLE_APPS: LinkableApp[] = [
  // --- Android-apps: op de radio altijd de echte app; niet geïnstalleerd = Play Store ---
  { id: 'spotify', name: 'Spotify', icon: '/app-icons/spotify.svg', preferAndroid: true, androidOnly: true, halfScreen: true,
    storePackage: 'com.spotify.music', options: [
      { id: 'spotify-android', name: 'Spotify', package: 'com.spotify.music' },
    ] },
  { id: 'youtube', name: 'YouTube', icon: '/app-icons/youtube.svg', preferAndroid: true, androidOnly: true,
    storePackage: 'com.google.android.youtube', options: [
      { id: 'youtube-android', name: 'YouTube', package: 'com.google.android.youtube' },
      { id: 'youtube-music', name: 'YouTube Music', package: 'com.google.android.apps.youtube.music' },
    ] },
  // Theater: de PandaOS-pagina met videoapps (TheaterApp.tsx); één app direct koppelen kan ook
  { id: 'netflix', name: 'Theater', icon: '/app-icons/netflix.svg', allowOther: true, options: [
      { id: 'netflix-android', name: 'Netflix', package: 'com.netflix.mediaclient' },
    ] },
  // Energy (tankpictogram): brandstofprijzen en tankstations
  { id: 'energy', name: 'Energy', icon: '/app-icons/energy.svg', preferAndroid: true, androidOnly: true, allowOther: true, halfScreen: true,
    storePackage: 'com.themobilecompany.Onderweg', options: [
      { id: 'anwb-onderweg', name: 'ANWB Onderweg', package: 'com.themobilecompany.Onderweg' },
    ] },
  // CarPlay: welke CarPlay-app er op de radio staat verschilt per radio; herkennen aan de naam. Volledig scherm.
  { id: 'carplay', name: 'CarPlay', icon: '/app-icons/carplay.svg', preferAndroid: true, androidOnly: true,
    hideWhenMissing: true, allowOther: true,
    detect: /carplay|zlink|autokit|carlink|cplink|autolink|tlink|smartlink|easyconnect|phonelink/i, options: [] },

  // --- Android-apps die je alleen ziet als ze geïnstalleerd zijn ---
  // Agenda, Berichten en Contacten: standaard de PandaOS-app met de gegevens van je telefoon; een Android-app kan ook
  { id: 'calendar', name: 'Calendar', icon: '/app-icons/calendar.svg', allowOther: true, options: [
      { id: 'google-calendar', name: 'Google Calendar', package: 'com.google.android.calendar' },
    ] },
  { id: 'contacts', name: 'Contacts', icon: '/app-icons/contacts.svg', allowOther: true, options: [] },
  { id: 'messages', name: 'Messages', icon: '/app-icons/messages.svg', allowOther: true, options: [
      { id: 'google-messages', name: 'Google Messages', package: 'com.google.android.apps.messaging' },
    ] },
  { id: 'zoom', name: 'Zoom', icon: '/app-icons/zoom.svg', preferAndroid: true, androidOnly: true,
    hideWhenMissing: true, options: [
      { id: 'zoom-android', name: 'Zoom', package: 'us.zoom.videomeetings' },
    ] },
  { id: 'tunein', name: 'TuneIn', icon: '/app-icons/tunein.svg', preferAndroid: true, androidOnly: true,
    hideWhenMissing: true, options: [
      { id: 'tunein-android', name: 'TuneIn', package: 'tunein.player' },
    ] },
  // Diagnose: logboek en Probleem melden (DiagnosticsApp.tsx)
  { id: 'diagnostics', name: 'Diagnostics', icon: '/app-icons/diagnostics.svg', options: [] },
  // Arcade: de PandaOS-pagina met alle games op de radio (ArcadeApp.tsx)
  { id: 'arcade', name: 'Arcade', icon: '/app-icons/arcade.svg', allowOther: true, options: [] },
  // Toybox: de PandaOS-speeltjes (ToyboxApp.tsx); een Android-app koppelen kan ook
  { id: 'toybox', name: 'Toybox', icon: '/app-icons/toybox.svg', allowOther: true, options: [
      { id: 'play-games', name: 'Google Play Games', package: 'com.google.android.play.games' },
    ] },

  // --- PandaOS-apps: standaard de eigen versie, een Android-app kiezen kan wel ---
  { id: 'music', name: 'Music', icon: '/app-icons/music.svg', allowOther: true, options: [] },
  // Nav: de PandaOS-kaart, of Google Maps/Waze/Flitsmeister half naast de auto (knop Volledig scherm)
  { id: 'maps', name: 'Nav', icon: '/app-icons/maps.svg', allowOther: true, panelFirst: true, halfScreen: true, options: [
    { id: 'google-maps', name: 'Google Maps', package: 'com.google.android.apps.maps' },
    { id: 'waze', name: 'Waze', package: 'com.waze' },
    { id: 'flitsmeister', name: 'Flitsmeister', package: 'nl.flitsmeister' },
  ] },
  // Telefoon: ook de Bluetooth-/beltelefoon-app van de radio (die regelt bellen via de telefoon; Android zelf niet)
  { id: 'phone', name: 'Phone', icon: '/app-icons/phone.svg', allowOther: true,
    detect: /bt ?phone|btphone|bluetooth|dialer|bellen|telefoon|handsfree|jancar.*(bt|phone)/i, options: [
    { id: 'google-phone', name: 'Google Phone', package: 'com.google.android.dialer' },
  ] },
  { id: 'camera', name: 'Camera', icon: '/app-icons/camera.svg', options: [] }, // achteruitrijcamera
  { id: 'dashcam', name: 'Rear camera', icon: '/app-icons/dashcam.svg', allowOther: true, options: [] },
  // Bluetooth: de Bluetooth-tab van PandaOS, of de Bluetooth-app van de radio (telefoon verbinden, muziek, bellen)
  { id: 'bluetooth', name: 'Bluetooth', icon: '/app-icons/bluetooth.svg', allowOther: true,
    detect: /bluetooth|bt ?music|bt ?phone|btmusic|btphone/i, options: [] },
  // Audio: de PandaOS Audio-instellingen (klank, balans, bronnen van de radio), of de audio-/DSP-app van de radio
  { id: 'audio', name: 'Audio', icon: '/app-icons/audio.svg', allowOther: true,
    detect: /\bdsp\b|equali[sz]er|\beq\b|audio ?settings|sound ?settings|geluid|amplifier|car ?audio/i, options: [] },
];

const findApp = (appId: string) => LINKABLE_APPS.find((a) => a.id === appId);
const toOption = (app: AndroidApp): AndroidAppOption => ({ id: PKG_PREFIX + app.package, name: app.name, package: app.package });

// Android-apps die je aan een PandaOS-app kunt koppelen en die echt op het apparaat staan:
// bekende apps plus automatisch herkende (bijv. CarPlay-apps)
export const getAvailableOptions = (app: LinkableApp, installed: AndroidApp[]): AndroidAppOption[] => {
  const packages = new Set(installed.map((a) => a.package));
  const known = app.options.filter((o) => o.package && packages.has(o.package));
  const knownPackages = new Set(known.map((o) => o.package));
  const detected = app.detect
    ? installed.filter((a) => !knownPackages.has(a.package) && (app.detect!.test(a.name) || app.detect!.test(a.package))).map(toOption)
    : [];
  return [...known, ...detected];
};

// Pakketnaam achter een koppeling (bekende optie of 'pkg:...')
const targetPackage = (app: LinkableApp | undefined, target: string): string | undefined => {
  if (target.startsWith(PKG_PREFIX)) return target.slice(PKG_PREFIX.length);
  return app?.options.find((o) => o.id === target)?.package;
};

// Keuzes in Settings > Apps: PandaOS (tenzij die op de radio niet bestaat), geïnstalleerde Android-apps,
// een zelf gekozen andere app, en Geen
export const getChoices = (app: LinkableApp, installed: AndroidApp[], currentTarget?: string) => {
  const available = getAvailableOptions(app, installed);
  const choices: AndroidAppOption[] = [
    ...(app.androidOnly && isAndroidLauncher() ? [] : [{ id: PANDAOS_TARGET, name: 'PandaOS' }]),
    ...available,
  ];
  // Zelf gekozen andere app die niet in de lijst staat (bijv. via "Andere app")
  if (currentTarget?.startsWith(PKG_PREFIX) && !choices.some((c) => c.id === currentTarget)) {
    const pkg = currentTarget.slice(PKG_PREFIX.length);
    const other = installed.find((a) => a.package === pkg);
    if (other) choices.push(toOption(other));
  }
  choices.push({ id: NONE_TARGET, name: 'None' });
  return choices;
};

export const otherAppTarget = (pkg: string) => PKG_PREFIX + pkg;

// Standaardkeuze als je zelf nog niets gekozen hebt: bij Android-apps de eerste geïnstalleerde app, anders PandaOS
const getDefaultTarget = (appId: string, installed: AndroidApp[]) => {
  const app = findApp(appId);
  if (!app) return PANDAOS_TARGET;
  if (app.preferAndroid || (app.androidOnly && isAndroidLauncher())) {
    const first = getAvailableOptions(app, installed)[0];
    if (first) return first.id;
  }
  return app.androidOnly && isAndroidLauncher() ? NONE_TARGET : PANDAOS_TARGET;
};

// Koppeling van een app, met standaardwaarden voor wat je (nog) niet zelf gekozen hebt
export const getAppLink = (links: Record<string, AppLink>, appId: string, installed = getInstalledAppList()): Required<AppLink> => ({
  enabled: links[appId]?.enabled ?? true,
  target: links[appId]?.target ?? getDefaultTarget(appId, installed),
});

// Wat een tik op het pictogram doet
export type LaunchAction =
  | { kind: 'android'; package: string; half?: boolean } // Android-app (half: venster naast de auto)
  | { kind: 'store'; package: string } // niet geïnstalleerd: Play Store (pictogram lichter)
  | { kind: 'pandaos' } // ingebouwde PandaOS-versie
  | { kind: 'none' } // gekoppeld aan "Geen": doet niets
  | { kind: 'hidden' }; // uitgeschakeld of (op de radio) niet geïnstalleerd: niet tonen

export const getLaunchAction = (links: Record<string, AppLink>, appId: string, installed = getInstalledAppList()): LaunchAction => {
  const app = findApp(appId);
  if (!app) return { kind: 'pandaos' }; // geen koppeling mogelijk (bijv. Settings, Bluetooth)
  const link = getAppLink(links, appId, installed);
  if (!link.enabled) return { kind: 'hidden' };
  if (links[appId]?.target === NONE_TARGET) return { kind: 'none' }; // zelf "Geen" gekozen

  if (!isAndroidLauncher()) return { kind: 'pandaos' }; // laptop/Pi: altijd de eigen versie

  // Nav op PandaOS: de eigen kaart. Gekozen Android-app (Waze, Google Maps ...): die app zelf, half naast de auto
  if (app.panelFirst && link.target === PANDAOS_TARGET) return { kind: 'pandaos' };
  const pkg = targetPackage(app, link.target);
  if (pkg && installed.some((a) => a.package === pkg)) return { kind: 'android', package: pkg, half: app.halfScreen };
  if (link.target === PANDAOS_TARGET && !app.androidOnly) return { kind: 'pandaos' };

  // De gekozen app staat er (nog) niet op
  if (app.storePackage) return { kind: 'store', package: app.storePackage };
  if (app.hideWhenMissing || app.androidOnly) return { kind: 'hidden' };
  return { kind: 'pandaos' };
};

export const isAppEnabled = (links: Record<string, AppLink>, appId: string, installed?: AndroidApp[]) =>
  getLaunchAction(links, appId, installed).kind !== 'hidden';

// Voert een Android-actie uit. true = afgehandeld (app of Play Store geopend, of "Geen");
// false = de aanroeper opent de PandaOS-versie.
export const runLaunchAction = (action: LaunchAction): boolean => {
  switch (action.kind) {
    case 'android': {
      let freeform = false;
      try { freeform = JSON.parse(bridge()?.getFreeformState?.() ?? '{}').supported === true; } catch { /* oud */ }
      if (action.half && freeform && bridge()?.launchAppHalf) {
        // Eerst schuift PandaOS het rechterpaneel in (auto naar links, zoals Instellingen, 0,4 s); daarna komt de app
        // precies in dat paneel: rechts 70 %, boven de dock (meet de dock op dat moment, dus ook na een andere hoogte)
        window.dispatchEvent(new CustomEvent('pandaos-half-app', { detail: action.package }));
        window.setTimeout(() => {
          const width = window.innerWidth;
          const dockTop = document.querySelector('footer')?.getBoundingClientRect().top ?? window.innerHeight;
          // kleur van het rechterpaneel: daarmee dekt de launcher het app-gebied af tot de app klaar staat
          const pane = document.querySelector('.tsl-content-pane')?.parentElement ?? document.body;
          const color = getComputedStyle(pane).backgroundColor;
          if (bridge().launchAppHalfColored) bridge().launchAppHalfColored(action.package, Math.round(width * 0.3), 0, width, Math.round(dockTop), color);
          else bridge().launchAppHalf(action.package, Math.round(width * 0.3), 0, width, Math.round(dockTop));
        }, 420);
        return true;
      }
      const ok = bridge()?.launchApp?.(action.package) === true;
      if (!ok) diag('warn', 'apps', `App openen mislukt: ${action.package}`);
      return ok;
    }
    case 'store':
      bridge()?.openPlayStore?.(action.package);
      return true;
    case 'none':
    case 'hidden':
      return true;
    default:
      return false;
  }
};

// Android-apps die bij een PandaOS-pictogram horen: alle keuzes in Settings > Apps (bekend, herkend of zelf gekozen),
// ongeacht welke er gekozen is. Die staan niet nog eens los in het app-menu, zodat er nooit twee Telefoon-,
// YouTube- of Nav-apps naast elkaar staan.
export const getPackagesBehindPandaOSIcons = (links: Record<string, AppLink>, installed: AndroidApp[]): Set<string> => {
  const packages = new Set<string>();
  LINKABLE_APPS.forEach((app) => {
    getAvailableOptions(app, installed).forEach((o) => o.package && packages.add(o.package));
    const target = links[app.id]?.target;
    if (target?.startsWith(PKG_PREFIX)) packages.add(target.slice(PKG_PREFIX.length));
  });
  return packages;
};

// Gekoppelde Android-app die echt geïnstalleerd is (voor "Volledig scherm" bij Nav, of de audio-app);
// undefined = PandaOS-versie of niets
export const getLinkedAndroidPackage = (links: Record<string, AppLink>, appId: string): string | undefined => {
  if (!isAndroidLauncher()) return undefined;
  const app = findApp(appId);
  const installed = getInstalledAppList();
  const link = getAppLink(links, appId, installed);
  if (!link.enabled) return undefined;
  const pkg = targetPackage(app, link.target);
  return pkg && installed.some((a) => a.package === pkg) ? pkg : undefined;
};

// Opent een Android-app (pakketnaam) uit het app-menu
export const launchAndroidPackage = (pkg: string) => bridge()?.launchApp?.(pkg) === true;
