import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ControlBar from '../../settings/control-bar/controlbar';
import Keyboard from '../../settings/Keyboard';
import Map from '../../navigation/Map'; 
import AudioSettings from '../../settings/AudioSettings'; 
import VolumePage from '../../settings/VolumePage';
import SidebarPane from './configuration/SidebarPane';
import RearCamera from './configuration/RearCamera';
import SystemNotification from '../../../notifications/SystemNotification';

// De geïmporteerde (losse) Apps!
import MusicApp from '../../music/MusicApp'; 
import WebAppContainer from '../../apps/WebAppContainer'; 
import SettingsApp from '../../../store/apps/SettingsApp';
import QuickActionsApp from '../../../store/apps/QuickActionsApp';
import VolumeOverlayApp from '../../../store/apps/VolumeOverlayApp';
import CarPlayApp from '../../../store/apps/CarPlayApp';
import PhoneApp, { CallOverlay } from '../../../store/apps/PhoneApp';
import CanMonitorApp from '../../../store/apps/CanMonitorApp';
import TheaterApp from '../../../store/apps/TheaterApp';
import PhoneDataApps from '../../../store/apps/PhoneDataApps';
import ArcadeApp from '../../../store/apps/ArcadeApp';
import ToyboxApp from '../../../store/apps/ToyboxApp';
import DiagnosticsApp from '../../../store/apps/DiagnosticsApp';

import { useUIStore, applyTextScale, textScaleFor, applyDockHeight } from '../../../store/uiStore';
import { CustomCommands } from '../../../scripts/customcmdcommands';
import { startTripComputer } from '../../../services/tripComputer';
import BootScreen from '../boot-screen/BootScreen';
import PandaPanel from '../../panel/PandaPanel';
import { PANDA_CONFIG, getEffectiveTheme } from '../../../../src/settings';
import { Lock, User, Maximize2, Wifi, WifiOff, Bluetooth, BluetoothOff, CheckCircle2, Sun, Moon, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning, BellRing } from 'lucide-react';
import { openPhoneWithNumber } from '../../../services/dialer';
import { useWeather, weatherKind, type WeatherKind } from '../../../services/weather';

const WEATHER_ICONS: Record<WeatherKind, React.FC<{ size?: number }>> = {
  clear: Sun, partly: CloudSun, cloudy: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning,
};
import { getLinkedAndroidPackage, launchAndroidPackage, isAndroidLauncher } from '../../../store/appLinks';
import { checkForUpdatesAtStartup } from '../../../services/updates';
import { useT } from '../../../i18n';
import './_splash-screen.scss';

const SplashScreen: React.FC = () => {
  const { 
    isMenuOpen, isMusicOpen, activeWebApp, isQuickActionsOpen, closeAll,
    initSocketListeners, initSpotify, screenMode, gear, brakeApplied,
    displaySettings, isCarPlayOpen, isMapOpen, isPhoneOpen, appLinks, vehicleLightsOn, isCameraOpen,
    isCanMonitorOpen, closeCanMonitor, vehicleSettings, isTheaterOpen, closeTheater, panelApp, closePanelApp, isArcadeOpen, closeArcade, isToyboxOpen, closeToybox, isDiagnosticsOpen, closeDiagnostics
  } = useUIStore();
  const t = useT();
  // Een andere app opent: de CAN-monitor gaat dicht (anders liggen ze over elkaar)
  useEffect(() => {
    if (isCanMonitorOpen && (isMenuOpen || isMusicOpen || isPhoneOpen || activeWebApp || isCarPlayOpen || isMapOpen)) closeCanMonitor();
  }, [isCanMonitorOpen, isMenuOpen, isMusicOpen, isPhoneOpen, activeWebApp, isCarPlayOpen, isMapOpen, closeCanMonitor]);
  // Zelfde voor Theater
  useEffect(() => {
    if (isTheaterOpen && (isMenuOpen || isMusicOpen || isPhoneOpen || activeWebApp || isCarPlayOpen || isMapOpen || isCanMonitorOpen)) closeTheater();
  }, [isTheaterOpen, isMenuOpen, isMusicOpen, isPhoneOpen, activeWebApp, isCarPlayOpen, isMapOpen, isCanMonitorOpen, closeTheater]);
  // Zelfde voor Arcade
  useEffect(() => {
    if (isArcadeOpen && (isMenuOpen || isMusicOpen || isPhoneOpen || activeWebApp || isCarPlayOpen || isMapOpen || isCanMonitorOpen || isTheaterOpen)) closeArcade();
  }, [isArcadeOpen, isMenuOpen, isMusicOpen, isPhoneOpen, activeWebApp, isCarPlayOpen, isMapOpen, isCanMonitorOpen, isTheaterOpen, closeArcade]);
  // Contacten/Agenda/Berichten dicht als er een andere app opent
  useEffect(() => {
    if (panelApp && (isMenuOpen || isMusicOpen || isPhoneOpen || activeWebApp || isCarPlayOpen || isMapOpen || isCanMonitorOpen || isTheaterOpen || isArcadeOpen || isToyboxOpen || isDiagnosticsOpen)) closePanelApp();
  }, [panelApp, isMenuOpen, isMusicOpen, isPhoneOpen, activeWebApp, isCarPlayOpen, isMapOpen, isCanMonitorOpen, isTheaterOpen, isArcadeOpen, isToyboxOpen, isDiagnosticsOpen, closePanelApp]);
  // Zelfde voor Toybox
  useEffect(() => {
    if (isToyboxOpen && (isMenuOpen || isMusicOpen || isPhoneOpen || activeWebApp || isCarPlayOpen || isMapOpen || isCanMonitorOpen || isTheaterOpen || isArcadeOpen)) closeToybox();
  }, [isToyboxOpen, isMenuOpen, isMusicOpen, isPhoneOpen, activeWebApp, isCarPlayOpen, isMapOpen, isCanMonitorOpen, isTheaterOpen, isArcadeOpen, closeToybox]);
  // Zelfde voor Diagnose
  useEffect(() => {
    if (isDiagnosticsOpen && (isMenuOpen || isMusicOpen || isPhoneOpen || activeWebApp || isCarPlayOpen || isMapOpen || isCanMonitorOpen || isTheaterOpen || isArcadeOpen || isToyboxOpen)) closeDiagnostics();
  }, [isDiagnosticsOpen, isMenuOpen, isMusicOpen, isPhoneOpen, activeWebApp, isCarPlayOpen, isMapOpen, isCanMonitorOpen, isTheaterOpen, isArcadeOpen, isToyboxOpen, closeDiagnostics]);
  // Android-app die half naast de auto geopend is (Nav/Energy, appLinks.runLaunchAction): knoppen Volledig scherm en Sluiten
  const [halfApp, setHalfApp] = useState<string | null>(null);
  useEffect(() => {
    const onHalf = (e: Event) => setHalfApp((e as CustomEvent<string | null>).detail);
    window.addEventListener('pandaos-half-app', onHalf);
    return () => window.removeEventListener('pandaos-half-app', onHalf);
  }, []);
  // Andere app of paneel in PandaOS geopend: de halve Android-app telt niet meer mee voor de indeling
  useEffect(() => {
    if (halfApp && (isMenuOpen || isMusicOpen || isPhoneOpen || isMapOpen || activeWebApp || isCarPlayOpen || isTheaterOpen || isArcadeOpen || isToyboxOpen || isDiagnosticsOpen || isCanMonitorOpen)) setHalfApp(null);
  }, [halfApp, isMenuOpen, isMusicOpen, isPhoneOpen, isMapOpen, activeWebApp, isCarPlayOpen, isTheaterOpen, isArcadeOpen, isToyboxOpen, isDiagnosticsOpen, isCanMonitorOpen]);
  // Android-app achter Nav (Google Maps/Waze); undefined = alleen de PandaOS-kaart
  const fullscreenNavApp = isMapOpen ? getLinkedAndroidPackage(appLinks, 'maps') : undefined;

  const [currentDate, setCurrentDate] = useState(new Date());
  // "Opgeslagen" na Done in het app-menu, 2 seconden
  const savedFlashAt = useUIStore((st) => st.savedFlashAt);
  const [savedFlash, setSavedFlash] = useState(false);
  useEffect(() => {
    if (!savedFlashAt) return;
    setSavedFlash(true);
    const timer = window.setTimeout(() => setSavedFlash(false), 2000);
    return () => window.clearTimeout(timer);
  }, [savedFlashAt]);

  // Wifi- en Bluetooth-status voor de statusbalk. Radio: via de launcher (elke 5 s); laptop/Pi: internet en de
  // Bluetooth-telefoon van de server.
  type LinkStatus = 'connected' | 'on' | 'off' | null;
  const [connectivity, setConnectivity] = useState<{ wifi: LinkStatus; bt: LinkStatus }>({ wifi: null, bt: null });
  const btConnectedAddress = useUIStore((s) => s.btConnectedAddress);
  useEffect(() => {
    const read = () => {
      const bridge = (window as any).PandaAndroid;
      if (!bridge?.getWifiState) {
        setConnectivity({ wifi: navigator.onLine ? 'connected' : 'off', bt: btConnectedAddress ? 'connected' : null });
        return;
      }
      try {
        const wifi = JSON.parse(bridge.getWifiState());
        const bt = JSON.parse(bridge.getBluetoothState());
        setConnectivity({
          wifi: !wifi.enabled ? 'off' : wifi.connected ? 'connected' : 'on',
          bt: !bt.available ? null : !bt.enabled ? 'off' : (bt.devices ?? []).some((d: { connected: boolean }) => d.connected) ? 'connected' : 'on',
        });
      } catch { /* geen status */ }
    };
    read();
    const timer = setInterval(read, 5000);
    return () => clearInterval(timer);
  }, [btConnectedAddress]);

  // App-menu: direct tonen/weghalen, of omhoog schuiven en bij sluiten terug omlaag (Settings > Display)
  const menuSlides = displaySettings?.appMenuAnimation === 'slide';
  const [quickActionsShown, setQuickActionsShown] = useState(isQuickActionsOpen);
  const [quickActionsClosing, setQuickActionsClosing] = useState(false);
  useEffect(() => {
    if (isQuickActionsOpen) { setQuickActionsClosing(false); setQuickActionsShown(true); return; }
    if (!menuSlides) { setQuickActionsShown(false); return; }
    setQuickActionsClosing(true);
    const timer = setTimeout(() => { setQuickActionsShown(false); setQuickActionsClosing(false); }, 220);
    return () => clearTimeout(timer);
  }, [isQuickActionsOpen, menuSlides]);

  // Real-time klok
  useEffect(() => {
    const clockInterval = setInterval(() => setCurrentDate(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  const formattedTime = currentDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: displaySettings?.timeFormat === '12h',
    // Gekozen tijdzone (Settings > Display), ook als Android zelf een andere zone heeft
    ...(displaySettings?.timeZone ? { timeZone: displaySettings.timeZone } : {}),
  });

  // Buitentemperatuur van de auto (CAN-kastje/OBD2); onbekend = niet tonen
  const outsideTemp = useUIStore((s) => s.carState.outsideTemp);
  // Geen thermometer van de auto: temperatuur van het weer (services/weather.ts)
  const weather = useWeather();
  const shownTemp = outsideTemp ?? weather?.temp ?? null;
  const currentTemp = shownTemp == null ? null
    : displaySettings?.temperature === 'F' ? `${Math.round(shownTemp * 9 / 5 + 32)} °F` : `${Math.round(shownTemp)} °C`;
  const WeatherIcon = weather ? WEATHER_ICONS[weatherKind(weather.code)] : null;

  // Bij het opstarten de gekozen app openen (App Settings in het app-menu). Eén keer, na het laden van de opgeslagen instellingen.
  useEffect(() => {
    const { appSettings, openMap, toggleMusic, openWebApp } = useUIStore.getState();
    if (appSettings.startup === 'nav') openMap();
    else if (appSettings.startup === 'music') {
      if (appSettings.defaultMusic === 'music') toggleMusic();
      else openWebApp(appSettings.defaultMusic);
    }
  }, []);

  useEffect(() => {
    // De PandaOS-server (laptop/Pi) draait niet op de radio: daar regelt de launcher Bluetooth, media enz.
    // Zonder deze check bleef hij eindeloos opnieuw verbinden ("server onderbroken").
    if (!isAndroidLauncher()) initSocketListeners();
    // Nieuwe PandaOS-versie op GitHub? Melding na het opstartscherm (Settings > Software > Automatisch controleren)
    const updateTimer = window.setTimeout(() => {
      const { appSettings, showNotification } = useUIStore.getState();
      if (appSettings.autoUpdateCheck !== false) checkForUpdatesAtStartup(showNotification);
    }, 8000);
    initSpotify();
    startTripComputer();
    CustomCommands.initInternalListener();

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.key === 'F2') window.open('/dev-console', 'PandaOS Console', 'width=600,height=450,resizable=yes');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.clearTimeout(updateTimer); };
  }, [initSocketListeners, initSpotify]);

  const theme = getEffectiveTheme(screenMode, vehicleLightsOn);
  const isDarkMode = theme === 'dark';

  // --- HELDERHEID EN NACHTFILTER (Settings > Display) ---
  // Auto: dag- of nachthelderheid, mee met licht/donker (verlichting van de auto, anders de klok).
  const brightness = displaySettings?.autoBrightness
    ? (isDarkMode ? (displaySettings?.nightBrightness ?? 60) : (displaySettings?.dayBrightness ?? 100))
    : (displaySettings?.brightness ?? 100);
  // Op de radio regelt Android de echte schermhelderheid; op laptop/Pi dimt een filter het beeld
  const androidBrightness = typeof (window as any).PandaAndroid?.setBrightness === 'function';
  useEffect(() => {
    if (!androidBrightness) return;
    const apply = () => (window as any).PandaAndroid.setBrightness(brightness);
    apply();
    // Opnieuw na terugkomen (bijv. uit het toestemmingsscherm): dan geldt hij meteen systeembreed
    document.addEventListener('visibilitychange', apply);
    return () => document.removeEventListener('visibilitychange', apply);
  }, [androidBrightness, brightness]);
  const screenFilter = [
    !androidBrightness && brightness < 100 ? `brightness(${brightness / 100})` : '',
    displaySettings?.nightFilter && isDarkMode ? 'sepia(0.3) saturate(0.85)' : ''
  ].filter(Boolean).join(' ') || 'none';

  // Op de radio: het PandaOS-toetsenbord in Android-apps krijgt dezelfde licht/donker-stand
  useEffect(() => {
    (window as any).PandaAndroid?.setUiTheme?.(isDarkMode);
  }, [isDarkMode]);

  // --- TEKSTGROOTTE (Settings > Display): alle tekst schaalt mee via --text-scale ---
  useEffect(() => {
    applyTextScale(textScaleFor(displaySettings?.textSize, displaySettings?.textScale));
    applyDockHeight(displaySettings?.dockHeight, displaySettings?.dockIconMode, displaySettings?.dockIconScale);
  }, [displaySettings?.textSize, displaySettings?.textScale, displaySettings?.dockHeight, displaySettings?.dockIconMode, displaySettings?.dockIconScale]);

  // --- UI SPLIT LOGICA ---
  const isParked = brakeApplied || gear === 'P';
  const isDriving = !isParked; 
  const isReverse = gear === 'R';
  // Camera: automatisch in R, of zelf geopend via het Camera-pictogram
  // In R alleen de PandaOS-camera als die gekozen is (Settings > Voertuig); anders doet de camera-app van de radio het
  const reverseCamera = vehicleSettings?.reverseCamera ?? ((window as any).PandaAndroid ? 'radio' : 'pandaos');
  const showCamera = (isReverse && reverseCamera === 'pandaos') || isCameraOpen;

  let leftWidth = '100%';
  let rightWidth = '0%';

  if (isDriving || showCamera) {
      leftWidth = '30%';
      rightWidth = '70%';
  } else {
      // Settings, Music, Phone en Nav openen naast de auto; web-apps en CarPlay schermvullend.
      if (isMenuOpen || isMusicOpen || isPhoneOpen || isMapOpen || isCanMonitorOpen || isTheaterOpen || isArcadeOpen || isToyboxOpen || isDiagnosticsOpen || panelApp || halfApp) {
          leftWidth = '30%';
          rightWidth = '70%';
      } else if (activeWebApp || isCarPlayOpen) {
          leftWidth = '0%';
          rightWidth = '100%';
      } else {
          leftWidth = '100%';
          rightWidth = '0%';
      }
  }

  // Vult de auto het hele scherm, dan heeft het rechterpaneel geen breedte. De statusbalk staat dan over de
  // volle breedte (versnelling en brandstof staan links in het autopaneel, dus er is geen overlap).
  const isCarFullscreen = leftWidth === '100%';
  const headerLeft = isCarFullscreen ? '0%' : leftWidth;
  const headerPaddingRight = '24px';

  // --- HEADER BACKGROUND KLEUR LOGICA VOOR RECHTER SCHERM ---
  let rightHeaderBg = 'transparent';
  if (isMenuOpen || isPhoneOpen || isCanMonitorOpen || isTheaterOpen || isArcadeOpen || isToyboxOpen || isDiagnosticsOpen || panelApp) rightHeaderBg = isDarkMode ? '#414141' : '#f0f0f0'; // gelijk aan Settings/Phone (Figma Menu Screens)
  else if (isMusicOpen) rightHeaderBg = isDarkMode ? '#1e1e1e' : '#f5f5f5'; // gelijk aan de achtergrond van MusicApp
  else if (activeWebApp || isCarPlayOpen || showCamera) rightHeaderBg = '#000000';
  // Boven de kaart: donker verloop met witte tekst (Figma "top nav with gradient"), leesbaar op een lichte kaart
  const isHeaderOnMap = rightHeaderBg === 'transparent' && (isDriving || isMapOpen);
  if (isHeaderOnMap) rightHeaderBg = 'linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0))';

  // --- OVERGANG TUSSEN APPS: oude app schuift weg, daarna schuift de nieuwe in ---
  // De oude app verdwijnt direct uit React zodra een andere opent. Daarom maken we vlak voor de wissel
  // (tijdens het renderen, de DOM toont dan nog de oude app) een kopie, en laten die wegschuiven.
  // Openen vanaf het startscherm blijft de gewone schuif van het paneel (breedte-overgang).
  const activeAppKey = isMenuOpen ? 'settings' : isMusicOpen ? 'music' : isPhoneOpen ? 'phone'
    : activeWebApp ? `web:${activeWebApp}` : isCarPlayOpen ? 'carplay' : null;
  const appsRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const lastAppKeyRef = useRef(activeAppKey);
  const snapshotRef = useRef<HTMLElement | null>(null);

  if (activeAppKey !== lastAppKeyRef.current && lastAppKeyRef.current && activeAppKey && appsRef.current && !snapshotRef.current) {
    const snapshot = appsRef.current.cloneNode(true) as HTMLElement;
    snapshot.querySelectorAll('iframe, video, canvas').forEach((el) => el.remove()); // niet opnieuw laden
    snapshotRef.current = snapshot;
  }

  useLayoutEffect(() => {
    const previous = lastAppKeyRef.current;
    lastAppKeyRef.current = activeAppKey;
    const snapshot = snapshotRef.current;
    snapshotRef.current = null;
    const apps = appsRef.current;
    const ghost = ghostRef.current;
    if (previous === activeAppKey || !activeAppKey || isReverse || !apps || !snapshot || !ghost) return;

    // Wisselen van app: eerst schuift de oude naar rechts weg (0,25 s), dan schuift de nieuwe van rechts in (0,35 s)
    ghost.replaceChildren(snapshot);
    apps.style.visibility = 'hidden';
    const slideOut = ghost.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }],
      { duration: 250, easing: 'cubic-bezier(0.7, 0, 0.84, 0)', fill: 'forwards' });
    slideOut.onfinish = () => {
      ghost.replaceChildren();
      slideOut.cancel();
      apps.style.visibility = '';
      apps.animate([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
        { duration: 350, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    };
  }, [activeAppKey, isReverse]);

  return (
    <div className={`tsl-splash-screen ${isDarkMode ? 'dark-mode' : 'light-mode'} ${PANDA_CONFIG.MODE === 'dev' ? 'dev-border' : ''}`}
      style={{ filter: screenFilter, transition: 'filter 0.4s ease' }}>
      
      {/* GLOBAL HEADER (Uitsluitend voor de rechterkant met tijd/weer/user) */}
      <header className="tsl-global-header" style={{
          display: halfApp ? 'none' : 'flex', // app half naast de auto: daarboven staat de statusbalk van Android
          position: 'absolute', top: 0, right: 0, left: headerLeft, zIndex: 90, // Begint vanaf rechter paneel (of volle breedte)
          justifyContent: 'flex-end', padding: `12px ${headerPaddingRight} 12px 24px`,
          // Witte tekst op donker: donker thema, boven de kaart, of boven een zwarte app (camera, web-app, CarPlay)
          pointerEvents: 'none', color: isDarkMode || isHeaderOnMap || rightHeaderBg === '#000000' ? '#fff' : '#000',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          transition: 'left 0.4s cubic-bezier(0.16, 1, 0.3, 1), padding 0.4s cubic-bezier(0.16, 1, 0.3, 1)' // Animate mee met de breedte
      }}>
          <div style={{ display: 'flex', gap: '24px', pointerEvents: 'auto', alignItems: 'center', fontWeight: '600', fontSize: 'calc(14px * var(--text-scale, 1))' }}>
              {/* Wifi en Bluetooth: gedimd = aan maar niet verbonden, doorgestreept = uit */}
              {connectivity.wifi !== null && (
                connectivity.wifi === 'off' ? <WifiOff size={16} style={{ opacity: 0.5 }} />
                  : <Wifi size={16} style={{ opacity: connectivity.wifi === 'connected' ? 1 : 0.4 }} />
              )}
              {connectivity.bt !== null && (
                connectivity.bt === 'off' ? <BluetoothOff size={16} style={{ opacity: 0.5 }} />
                  : <Bluetooth size={16} style={{ opacity: connectivity.bt === 'connected' ? 1 : 0.4 }} />
              )}
              {savedFlash && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={16} color="#3ba55d" /> {t('Saved')}</span>}
              {/* SOS: opent Telefoon met 112 ingevuld; bellen doet de bestuurder zelf (groene knop) */}
              <button aria-label={t('Emergency number')} onClick={() => openPhoneWithNumber('112')}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 14, border: 'none',
                  background: '#e82127', color: '#fff', fontWeight: 700, fontSize: 'calc(13px * var(--text-scale, 1))', cursor: 'pointer' }}>
                <BellRing size={14} /> SOS
              </button>
              <Lock size={16} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                 <User size={16} /> <span>{PANDA_CONFIG.MODE === 'dev' ? 'Developer' : 'Easy Entry'}</span>
              </div>
              <span style={{ color: '#ff4d4d', fontSize: 'calc(18px * var(--text-scale, 1))' }}>⏺</span> 
              <span>{formattedTime}</span>
              {currentTemp && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {WeatherIcon && (weatherKind(weather!.code) === 'clear' && !weather!.isDay ? <Moon size={16} /> : <WeatherIcon size={16} />)}
                  {currentTemp}
                </span>
              )}
          </div>
      </header>

      {/* SCHERM VERDELING */}
      <div className="tsl-split-view" style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
        
        {/* Linker Sidebar (klik hier sluit een open app/menu, net als klikken op de kaart) */}
        <div onClick={closeAll} style={{
            width: leftWidth, 
            transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)', 
            overflow: 'hidden',
            borderRight: leftWidth === '30%' ? `1px solid ${isDarkMode ? '#333' : '#ddd'}` : 'none',
            position: 'relative',
            zIndex: 2
        }}>
           <SidebarPane widthFraction={parseFloat(leftWidth) / 100} />
        </div>

        {/* Rechter Content Pane (Map klik zorgt voor closeAll) */}
        <div style={{ 
            width: rightWidth, 
            opacity: rightWidth === '0%' ? 0 : 1,
            transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease', 
            overflow: 'hidden',
            position: 'relative',
            zIndex: 1
        }}>
          {/* Klik op de kaart sluit open apps, maar niet de kaart zelf als je Navi gebruikt */}
          <main className="tsl-content-pane" onClick={() => { if (!isMapOpen) closeAll(); }} style={{ width: '100%', height: '100%', position: 'relative', cursor: 'default' }}>
            {/* Android-app half naast de auto: Android zet zelf een balk boven het venster met volledig scherm en sluiten */}
            
            {/* MAP: onderste laag, alleen zichtbaar tijdens rijden of als Nav open is (blijft gemount, Leaflet hoeft niet opnieuw te laden) */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1, visibility: (isDriving || isMapOpen) ? 'visible' : 'hidden' }}>
              <Map />
              {/* Nav gekoppeld aan Google Maps/Waze (Settings > Apps): die app volledig scherm openen */}
              {isMapOpen && fullscreenNavApp && (
                <button
                  onClick={(e) => { e.stopPropagation(); launchAndroidPackage(fullscreenNavApp); }}
                  style={{
                    position: 'absolute', right: 16, bottom: 28, zIndex: 500, display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 'calc(14px * var(--text-scale, 1))', fontWeight: 500,
                    // zelfde kaartjes-stijl als de knoppen rechts op de kaart
                    background: isDarkMode ? '#2b2b2b' : '#ffffff', color: isDarkMode ? '#ffffff' : '#171a20',
                    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.18)',
                  }}>
                  <Maximize2 size={18} /> {t('Full screen')}
                </button>
              )}
            </div>

            {/* DYNAMISCHE HEADER BACKGROUND VOOR APPS */}
            <div style={{ 
                position: 'absolute', top: 0, left: 0, right: 0, height: isHeaderOnMap ? '64px' : '50px',
                background: rightHeaderBg, zIndex: 5, transition: 'background 0.3s ease',
                pointerEvents: 'none'
            }} />

            {/* APPS WRAPPER: 50px offset om header vrij te houden */}
            {/* Zonder open app laat deze laag klikken door naar de kaart (anders werkt het Navi-zoekveld niet) */}
            <div ref={appsRef} style={{ position: 'absolute', top: '50px', left: 0, right: 0, bottom: 0, zIndex: 10,
              pointerEvents: (isMenuOpen || isMusicOpen || isPhoneOpen || activeWebApp || isCarPlayOpen || showCamera || isCanMonitorOpen || isTheaterOpen || isArcadeOpen || isToyboxOpen || isDiagnosticsOpen || panelApp) ? 'auto' : 'none' }}>
              {showCamera ? (
                 <RearCamera /> // automatisch in R, of via het Camera-pictogram
              ) : (
                 <>
                   <SettingsApp />
                   <MusicApp />
                   <WebAppContainer /> 
                   <CarPlayApp />
                   <PhoneApp />
                   <CanMonitorApp />
                   <TheaterApp />
                   <ArcadeApp />
                   <ToyboxApp />
                   <DiagnosticsApp />
                   <PhoneDataApps />
                 </>
              )}
            </div>

            {/* Kopie van de vorige app die uitfadet bij het wisselen (zie OVERGANG TUSSEN APPS) */}
            <div ref={ghostRef} style={{ position: 'absolute', inset: 0, zIndex: 11, pointerEvents: 'none' }} />

          </main>
        </div>
      </div>

      {/* BOTTOM BAR EN OVERLAYS */}
      <div className="tsl-bottom-container" style={{ position: 'relative', zIndex: 100 }}>
        <VolumeOverlayApp />
        <ControlBar />
      </div>

      <AudioSettings />
      <VolumePage />

      {quickActionsShown && (
        <div className={`quick-actions-wrapper ${menuSlides ? (quickActionsClosing ? 'qa-slide-out' : 'qa-slide-in') : ''}`} onClick={closeAll}>
          <div onClick={(e) => e.stopPropagation()}>
            <QuickActionsApp />
          </div>
        </div>
      )}

      <Keyboard />

      {/* Systeemmeldingen (pop-up bovenaan) en inkomende oproep / lopend gesprek, boven alles */}
      <SystemNotification />
      <CallOverlay />
      {/* PandaOS-paneel: veeg vanaf de bovenrand omlaag (op de radio) */}
      <PandaPanel />

      {/* Opstartscherm met het VW-logo, boven alles; verdwijnt na ruim 3 seconden */}
      <BootScreen />
    </div>
  );
};

export default SplashScreen;