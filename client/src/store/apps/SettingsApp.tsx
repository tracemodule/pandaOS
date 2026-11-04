// src/components/apps/SettingsApp.tsx
import React, { useEffect, useRef, useState } from 'react';
import { MY_VEHICLE, MY_VEHICLE_SETTINGS } from '../vehicleProfile';
import { useUIStore, type WindowTint, type ExhaustLayout, type CanBox, type CanProtocol, applyTextScale, textScaleFor } from '../../store/uiStore';
import { getEffectiveTheme, PANDA_CONFIG } from '../../settings';
import NavTree from '../../../src/components/settings/control-bar/navtree';
import { Smartphone, RotateCw, Signal, Search, Sun } from 'lucide-react';
import AndroidWifiPanel from '../../components/settings/AndroidWifiPanel';
import SoftwareUpdatePanel from '../../components/settings/SoftwareUpdatePanel';
import DiagnosticsPanel from '../../components/settings/DiagnosticsPanel';
import AndroidBluetoothPanel from '../../components/settings/AndroidBluetoothPanel';
import TeslaSlider from '../../components/settings/TeslaSlider';
import { useT } from '../../i18n';
import { LINKABLE_APPS, getAppLink, getChoices, useInstalledApps, isAndroidLauncher, otherAppTarget, getAndroidAppIcon, getLaunchAction,
  getAndroidAppName, isAndroidAppVisible, androidAppKey, getPackagesBehindPandaOSIcons } from '../appLinks';

const CLEAN_MODE_SECONDS = 15;
import { getVehicleModel } from '../../components/screen/splash-screen/configuration/vehicleModels';

// Uitlaatopstellingen voor Settings > Vehicle (3D-model)
const EXHAUST_OPTIONS: [ExhaustLayout, string][] = [
  ['left1', '1 left'], ['left2', '2 left'], ['right1', '1 right'],
  ['right2', '2 right'], ['both1', '1 left + 1 right'], ['both2', '2 left + 2 right'], ['center2', '2 in the middle'],
];

// CAN-bus (Settings > Vehicle): merk/type van het CAN-kastje en het voertuigprotocol
const CAN_BOXES: [CanBox, string][] = [
  ['radio', 'Same as radio'], ['raise', 'Raise (Ruizheng)'], ['hiworld', 'Hiworld (XinBasLink)'], ['simplesoft', 'Simple Soft'],
  ['oudi', 'Oudi'], ['binarytek', 'Binarytek'], ['luzheng', 'Luzheng'], ['other', 'Other'],
];
const CAN_PROTOCOLS: [CanProtocol, string][] = [
  ['vw-pq35', 'VW PQ35 (Golf 5/6, Jetta, Scirocco)'], ['vw-pq46', 'VW PQ46 (Passat B6/B7, CC)'],
  ['vw-mqb', 'VW MQB (Golf 7)'], ['other', 'Other'],
];

// Kleurkeuzes voor Settings > Vehicle
const PAINT_COLORS = [
  { name: 'White', hex: '#f2f2f2' },
  { name: 'Black', hex: '#111111' },
  { name: 'Silver', hex: '#9ea3a8' },
  { name: 'Grey', hex: '#4a4f55' },
  { name: 'Blue', hex: '#1f3fbf' },
  { name: 'Red', hex: '#b3121b' },
];
const RIM_COLORS = [
  { name: 'Black', hex: '#1a1a1a' },
  { name: 'Gunmetal', hex: '#4a4d50' },
  { name: 'Silver', hex: '#b8bcc0' },
  { name: 'Bronze', hex: '#8c6a3f' },
  { name: 'White', hex: '#e8e8e8' },
];

const SettingsApp: React.FC = () => {
  const { 
    isMenuOpen, activeTab, screenMode, setScreenMode, vehicleLightsOn, keyboardValue, openKeyboard,
    displaySettings, navigationSettings, vehicleSettings, updateVehicleSetting, safetySettings, updateSafetySetting,
    updateDisplaySetting, updateNavigationSetting,
    btDevices, isScanning, btStatusMessage, btRadioOn, startScan, turnOnBluetooth, btDiscoverable, makeDiscoverable,
    btKnownDevices, btConnectedAddress, forgetDevice, connectToDevice, disconnectDevice, isSocketReady,
    appLinks, updateAppLink, trips, resetTrip, carState, appSettings, updateAppSetting, openCanMonitor
  } = useUIStore();

  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const t = useT();
  const installedApps = useInstalledApps();
  // Android-apps die al achter een PandaOS-pictogram zitten (zelfde regel als het app-menu)
  const coveredByPandaOS = getPackagesBehindPandaOSIcons(appLinks, installedApps);
  // Settings > Apps: voor welke app de lijst "Andere app" open staat
  const [otherAppFor, setOtherAppFor] = useState<string | null>(null);
  const hasAndroidWifi = typeof (window as any).PandaAndroid?.openWifiSettings === 'function';

  // Media-info van Android-apps (Settings > Apps): opnieuw kijken als je terugkomt uit het toegangsscherm van Android
  const androidBridge = (window as any).PandaAndroid;
  const canAskMediaAccess = typeof androidBridge?.hasMediaAccess === 'function';
  const [hasMediaAccess, setHasMediaAccess] = useState<boolean>(() => !!androidBridge?.hasMediaAccess?.());
  // PandaOS-toetsenbord in Android-apps (Settings > Apps): opnieuw kijken als je terugkomt uit een Android-scherm
  const [keyboardState, setKeyboardState] = useState<{ enabled: boolean; default: boolean } | null>(null);
  const readKeyboardState = () => {
    try { setKeyboardState(JSON.parse((window as any).PandaAndroid?.getKeyboardState?.() ?? 'null')); } catch { /* geen status */ }
  };
  useEffect(() => {
    readKeyboardState();
    document.addEventListener('visibilitychange', readKeyboardState);
    return () => document.removeEventListener('visibilitychange', readKeyboardState);
  }, []);

  // Helderheid systeembreed (Settings > Display), zelfde idee
  const canAskBrightness = typeof androidBridge?.canSetSystemBrightness === 'function';
  const [hasSystemBrightness, setHasSystemBrightness] = useState<boolean>(() => !!androidBridge?.canSetSystemBrightness?.());
  useEffect(() => {
    if (!canAskBrightness) return;
    const update = () => setHasSystemBrightness(!!androidBridge.canSetSystemBrightness());
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [canAskBrightness, androidBridge]);

  useEffect(() => {
    if (!canAskMediaAccess) return;
    const update = () => setHasMediaAccess(!!androidBridge.hasMediaAccess());
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [canAskMediaAccess, androidBridge]);

  // Internetstatus voor de Wi-Fi-tab
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Uitleg onder Appearance: waar Auto zijn thema op dit moment vandaan haalt
  const autoSourceText = vehicleLightsOn === null
    ? t('No light signal from the car: switches by time (dark 19:00–06:00).')
    : t(vehicleLightsOn ? 'Following your car lights: lights on (night).' : 'Following your car lights: lights off (day).');
  const hasScanned = useRef(false);

  // Zorgt ervoor dat Bluetooth alleen scant als het menu open is op de Bluetooth tab
  useEffect(() => {
    if (isMenuOpen && activeTab === 'Bluetooth' && isSocketReady) {
      if (!hasScanned.current) {
        hasScanned.current = true;
        startScan();
      }
    } else if (!isMenuOpen || activeTab !== 'Bluetooth') {
      hasScanned.current = false;
    }
  }, [isMenuOpen, activeTab, isSocketReady, startScan]);

  // Aftellen van de zichtbaarheid (Pi: 3 minuten; Windows: zolang het instellingenscherm open is, dus geen timer)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!btDiscoverable.until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [btDiscoverable.until]);
  const discoverableSecondsLeft = btDiscoverable.until ? Math.max(0, Math.ceil((btDiscoverable.until - now) / 1000)) : null;
  const isDiscoverable = btDiscoverable.on && (discoverableSecondsLeft === null || discoverableSecondsLeft > 0);

  // Screen Clean Mode: scherm 15 s zwart en ongevoelig voor aanraking, zodat je het kunt schoonmaken
  const [cleanModeUntil, setCleanModeUntil] = useState<number | null>(null);
  useEffect(() => {
    if (!cleanModeUntil) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= cleanModeUntil) setCleanModeUntil(null);
    }, 250);
    return () => clearInterval(timer);
  }, [cleanModeUntil]);
  const cleanModeSecondsLeft = cleanModeUntil ? Math.max(0, Math.ceil((cleanModeUntil - now) / 1000)) : 0;

  // --- TEKSTGROOTTE: kiezen = meteen voorvertoning, OK = opslaan, Annuleren = terug naar wat er was ---
  type TextSize = 'Standard' | 'Large' | 'Custom';
  const savedTextSize = (displaySettings?.textSize ?? 'Standard') as TextSize;
  const savedTextScale = displaySettings?.textScale ?? 1.1;
  const [pendingText, setPendingText] = useState<{ size: TextSize; scale: number } | null>(null);
  const shownTextSize = pendingText?.size ?? savedTextSize;
  const shownCustomScale = pendingText?.size === 'Custom' ? pendingText.scale : savedTextScale;

  const previewText = (size: TextSize, scale: number) => {
    setPendingText({ size, scale });
    applyTextScale(textScaleFor(size, scale));
  };
  const handleTextSizeClick = (opt: string) => {
    const size = opt as TextSize;
    if (size === shownTextSize && size !== 'Custom') return;
    previewText(size, size === 'Custom' ? shownCustomScale : 1);
  };
  const confirmTextSize = () => {
    if (!pendingText) return;
    updateDisplaySetting('textSize', pendingText.size);
    if (pendingText.size === 'Custom') updateDisplaySetting('textScale', pendingText.scale);
    setPendingText(null);
  };
  const cancelTextSize = () => {
    applyTextScale(textScaleFor(savedTextSize, savedTextScale));
    setPendingText(null);
  };
  // Settings dicht zonder OK: niet opslaan
  useEffect(() => {
    if (!isMenuOpen && pendingText) cancelTextSize();
  }, [isMenuOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rij ronde kleurvakjes (lak / velgen); het actieve vakje krijgt een blauwe ring (stijl: _tesla-ui.scss)
  const renderSwatches = (colors: { name: string; hex: string }[], current: string, onPick: (hex: string) => void) => (
    <div className="tsl-swatches">
      {colors.map(({ name, hex }) => (
        <button key={hex} className={`tsl-swatch ${current.toLowerCase() === hex.toLowerCase() ? 'is-active' : ''}`} onClick={() => onPick(hex)}>
          <span className="tsl-swatch-color" style={{ backgroundColor: hex }} />
          {name}
        </button>
      ))}
    </div>
  );

  // Figma "Toggles"/tabs: kader met rand, actief vak wit (licht) of grijs (donker). Vanaf 4 opties volle breedte.
  const renderToggleGroup = (settingKey: any, options: any[], updateFn: Function, currentValue: any, customClick?: Function) => (
    <div className={`tsl-segmented ${options.length > 3 ? 'is-wide' : ''}`}>
      {options.map(opt => (
        <button
          key={opt}
          className={currentValue === opt ? 'is-active' : ''}
          onClick={() => customClick ? customClick(opt) : updateFn(settingKey, opt)}
        >
          {t(opt)}
        </button>
      ))}
    </div>
  );

  return (
    <div 
      className={`settings-overlay-container tsl-ui ${isDarkMode ? 'dark-mode' : ''}`}
      style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
        display: 'flex', 
        flexDirection: 'column', 
        // Geen eigen slide meer: het rechterpaneel groeit (SplashScreen) en duwt de auto opzij.
        visibility: isMenuOpen ? 'visible' : 'hidden',
        pointerEvents: isMenuOpen ? 'auto' : 'none',
        transition: 'visibility 0.4s',
        zIndex: 50,
        backgroundColor: 'var(--tsl-bg)' // Figma Menu Screens: #F0F0F0 licht, #414141 donker
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* --- UNIFIED TOP HEADER --- */}
      <header style={{ 
        display: 'flex', alignItems: 'center', height: 'var(--settings-header-height)', flexShrink: 0, width: '100%',
        color: isDarkMode ? '#fff' : '#000'
      }}>
        {/* Linker header: Zoekbalk */}
        <div style={{ width: 'var(--settings-sidebar-width)', padding: '0 var(--settings-gutter)', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--tsl-btn-secondary)', borderRadius: '4px', padding: '10px 14px' }}>
            <Search size={18} color="var(--tsl-muted)" style={{ marginRight: '10px' }} />
            <input 
              type="text" placeholder={t('Search Settings')}
              value={keyboardValue} onFocus={() => openKeyboard(keyboardValue)} readOnly
              style={{ border: 'none', background: 'transparent', width: '100%', color: isDarkMode ? '#fff' : '#000', outline: 'none', fontSize: 'calc(15px * var(--text-scale, 1))', fontWeight: '500' }}
            />
          </div>
        </div>

      </header>

      {/* --- MAIN CONTENT (Links Sidebar, Rechts Content) --- */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Sidebar Navigatie */}
        <div className="settings-left-sidebar" style={{ width: 'var(--settings-sidebar-width)', flexShrink: 0, overflow: 'hidden' }}>
          <NavTree />
        </div>

        {/* Rechter Tab Content */}
        <div className="settings-right-content tsl-scroll" style={{ flex: 1, minWidth: 0, padding: 'var(--settings-content-padding)', overflowY: 'auto', overflowX: 'hidden' }}>
          <div className="settings-body" style={{ color: isDarkMode ? '#fff' : '#000', maxWidth: '600px' }}>
            
            {/* --- VEHICLE TAB: uiterlijk van de 3D-auto --- */}
            {activeTab === 'Vehicle' && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '35px' }}>
                 {/* Automaat, handgeschakeld, of automatisch herkennen: wat de auto doorgeeft (CAN-kastje/OBD2) */}
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Transmission')}</span>
                   {renderToggleGroup('transmission', ['Automatic', 'Manual', 'Detect'], () => {}, vehicleSettings.transmission,
                     (opt: 'Automatic' | 'Manual' | 'Detect') => updateVehicleSetting('transmission', opt))}
                   <small className="tsl-hint">
                     {vehicleSettings.transmission === 'Detect'
                       ? (carState.detectedTransmission
                           ? `${t('The car reports:')} ${t(carState.detectedTransmission)}.`
                           : t('No data from the car yet: shows P, R, N and D.'))
                       : vehicleSettings.transmission === 'Manual'
                         ? t('Shows P, R and D. The gear (1–6) needs OBD2.')
                         : t('Shows P, R, N and D.')}
                   </small>
                 </div>
                 <hr className="tsl-divider" />
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Paint')}</span>
                   {renderSwatches(PAINT_COLORS, vehicleSettings.paintColor, (hex) => updateVehicleSetting('paintColor', hex))}
                 </div>
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Wheels')}</span>
                   {renderSwatches(RIM_COLORS, vehicleSettings.rimColor, (hex) => updateVehicleSetting('rimColor', hex))}
                 </div>
                 <hr className="tsl-divider" />
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Window Tint')}</span>
                   {renderToggleGroup('windowTint', ['None', 'Light', 'Medium', 'Dark', 'Limo'], () => {}, vehicleSettings.windowTint,
                     (opt: WindowTint) => updateVehicleSetting('windowTint', opt))}
                   <small className="tsl-hint">{t('Rear doors and tailgate only. Windshield and front side windows always stay clear.')}</small>
                 </div>
                 <hr className="tsl-divider" />
                 {/* Koplampen, spiegels en grill op het 3D-model, zoals bij je eigen auto */}
                 {([
                   ['headlightType', 'Headlights', [['halogen', 'Halogen'], ['xenon', 'Xenon']], 'halogen'],
                   ['mirrors', 'Mirrors', [['body', 'Body color'], ['black', 'Black'], ['carbon', 'Carbon']], 'body'],
                   ['grille', 'Grille', [['standard', 'Standard'], ['black', 'Gloss black'], ['chrome', 'Chrome'], ['body', 'Body color'], ['carbon', 'Carbon']], 'standard'],
                 ] as const).map(([key, title, options, fallback]) => (
                   <div key={key} className="tsl-section">
                     <span className="tsl-title">{t(title)}</span>
                     <div className={`tsl-segmented ${options.length > 3 ? 'is-wide' : ''}`}>
                       {options.map(([id, label]) => (
                         <button key={id} className={(vehicleSettings[key] ?? fallback) === id ? 'is-active' : ''}
                           onClick={() => updateVehicleSetting(key, id as never)}>{t(label)}</button>
                       ))}
                     </div>
                   </div>
                 ))}
                 {/* Uitlaat op het 3D-model, zoals bij je eigen auto */}
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Exhaust')}</span>
                   <div className="tsl-segmented is-wide" style={{ flexWrap: 'wrap', height: 'auto' }}>
                     {EXHAUST_OPTIONS.map(([id, label]) => (
                       <button key={id} style={{ flex: '1 0 30%', minHeight: 42 }}
                         className={(vehicleSettings.exhaust ?? 'left1') === id ? 'is-active' : ''}
                         onClick={() => updateVehicleSetting('exhaust', id)}>{t(label)}</button>
                     ))}
                   </div>
                 </div>
              </div>
            )}

            {/* --- GEAVANCEERD: je eigen auto en de CAN-bus --- */}
            {activeTab === 'Advanced' && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '35px' }}>
                 {/* Mijn auto: PandaOS staat standaard op deze auto ingesteld (vehicleProfile.ts) */}
                 <div className="tsl-section">
                   <span className="tsl-title">{t('My car')}</span>
                   <div className="tsl-list">
                     {([
                       ['Car', `${MY_VEHICLE.name} (${MY_VEHICLE.year})`],
                       ['Color', t(MY_VEHICLE.color)],
                       ['Engine', t(MY_VEHICLE.engine)],
                       ['Fuel', `${t(MY_VEHICLE.fuel)} · ${MY_VEHICLE.tank} l`],
                       ['Transmission', t(MY_VEHICLE.transmission)],
                       ['Tyres', MY_VEHICLE.tyres],
                       ['Engine oil', `${MY_VEHICLE.oil} · ${t(MY_VEHICLE.oilInterval)}`],
                       ['Service', t(MY_VEHICLE.service)],
                       ['CAN protocol', MY_VEHICLE.canProtocol],
                     ] as [string, string][]).map(([label, value]) => (
                       <div key={label} className="tsl-list-row">
                         <span className="tsl-field-text" style={{ flex: 1 }}>{t(label)}</span>
                         <span className="tsl-hint">{value}</span>
                       </div>
                     ))}
                   </div>
                   <button className="tsl-btn" style={{ alignSelf: 'flex-start' }}
                     onClick={() => Object.entries(MY_VEHICLE_SETTINGS).forEach(([key, value]) => updateVehicleSetting(key as any, value as never))}>
                     {t('Apply settings of my car')}
                   </button>
                   <small className="tsl-hint">{t('Resets transmission, CAN bus, headlights, mirrors, grille, exhaust and paint to match this car.')}</small>
                 </div>
                 <hr className="tsl-divider" />
                 {/* CAN-bus: twee verbindingen. Kastje <-> radio (merk/type) en auto <-> kastje (voertuigprotocol).
                     Moet overeenkomen met wat in de fabrieksinstellingen van de radio staat. */}
                 <div className="tsl-section">
                   <span className="tsl-title">{t('CAN bus')}</span>
                   <span className="tsl-field-text">{t('CAN box (box ↔ radio)')}</span>
                   <div className="tsl-segmented is-wide" style={{ flexWrap: 'wrap', height: 'auto' }}>
                     {CAN_BOXES.map(([id, label]) => (
                       <button key={id} style={{ flex: '1 0 24%', minHeight: 42 }}
                         className={(vehicleSettings.canbox ?? 'radio') === id ? 'is-active' : ''}
                         onClick={() => updateVehicleSetting('canbox', id)}>{t(label)}</button>
                     ))}
                   </div>
                   <span className="tsl-field-text">{t('Vehicle protocol (car ↔ box)')}</span>
                   <div className="tsl-segmented is-wide" style={{ flexWrap: 'wrap', height: 'auto' }}>
                     {CAN_PROTOCOLS.map(([id, label]) => (
                       <button key={id} style={{ flex: '1 0 45%', minHeight: 42 }}
                         className={(vehicleSettings.canProtocol ?? 'vw-pq35') === id ? 'is-active' : ''}
                         onClick={() => updateVehicleSetting('canProtocol', id)}>{t(label)}</button>
                     ))}
                   </div>
                   <small className="tsl-hint">{t('Choose the same CAN box and protocol as in the factory settings of the radio (code 1234). Not sure? Leave it on "Same as radio" and use the CAN monitor to find out.')}</small>
                   <button className="tsl-btn" style={{ alignSelf: 'flex-start' }} onClick={openCanMonitor}>{t('Open CAN monitor')}</button>
                 </div>
              </div>
            )}

            {/* --- DISPLAY TAB --- */}
            {activeTab === 'Display' && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '35px' }}>
                 {/* Taal: de namen staan altijd in hun eigen taal, zodat je ze ook herkent als de verkeerde taal aan staat */}
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('Language')}</label>
                   <div className="tsl-segmented">
                     {([['nl', 'Nederlands'], ['en', 'English']] as const).map(([id, name]) => (
                       <button key={id} className={displaySettings.language === id ? 'is-active' : ''}
                         onClick={() => updateDisplaySetting('language', id)}>{name}</button>
                     ))}
                   </div>
                 </div>

                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('Appearance')}</label>
                   {renderToggleGroup('screenMode', ['Light', 'Dark', 'Auto'], () => {}, screenMode.charAt(0).toUpperCase() + screenMode.slice(1),
                     (opt: string) => setScreenMode(opt.toLowerCase() as 'light' | 'dark' | 'auto'))}
                   {screenMode === 'auto' && (
                     <small className="tsl-hint">{autoSourceText}</small>
                   )}
                 </div>

                 {/* Figma Display: schakelaar voor warmere kleuren 's nachts */}
                 <label className="tsl-switch-row">
                   <input type="checkbox" className="tsl-toggle" checked={!!displaySettings?.nightFilter}
                     onChange={(e) => updateDisplaySetting('nightFilter', e.target.checked)} />
                   <div className="tsl-switch-text">
                     <span className="tsl-field-text">{t('Night Filter')}</span>
                     <small className="tsl-hint">{t('Automatically adjust to warmer colors at night')}</small>
                   </div>
                 </label>

                 {/* Figma Display: Brightness-regel met Auto-knop. Auto = aparte dag- en nachthelderheid, die wisselt
                     met Weergave (licht/donker): stadslicht/dimlicht aan = nacht, anders de klok. */}
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Brightness')}</span>
                   {displaySettings?.autoBrightness ? (
                     <>
                       {([['dayBrightness', 'Day', 100], ['nightBrightness', 'Night', 60]] as const).map(([key, label, fallback], i) => (
                         <div key={key} className="tsl-slider-row" style={{ alignItems: 'center' }}>
                           <span className="tsl-field-text" style={{ width: 64 }}>{t(label)}</span>
                           <TeslaSlider
                             value={displaySettings?.[key] ?? fallback} min={10} max={100} step={5}
                             format={(v) => `${v}%`}
                             iconLeft={<Sun size={18} />} iconRight={<Sun size={24} />}
                             onChange={(v) => updateDisplaySetting(key, v)}
                           />
                           {i === 0 ? (
                             <button className="tsl-btn is-primary" onClick={() => updateDisplaySetting('autoBrightness', false)}>Auto</button>
                           ) : <span style={{ minWidth: 76 }} />}
                         </div>
                       ))}
                       <small className="tsl-hint">
                         {t(isDarkMode ? 'Now using night brightness' : 'Now using day brightness')} · {autoSourceText}
                       </small>
                     </>
                   ) : (
                     <div className="tsl-slider-row">
                       <TeslaSlider
                         value={displaySettings?.brightness ?? 80} min={10} max={100} step={5}
                         format={(v) => `${v}%`}
                         iconLeft={<Sun size={18} />} iconRight={<Sun size={24} />}
                         onChange={(v) => updateDisplaySetting('brightness', v)}
                       />
                       <button className="tsl-btn" onClick={() => updateDisplaySetting('autoBrightness', true)}>Auto</button>
                     </div>
                   )}
                   {/* Op de radio: zonder deze toestemming geldt de helderheid alleen binnen PandaOS */}
                   {canAskBrightness && !hasSystemBrightness && (
                     <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                       <small className="tsl-hint" style={{ flex: 1 }}>{t('Brightness now only applies inside PandaOS. Allow it to also apply in other apps.')}</small>
                       <button className="tsl-btn is-small" onClick={() => androidBridge.openBrightnessPermission()}>{t('Allow access')}</button>
                     </div>
                   )}
                 </div>

                 <button className="tsl-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setCleanModeUntil(Date.now() + CLEAN_MODE_SECONDS * 1000)}>
                   Screen Clean Mode
                 </button>

                 <hr className="tsl-divider" />

                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('Text Size')}</label>
                   {renderToggleGroup('textSize', ['Standard', 'Large', 'Custom'], updateDisplaySetting, shownTextSize, handleTextSizeClick)}
                   {/* Handmatig: schuifbalk, verandert de tekst meteen (voorvertoning) */}
                   {shownTextSize === 'Custom' && (
                     <div className="tsl-slider-row">
                       <TeslaSlider
                         value={Math.round(shownCustomScale * 100)} min={85} max={140} step={5}
                         format={(v) => `${v}%`}
                         iconLeft={<span style={{ fontSize: 13, fontWeight: 600 }}>A</span>}
                         iconRight={<span style={{ fontSize: 20, fontWeight: 600 }}>A</span>}
                         onChange={(v) => previewText('Custom', v / 100)}
                       />
                     </div>
                   )}
                   {/* Bevestigen of terugzetten */}
                   {pendingText && (
                     <div className="tsl-section" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                       <span className="tsl-hint" style={{ flex: 1 }}>{t('Keep this text size?')}</span>
                       <button className="tsl-btn is-small" onClick={cancelTextSize}>{t('Cancel')}</button>
                       <button className="tsl-btn is-small is-primary" onClick={confirmTextSize}>OK</button>
                     </div>
                   )}
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('Time')}</label>
                   {renderToggleGroup('timeFormat', ['12 Hour', '24 Hour'], updateDisplaySetting, displaySettings?.timeFormat === '12h' ? '12 Hour' : '24 Hour',
                     (opt: string) => updateDisplaySetting('timeFormat', opt === '12 Hour' ? '12h' : '24h'))}
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('Energy Display')}</label>
                   {renderToggleGroup('energyDisplay', ['Percentage', 'Distance'], updateDisplaySetting, displaySettings?.energyDisplay)}
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('Distance')}</label>
                   {renderToggleGroup('distance', ['Kilometers', 'Miles'], updateDisplaySetting, displaySettings?.distance)}
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('Temperature')}</label>
                   {renderToggleGroup('temperature', ['°C', '°F'], updateDisplaySetting, `°${displaySettings?.temperature}`,
                     (opt: string) => updateDisplaySetting('temperature', opt.replace('°', '')))}
                 </div>
              </div>
            )}

            {/* --- SAFETY: snelheidswaarschuwing (snelheid via GPS; de maximumsnelheid van de weg komt uit kaartgegevens) --- */}
            {activeTab === 'Safety' && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                 <label className="tsl-switch-row">
                   <input type="checkbox" className="tsl-toggle" checked={safetySettings.speedWarning}
                     onChange={(e) => updateSafetySetting('speedWarning', e.target.checked)} />
                   <div className="tsl-switch-text">
                     <span className="tsl-field-text">{t('Speed Limit Warning')}</span>
                     <small className="tsl-hint">{t('Warns you when you drive faster than the speed limit.')}</small>
                   </div>
                 </label>

                 <div className="tsl-section">
                   <span className="tsl-title">{t('Warn Above Limit')}</span>
                   {renderToggleGroup('speedWarningOffset', ['+0 km/h', '+5 km/h', '+10 km/h'], () => {}, `+${safetySettings.offset} km/h`,
                     (opt: string) => updateSafetySetting('offset', parseInt(opt.replace('+', ''), 10)))}
                 </div>

                 <div className="tsl-section">
                   <span className="tsl-title">{t('Warning')}</span>
                   {renderToggleGroup('speedWarningType', ['Display', 'Chime'], () => {}, safetySettings.chime ? 'Chime' : 'Display',
                     (opt: string) => updateSafetySetting('chime', opt === 'Chime'))}
                   <small className="tsl-hint">{t('Display: your speed turns red. Chime: also plays a sound.')}</small>
                 </div>

                 <label className="tsl-switch-row">
                   <input type="checkbox" className="tsl-toggle" checked={safetySettings.showSpeedLimit}
                     onChange={(e) => updateSafetySetting('showSpeedLimit', e.target.checked)} />
                   <div className="tsl-switch-text">
                     <span className="tsl-field-text">{t('Show Speed Limit')}</span>
                     <small className="tsl-hint">{t('Shows the speed limit sign next to your speed while driving.')}</small>
                   </div>
                 </label>
              </div>
            )}

            {/* --- NAVIGATION TAB --- */}
            {activeTab === 'Navigation' && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Navigation Volume')}</span>
                   <TeslaSlider value={Number(navigationSettings.volume)} min={0} max={100} step={1}
                     format={(v) => `${v}%`} onChange={(v) => updateNavigationSetting('volume', v)} />
                 </div>

                 <hr className="tsl-divider" />

                 {/* Vermijden: gaat mee naar de routeplanner (OSRM) bij de volgende route */}
                 {([
                   ['avoidMotorways', 'Avoid Motorways'],
                   ['avoidTolls', 'Avoid Tolls'],
                   ['avoidFerries', 'Avoid Ferries'],
                 ] as const).map(([key, label]) => (
                   <label key={key} className="tsl-switch-row">
                     <input type="checkbox" className="tsl-toggle" checked={navigationSettings[key]}
                       onChange={(e) => updateNavigationSetting(key, e.target.checked)} />
                     <div className="tsl-switch-text">
                       <span className="tsl-field-text">{t(label)}</span>
                     </div>
                   </label>
                 ))}
                 <small className="tsl-hint">{t('Applies to the next route you plan.')}</small>
              </div>
            )}

            {/* --- TRIPS: ritcomputer via GPS (huidige rit, Trip A, Trip B) --- */}
            {activeTab === 'Trips' && (() => {
              const useMiles = displaySettings?.distance === 'Miles';
              const unit = useMiles ? 'mi' : 'km';
              const speedUnit = useMiles ? 'mph' : 'km/h';
              const toUnit = (km: number) => (useMiles ? km / 1.609344 : km);
              const formatDriveTime = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
              return (
                <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <small className="tsl-hint">{t('Measured with GPS. Counts only while the car is moving.')}</small>
                  {([['current', 'Current Drive'], ['tripA', 'Trip A'], ['tripB', 'Trip B']] as const).map(([key, title], i) => {
                    const trip = trips[key];
                    const avgKmh = trip.driveTime > 0 ? (trip.distance / 1000) / (trip.driveTime / 3600) : 0;
                    return (
                      <React.Fragment key={key}>
                        {i > 0 && <hr className="tsl-divider" />}
                        <div className="tsl-section">
                          <div className="tsl-title-row">
                            <span className="tsl-title">{t(title)}</span>
                            {key !== 'current' && <button className="tsl-link" onClick={() => resetTrip(key)}>{t('Reset')}</button>}
                          </div>
                          <div className="tsl-list">
                            {[
                              ['Distance', `${toUnit(trip.distance / 1000).toFixed(1)} ${unit}`],
                              ['Drive Time', formatDriveTime(trip.driveTime)],
                              ['Average Speed', `${Math.round(toUnit(avgKmh))} ${speedUnit}`],
                              ['Top Speed', `${Math.round(toUnit(trip.maxSpeed))} ${speedUnit}`],
                              ...(key !== 'current' ? [['Since', new Date(trip.startedAt).toLocaleDateString(displaySettings.language === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })]] : []),
                            ].map(([label, value]) => (
                              <div key={label} className="tsl-list-row">
                                <span className="tsl-field-text" style={{ flex: 1 }}>{t(label)}</span>
                                <span className="tsl-hint">{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              );
            })()}

            {/* --- APPS TAB: per app aan/uit en welke app hij opent --- */}
            {activeTab === 'Apps' && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <small className="tsl-hint">{t('Choose which app each PandaOS app opens. On the radio, your installed Android apps appear here.')}</small>
                {/* Alleen op de radio: toegang om te zien wat er speelt in Spotify, YouTube enz. (mediakaart en Music) */}
                {canAskMediaAccess && (
                  <div className="tsl-section">
                    <span className="tsl-field-text">{t('Media info from Android apps')}</span>
                    {hasMediaAccess ? (
                      <small className="tsl-hint">{t('On: PandaOS shows and controls what is playing in your Android apps.')}</small>
                    ) : (
                      <>
                        <button className="tsl-btn is-primary" style={{ alignSelf: 'flex-start' }}
                          onClick={() => androidBridge.openMediaAccessSettings()}>{t('Allow access')}</button>
                        <small className="tsl-hint">{t('Turn on PandaOS in the Android screen that opens, then come back.')}</small>
                      </>
                    )}
                  </div>
                )}
                {LINKABLE_APPS.map((app) => {
                  const link = getAppLink(appLinks, app.id, installedApps);
                  const choices = getChoices(app, installedApps, link.target);
                  const canPickOther = app.allowOther && isAndroidLauncher() && installedApps.length > 0;
                  // Niet geïnstalleerd (en niet zelf "Geen" gekozen): het pictogram opent de Play Store
                  const launch = getLaunchAction(appLinks, app.id, installedApps);
                  const missingStorePackage = launch.kind === 'store' ? launch.package : undefined;
                  // Aan, maar geen app gevonden (bijv. geen CarPlay-app op deze radio): verborgen in menu en dock
                  const missingHidden = link.enabled && launch.kind === 'hidden';
                  return (
                    <div key={app.id} className="tsl-section">
                      <label className="tsl-switch-row">
                        <img src={app.icon} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain' }} />
                        <div className="tsl-switch-text" style={{ flex: 1 }}>
                          <span className="tsl-field-text">{t(app.name)}</span>
                        </div>
                        <input type="checkbox" className="tsl-toggle" checked={link.enabled}
                          onChange={(e) => updateAppLink(app.id, { enabled: e.target.checked })} />
                      </label>
                      {link.enabled && (
                        <div className={`tsl-segmented ${choices.length + (canPickOther ? 1 : 0) > 3 ? 'is-wide' : ''}`}>
                          {choices.map((choice) => (
                            <button key={choice.id} className={link.target === choice.id && !missingStorePackage && !missingHidden ? 'is-active' : ''}
                              onClick={() => { updateAppLink(app.id, { target: choice.id }); setOtherAppFor(null); }}>{t(choice.name)}</button>
                          ))}
                          {canPickOther && (
                            <button className={otherAppFor === app.id ? 'is-active' : ''}
                              onClick={() => setOtherAppFor(otherAppFor === app.id ? null : app.id)}>{t('Other app…')}</button>
                          )}
                        </div>
                      )}
                      {link.enabled && missingStorePackage && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <small className="tsl-hint" style={{ flex: 1 }}>{t('Not installed. Tapping the icon opens the Play Store.')}</small>
                          <button className="tsl-btn is-small"
                            onClick={() => (window as any).PandaAndroid?.openPlayStore(missingStorePackage)}>{t('Install')}</button>
                        </div>
                      )}
                      {missingHidden && (
                        <small className="tsl-hint">{canPickOther
                          ? t('No matching app found on this device, so it is hidden. Pick one with Other app.')
                          : t('Not found on this device, so it is hidden.')}</small>
                      )}
                      {/* CarPlay: vanzelf openen zodra je telefoon via Bluetooth verbindt (bij het opstarten of later) */}
                      {app.id === 'carplay' && link.enabled && isAndroidLauncher() && (
                        <label className="tsl-switch-row">
                          <div className="tsl-switch-text" style={{ flex: 1 }}>
                            <span className="tsl-field-text">{t('Open automatically')}</span>
                            <small className="tsl-hint">{t('Opens CarPlay as soon as your phone connects via Bluetooth. Off: open it yourself.')}</small>
                          </div>
                          <input type="checkbox" className="tsl-toggle" checked={!!appLinks.carplay?.autoOpen}
                            onChange={(e) => updateAppLink('carplay', { autoOpen: e.target.checked })} />
                        </label>
                      )}
                      {/* Alle geïnstalleerde apps van de radio, bijv. de CarPlay- of audio-app van de fabrikant */}
                      {link.enabled && otherAppFor === app.id && (
                        <div className="tsl-list" style={{ maxHeight: 240, overflowY: 'auto' }}>
                          {installedApps.map((other) => {
                            const target = otherAppTarget(other.package);
                            return (
                              <div key={other.package} className={`tsl-list-row ${link.target === target ? 'is-active' : ''}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => { updateAppLink(app.id, { target }); setOtherAppFor(null); }}>
                                <img src={getAndroidAppIcon(other.package)} alt="" style={{ width: 28, height: 28, borderRadius: 6 }} />
                                <div className="tsl-list-text">
                                  <span className="tsl-field-text">{other.name}</span>
                                  <small className="tsl-hint">{other.package}</small>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Toetsenbord in Android-apps (Chrome, YouTube ...): het PandaOS-toetsenbord of dat van Android */}
                {isAndroidLauncher() && (
                  <div className="tsl-section">
                    <span className="tsl-title">{t('Keyboard')}</span>
                    {keyboardState?.default ? (
                      <small className="tsl-hint">{t('The PandaOS keyboard is used in all apps.')}</small>
                    ) : (
                      <>
                        <button className="tsl-btn is-primary" style={{ alignSelf: 'flex-start' }}
                          onClick={() => { (window as any).PandaAndroid?.usePandaKeyboard(); setTimeout(readKeyboardState, 800); }}>
                          {t('Use PandaOS keyboard')}
                        </button>
                        <small className="tsl-hint">
                          {keyboardState?.enabled
                            ? t('Choose "PandaOS-toetsenbord" in the list that opens.')
                            : t('Turn on "PandaOS-toetsenbord" in the Android screen that opens, come back and tap the button again.')}
                        </small>
                      </>
                    )}
                  </div>
                )}

                {/* Paneel bij omlaag vegen vanaf de bovenrand: PandaOS of Android */}
                {isAndroidLauncher() && (
                  <div className="tsl-section">
                    <span className="tsl-title">{t('Panel')}</span>
                    <div className="tsl-segmented">
                      {(['pandaos', 'android'] as const).map((choice) => (
                        <button key={choice} className={(appSettings.panel ?? 'pandaos') === choice ? 'is-active' : ''}
                          onClick={() => updateAppSetting('panel', choice)}>{choice === 'pandaos' ? 'PandaOS' : 'Android'}</button>
                      ))}
                    </div>
                    <small className="tsl-hint">
                      {(appSettings.panel ?? 'pandaos') === 'android'
                        ? t('Swiping down from the top opens the Android panel.')
                        : (window as any).PandaAndroid?.isDeviceOwner?.()
                          ? t('Swiping down from the top opens the PandaOS panel. The Android panel is turned off.')
                          : t('Swiping down from the top opens the PandaOS panel. To turn off the Android panel completely, PandaOS must be device owner (once via ADB, see the handover document).')}
                    </small>
                  </div>
                )}

                {/* Overige Android-apps van de radio: aan = zichtbaar in het app-menu, uit = verborgen */}
                {/* Apps die al achter een PandaOS-pictogram zitten (bijv. Calendar) hebben hierboven hun eigen schakelaar */}
                {isAndroidLauncher() && installedApps.length > 0 && (
                  <div className="tsl-section">
                    <span className="tsl-title">{t('Android apps')}</span>
                    <small className="tsl-hint">{t('Choose which Android apps appear in the app menu.')}</small>
                    <div className="tsl-list">
                      {installedApps.filter((app) => !coveredByPandaOS.has(app.package)).map((app) => (
                        <label key={app.package} className="tsl-switch-row">
                          <img src={getAndroidAppIcon(app.package)} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain' }} />
                          <div className="tsl-switch-text" style={{ flex: 1 }}>
                            <span className="tsl-field-text">{t(getAndroidAppName(app))}</span>
                          </div>
                          <input type="checkbox" className="tsl-toggle" checked={isAndroidAppVisible(appLinks, app.package)}
                            onChange={(e) => updateAppLink(androidAppKey(app.package), { enabled: e.target.checked })} />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* --- SOFTWARE TAB --- */}
            {activeTab === 'Software' && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                 {/* PandaOS-info en makers */}
                 <div className="tsl-section">
                   <span className="tsl-title" style={{ fontSize: 'calc(24px * var(--text-scale, 1))' }}>PandaOS</span>
                   <span className="tsl-field-text">{t('Version')} {PANDA_CONFIG.VERSION}</span>
                   <span className="tsl-field-text">{t('Made by David Cotino')}</span>
                 </div>

                 <hr className="tsl-divider" />

                 {/* Software-update via GitHub Releases */}
                 <SoftwareUpdatePanel />

                 <hr className="tsl-divider" />

                 {/* Diagnose: logboek en Probleem melden */}
                 <DiagnosticsPanel />

                 <hr className="tsl-divider" />

                 <div className="tsl-section">
                   <span className="tsl-title">{t('About')}</span>
                   <div className="tsl-list">
                     {[
                       ['Platform', /Android/i.test(navigator.userAgent) ? 'Android' : /Linux/i.test(navigator.userAgent) ? 'Linux (Raspberry Pi)' : 'Windows'],
                       ['Screen', `${window.screen.width} × ${window.screen.height}`],
                       ['Map data', 'PDOK / Kadaster'],
                       ['Routing', 'OSRM (OpenStreetMap)'],
                     ].map(([label, value]) => (
                       <div key={label} className="tsl-list-row">
                         <span className="tsl-field-text" style={{ flex: 1 }}>{t(label)}</span>
                         <span className="tsl-hint">{value}</span>
                       </div>
                     ))}
                   </div>
                 </div>

                 {/* Licenties: PandaOS (GPL-3.0) en het 3D-model (CC-BY 4.0) vragen om een vermelding; klein onderaan */}
                 <small className="tsl-hint" style={{ fontSize: 'calc(11px * var(--text-scale, 1))', opacity: 0.7 }}>
                   {t('Based on PandaOS (GPL-3.0) · 3D model "Volkswagen Golf 6" by GT Cars: Hyperspeed (CC-BY 4.0)')}
                 </small>
              </div>
            )}

            {/* --- BLUETOOTH TAB --- */}
            {/* Op de radio: eigen Bluetooth-scherm op de Bluetooth van Android (geen PandaOS-server) */}
            {activeTab === 'Bluetooth' && isAndroidLauncher() && <AndroidBluetoothPanel />}

            {/* Laptop/Pi: Bluetooth via de PandaOS-server */}
            {activeTab === 'Bluetooth' && !isAndroidLauncher() && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="tsl-section">
                  <span className="tsl-title">{t('Visibility')}</span>
                  {/* Zichtbaar maken: dan kun je vanaf je telefoon met PandaOS koppelen. Primair (blauw) zolang zichtbaar. */}
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button className={`tsl-btn ${isDiscoverable ? 'is-primary' : ''}`} onClick={makeDiscoverable} disabled={!isSocketReady || btRadioOn === false}>
                      {isDiscoverable
                        ? `${t('Visible as')} ${btDiscoverable.name}${discoverableSecondsLeft !== null ? ` · ${Math.floor(discoverableSecondsLeft / 60)}:${String(discoverableSecondsLeft % 60).padStart(2, '0')}` : ''}`
                        : t('Make Discoverable')}
                    </button>
                    {btRadioOn === false && (
                      <button className="tsl-btn is-primary" onClick={turnOnBluetooth} disabled={isScanning}>{t('Turn On Bluetooth')}</button>
                    )}
                  </div>
                  <small className="tsl-hint" style={{ color: isSocketReady && btRadioOn !== false ? undefined : 'var(--tsl-red)' }}>{btStatusMessage}</small>
                </div>

                {/* Eerder verbonden telefoons: direct verbinden, zonder te zoeken */}
                {btKnownDevices.length > 0 && (
                  <>
                    <hr className="tsl-divider" />
                    <div className="tsl-section">
                      <span className="tsl-title">{t('My Devices')}</span>
                      <div className="tsl-list">
                        {btKnownDevices.map((device) => {
                          const isConnected = btConnectedAddress === device.address;
                          return (
                            <div className={`tsl-list-row ${isConnected ? 'is-active' : ''}`} key={device.address}>
                              <Smartphone size={22} />
                              <div className="tsl-list-text">
                                <span className="tsl-field-text">{device.name}</span>
                                <small className="tsl-hint">{isConnected ? t('Connected') : t('Not connected')}{device.mac ? ` · ${device.mac}` : ''}</small>
                              </div>
                              <button className="tsl-link" onClick={() => forgetDevice(device.address)}>{t('Forget')}</button>
                              {isConnected
                                ? <button className="tsl-btn is-small" onClick={() => disconnectDevice(device.address)}>{t('Disconnect')}</button>
                                : <button className="tsl-btn is-small is-primary" onClick={() => connectToDevice(device.address)} disabled={!isSocketReady}>{t('Connect')}</button>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                <hr className="tsl-divider" />

                <div className="tsl-section">
                  <div className="tsl-title-row">
                    <span className="tsl-title">{t('Nearby Devices')}</span>
                    <button className="tsl-link" onClick={() => isSocketReady && startScan()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <RotateCw size={16} className={isScanning ? 'spin-animation' : ''} /> {t('Refresh')}
                    </button>
                  </div>
                  <div className="tsl-list">
                    {btDevices.filter((device) => !btKnownDevices.some((k) => k.address === device.address)).map((device, index) => (
                      <div className={`tsl-list-row ${device.connected ? 'is-active' : ''}`} key={device.address || index}>
                        <Smartphone size={22} />
                        <div className="tsl-list-text">
                          <span className="tsl-field-text">{device.name || t('Unknown Device')}</span>
                          <small className="tsl-hint">{device.connected ? `${t('Connected')} · ` : device.paired ? `${t('Paired')} · ` : ''}{device.mac || device.address}</small>
                        </div>
                        {device.connected
                          ? <button className="tsl-btn is-small" onClick={() => disconnectDevice(device.address)}>{t('Disconnect')}</button>
                          : <button className="tsl-btn is-small is-primary" onClick={() => connectToDevice(device.address)}>{t('Connect')}</button>}
                      </div>
                    ))}
                  </div>
                  <small className="tsl-hint">{t('Before we add your device, be sure it is turned on and discoverable.')}</small>
                </div>
              </div>
            )}

            {/* --- WI-FI TAB --- */}
            {/* Op de radio: eigen Wi-Fi-scherm (zoeken, verbinden, vergeten) */}
            {activeTab === 'Wi-Fi' && isAndroidLauncher() && <AndroidWifiPanel />}
            {activeTab === 'Wi-Fi' && !isAndroidLauncher() && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                 {/* Echte verbindingsstatus van het apparaat. Netwerken kiezen gebeurt in het Wi-Fi-scherm van Android
                     (via de launcher, window.PandaAndroid); een webpagina kan zelf geen wifi-netwerken zien. */}
                 <div className="tsl-section">
                   <div className="tsl-list">
                     <div className={`tsl-list-row ${isOnline ? 'is-active' : ''}`}>
                       <Signal size={22} />
                       <div className="tsl-list-text">
                         <span className="tsl-field-text">{t('Internet')}</span>
                         <small className="tsl-hint" style={{ color: isOnline ? undefined : 'var(--tsl-red)' }}>
                           {isOnline ? t('Connected') : t('Not connected')}
                         </small>
                       </div>
                     </div>
                   </div>
                 </div>

                 <div className="tsl-section">
                   <button className="tsl-btn is-primary" style={{ alignSelf: 'flex-start' }} disabled={!hasAndroidWifi}
                     onClick={() => (window as any).PandaAndroid?.openWifiSettings()}>{t('Open Wi-Fi Settings')}</button>
                   <small className="tsl-hint">
                     {hasAndroidWifi
                       ? t('Choose a network or hotspot in the Android Wi-Fi screen.')
                       : t('On the radio this opens the Android Wi-Fi screen. On this device, use its own Wi-Fi settings.')}
                   </small>
                 </div>
              </div>
            )}

            {/* --- DEFAULT TAB CATCH-ALL --- */}
            {/* --- MAINTENANCE: voertuiginformatie en onderhoud (gegevens komen uit OBD2) --- */}
            {activeTab === 'Maintenance' && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <small className="tsl-hint">{t('OBD2 adapter not connected. The values below appear once the adapter is plugged in.')}</small>

                <div className="tsl-section">
                  <span className="tsl-title">{t('Vehicle')}</span>
                  <div className="tsl-list">
                    {[
                      ['Model', getVehicleModel(vehicleSettings.model).name],
                      ['Transmission', t(vehicleSettings.transmission === 'Detect' ? (carState.detectedTransmission ?? 'Detect') : vehicleSettings.transmission)],
                      ['VIN', '—'],
                      ['Odometer', '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="tsl-list-row">
                        <span className="tsl-field-text" style={{ flex: 1 }}>{t(label)}</span>
                        <span className="tsl-hint">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="tsl-section">
                  <span className="tsl-title">{t('Engine & Diagnostics')}</span>
                  <div className="tsl-list">
                    {[
                      ['Fault codes (check engine)', '—'],
                      ['Coolant temperature', '—'],
                      ['Battery voltage', '—'],
                      ['Fuel level', '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="tsl-list-row">
                        <span className="tsl-field-text" style={{ flex: 1 }}>{t(label)}</span>
                        <span className="tsl-hint">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="tsl-btn" disabled>{t('Read Fault Codes')}</button>
                    <button className="tsl-btn" disabled>{t('Clear Fault Codes')}</button>
                  </div>
                </div>
              </div>
            )}

            {!['Vehicle', 'Bluetooth', 'Display', 'Safety', 'Navigation', 'Wi-Fi', 'Software', 'Maintenance'].includes(activeTab) && (
              <>
                <div className="settings-section-title" style={{ fontSize: 'calc(11px * var(--text-scale, 1))', textTransform: 'uppercase', color: 'var(--tsl-muted)', fontWeight: 'bold', marginBottom: '16px' }}>HIGHLIGHTED FEATURES</div>
                <div className="settings-row" style={{ padding: '20px 0', borderBottom: `1px solid var(--tsl-border)` }}>
                  <p style={{ margin: 0, fontWeight: 'bold' }}>Field Text <span className="highlight" style={{ color: 'var(--tsl-blue-link)', float: 'right' }}>Display</span></p>
                  <small style={{ color: 'var(--tsl-muted)', display: 'block', marginTop: '4px' }}>{t('Automatically adjust to warmer colors at night')}</small>
                </div>
              </>
            )}

          </div>
        </div>
      </div>

      {/* --- SCREEN CLEAN MODE: zwart scherm dat aanraking negeert; dubbeltik stopt eerder --- */}
      {cleanModeUntil && (
        <div onDoubleClick={() => setCleanModeUntil(null)} onPointerDown={(e) => e.stopPropagation()}
          style={{ position: 'fixed', inset: 0, zIndex: 5000, backgroundColor: '#000', color: '#757575',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', userSelect: 'none' }}>
          <span style={{ fontSize: 'calc(18px * var(--text-scale, 1))', fontWeight: 600 }}>{t('Screen Clean Mode')}</span>
          <span style={{ fontSize: 'calc(14px * var(--text-scale, 1))' }}>{cleanModeSecondsLeft} s · dubbeltik om te stoppen</span>
        </div>
      )}

    </div>
  );
};

export default SettingsApp;