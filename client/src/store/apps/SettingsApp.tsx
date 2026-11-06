// src/components/apps/SettingsApp.tsx
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MY_VEHICLE_SETTINGS } from '../vehicleProfile';
import { useUIStore, type WindowTint, type ExhaustLayout, type CanBox, type CanProtocol, applyTextScale, textScaleFor } from '../../store/uiStore';
import { getEffectiveTheme, PANDA_CONFIG } from '../../settings';
import NavTree from '../../../src/components/settings/control-bar/navtree';
import { Smartphone, RotateCw, Signal, Search, Sun, Palette, Lightbulb, Zap, Video, X, Trash2, CarFront, Activity, Cpu, Radio as RadioIcon } from 'lucide-react';
import AndroidWifiPanel from '../../components/settings/AndroidWifiPanel';
import SoftwareUpdatePanel from '../../components/settings/SoftwareUpdatePanel';
import WebViewPanel from '../../components/settings/WebViewPanel';
import HomeScreenPanel from '../../components/settings/HomeScreenPanel';
import PermissionsPanel from '../../components/settings/PermissionsPanel';
import TripsPanel from '../../components/settings/TripsPanel';
import ReleaseNotes from '../../components/settings/ReleaseNotes';
import { PlacePickerModal } from '../../components/navigation/PlacePicker';
import { PLACE_KINDS, PLACE_ICONS } from '../../components/navigation/MapPlaces';
import '../../components/navigation/_map.scss';
import AndroidBluetoothPanel from '../../components/settings/AndroidBluetoothPanel';
import TeslaSlider from '../../components/settings/TeslaSlider';
import Colouriser from '../../components/settings/Colouriser';
import VehicleHero from '../../components/settings/VehicleHero';
import RadioSystemPanel from '../../components/settings/RadioSystemPanel';
import DateTimePanel from '../../components/settings/DateTimePanel';
import LanguagePanel from '../../components/settings/LanguagePanel';
import IconTiles, { type IconTile, ColorDot, TintIcon, ExhaustIcon, ManualIcon } from '../../components/settings/IconTiles';
import { SETTINGS_INDEX } from '../settingsIndex';
import { useT } from '../../i18n';
import { LINKABLE_APPS, getAppLink, getChoices, useInstalledApps, isAndroidLauncher, otherAppTarget, getAndroidAppIcon, getLaunchAction,
  getAndroidAppName, isAndroidAppVisible, androidAppKey, getPackagesBehindPandaOSIcons } from '../appLinks';

const CLEAN_MODE_SECONDS = 15;
import { getVehicleModel } from '../../components/screen/splash-screen/configuration/vehicleModels';

// Uitlaatopstellingen voor Settings > Vehicle (3D-model)
const EXHAUST_OPTIONS: [ExhaustLayout, string][] = [
  ['left1', '1 left'], ['left2', '2 left'], ['right1', '1 right'],
  ['right2', '2 right'], ['both1', '1 left + 1 right'], ['both2', '2 left + 2 right'], ['center2', '2 in the middle'], ['none', 'None'],
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
  { name: 'Green', hex: '#1e5f3a' },
];
const RIM_COLORS = [
  { name: 'Black', hex: '#1a1a1a' },
  { name: 'Gunmetal', hex: '#4a4d50' },
  { name: 'Silver', hex: '#b8bcc0' },
  { name: 'White', hex: '#e8e8e8' },
];

const SettingsApp: React.FC = () => {
  const { 
    isMenuOpen, activeTab, screenMode, setScreenMode, vehicleLightsOn, keyboardValue, openKeyboard, closeKeyboard, setActiveTab,
    displaySettings, navigationSettings, vehicleSettings, updateVehicleSetting, safetySettings, updateSafetySetting,
    updateDisplaySetting, updateNavigationSetting,
    btDevices, isScanning, btStatusMessage, btRadioOn, startScan, turnOnBluetooth, btDiscoverable, makeDiscoverable,
    btKnownDevices, btConnectedAddress, forgetDevice, connectToDevice, disconnectDevice, isSocketReady,
    appLinks, updateAppLink, carState, appSettings, updateAppSetting, openCanMonitor
  } = useUIStore();

  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const t = useT();
  const installedApps = useInstalledApps();
  // Android-apps die al achter een PandaOS-pictogram zitten (zelfde regel als het app-menu)
  const coveredByPandaOS = getPackagesBehindPandaOSIcons(appLinks, installedApps);
  // Settings > Apps: voor welke app de lijst "Andere app" open staat
  const [otherAppFor, setOtherAppFor] = useState<string | null>(null);
  const [editingToken, setEditingToken] = useState(false); // Mapbox-token invoeren
  const [editingPlate, setEditingPlate] = useState(false); // kenteken invoeren
  const [pickingPlace, setPickingPlace] = useState<'home' | 'work' | null>(null); // Navigatie: Thuis/Werk zoeken
  const [confirmClearDrives, setConfirmClearDrives] = useState(false);
  // Release notes / handleiding (link bij Software-update), over de hele Instellingen-pagina
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  useEffect(() => {
    const open = () => setReleaseNotesOpen(true);
    window.addEventListener('pandaos-release-notes', open);
    return () => window.removeEventListener('pandaos-release-notes', open);
  }, []);
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

  // --- Instellingen zoeken: het zoekveld gebruikt het PandaOS-toetsenbord; resultaten vervangen de pagina ---
  const [searching, setSearching] = useState(false);
  const [colouriserOpen, setColouriserOpen] = useState<false | 'paint' | 'rims'>(false);
  // Software > Weergave: Standaard verbergt CAN, CAN-monitor, voertuigprotocol en grafische kwaliteit
  const advancedMode = useUIStore((st) => (st.displaySettings?.uiMode ?? 'advanced') === 'advanced');
  const [confirmGraphics, setConfirmGraphics] = useState<'High' | 'Low' | null>(null); // Voertuig > Grafische kwaliteit: Ja/Nee
  const [editColor, setEditColor] = useState<{ hex: string; list: 'customPaints' | 'customRims' } | null>(null); // eigen kleur: naam/verwijderen
  const [confirmApplyCar, setConfirmApplyCar] = useState(false); // Geavanceerd > Instellingen van mijn auto: Ja/Nee
  const [radioSettingsOpen, setRadioSettingsOpen] = useState(false); // Geavanceerd > Radio-instellingen
  // Software > Build: {debugBuild, developer} van de launcher; null = geen radio of oude launcher
  const [buildInfo, setBuildInfo] = useState<{ debugBuild: boolean; developer: boolean } | null>(() => {
    try { return JSON.parse((window as any).PandaAndroid?.getBuildInfo?.() ?? 'null'); } catch { return null; }
  });
  useEffect(() => { setSearching(false); }, [activeTab, isMenuOpen]);
  const query = searching ? keyboardValue.trim().toLowerCase() : '';
  const searchResults = query.length >= 2
    ? Object.entries(SETTINGS_INDEX).flatMap(([tab, labels]) => [tab, ...labels]
        .filter((label) => label.toLowerCase().includes(query) || t(label).toLowerCase().includes(query))
        .map((label) => ({ tab, label })))
        .filter((r, i, all) => all.findIndex((o) => o.tab === r.tab && t(o.label) === t(r.label)) === i)
    : null;
  const openResult = (tab: string) => { setSearching(false); closeKeyboard(); setActiveTab(tab); };

  // Rij ronde kleurvakjes (lak / velgen); het actieve vakje krijgt een blauwe ring (stijl: _tesla-ui.scss)
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
              value={searching ? keyboardValue : ''} onFocus={() => { if (!searching) { setSearching(true); openKeyboard(''); } else openKeyboard(keyboardValue); }} readOnly
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
            {/* Zoekresultaten: tik op een resultaat om naar die pagina te gaan */}
            {searchResults && (
              <div className="tsl-section">
                <span className="tsl-title">{t('Search results')}</span>
                {searchResults.length === 0 && <small className="tsl-hint">{t('Nothing found.')}</small>}
                {searchResults.map(({ tab, label }) => (
                  <button key={tab + label} className="tsl-search-result" onClick={() => openResult(tab)}>
                    <span className="tsl-field-text">{t(label)}</span>
                    <small className="tsl-hint">{t(tab)}</small>
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: searchResults ? 'none' : undefined }}>
            
            {/* --- VEHICLE TAB: uiterlijk van de 3D-auto --- */}
            {activeTab === 'Vehicle' && (() => {
              // Keuzetegels zoals Figma Controls (IconTiles): icoon in het midden, tekst eronder; geen tussenlijnen
              const paint = vehicleSettings.paintColor;
              // Vaste kleuren, dan de Kleurenkiezer, dan je eigen bewaarde kleuren
              const colorTile = ({ name, hex }: { name: string; hex: string }): IconTile => ({ id: hex.toLowerCase(), label: t(name), icon: <ColorDot color={hex} /> });
              // Eigen kleur: eigen naam (of "Eigen kleur"); lang indrukken = hernoemen of verwijderen. Standaardkleuren niet.
              const ownTile = (hex: string, list: 'customPaints' | 'customRims'): IconTile => ({
                id: hex.toLowerCase(), icon: <ColorDot color={hex} />,
                label: vehicleSettings.colorNames?.[hex.toLowerCase()] || t('Own colour'),
                onLongPress: () => { setEditColor({ hex: hex.toLowerCase(), list }); openKeyboard(vehicleSettings.colorNames?.[hex.toLowerCase()] ?? ''); },
              });
              const paintTiles: IconTile[] = [
                ...PAINT_COLORS.map(colorTile),
                { id: 'colouriser', label: t('Colouriser'), icon: <Palette size={24} />, onClick: () => setColouriserOpen('paint') },
                ...(vehicleSettings.customPaints ?? []).map((hex) => ownTile(hex, 'customPaints')),
              ];
              const rimTiles: IconTile[] = [
                ...RIM_COLORS.map(colorTile),
                { id: 'colouriser', label: t('Colouriser'), icon: <Palette size={24} />, onClick: () => setColouriserOpen('rims') },
                ...(vehicleSettings.customRims ?? []).map((hex) => ownTile(hex, 'customRims')),
              ];
              const EXHAUST_PIPES: Record<string, number[]> = {
                left1: [9], left2: [8, 14], right1: [35], right2: [30, 36], both1: [9, 35], both2: [8, 14, 30, 36], center2: [19, 25],
              };
              return (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Transmission')}</span>
                   <IconTiles value={vehicleSettings.transmission} onChange={(id) => updateVehicleSetting('transmission', id as any)} tiles={[
                     { id: 'Automatic', label: t('Automatic'), icon: <ManualIcon /> },
                     { id: 'Manual', label: t('Manual'), icon: <ManualIcon /> },
                     { id: 'Detect', label: t('Detect'), icon: <ManualIcon /> },
                   ]} />
                 </div>
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Paint')}</span>
                   <IconTiles tiles={paintTiles} value={paint.toLowerCase()} columns={4}
                     onChange={(hex) => updateVehicleSetting('paintColor', hex)} />
                 </div>
                 {/* Studio: de 3D-auto in een ruimte (vloer met lichtvlek en muur) in plaats van een effen achtergrond */}
                 <div className="tsl-section">
                   <label className="tsl-switch-row">
                     <div className="tsl-switch-text" style={{ flex: 1 }}>
                       <span className="tsl-title">{t('Studio')}</span>
                       <small className="tsl-hint">{t('The car stands in a room with a lit floor, like in a showroom.')}</small>
                     </div>
                     <input type="checkbox" className="tsl-toggle" checked={vehicleSettings.studioScene !== false}
                       onChange={(e) => updateVehicleSetting('studioScene', e.target.checked)} />
                   </label>
                 </div>
                 {/* Kenteken op de 3D-auto: alleen op deze radio bewaard */}
                 <div className="tsl-section">
                   <label className="tsl-switch-row">
                     <span className="tsl-title" style={{ flex: 1 }}>{t('Licence plate')}</span>
                     <input type="checkbox" className="tsl-toggle" checked={!vehicleSettings.licensePlateHidden}
                       onChange={(e) => updateVehicleSetting('licensePlateHidden', !e.target.checked)} />
                   </label>
                   {editingPlate ? (
                     <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                       <input readOnly className="tsl-input" value={keyboardValue.toUpperCase()} placeholder="XX-123-X" onFocus={() => openKeyboard(keyboardValue)}
                         style={{ flex: 1, minWidth: 0, height: 40, padding: '0 12px', border: '1px solid var(--tsl-border)', borderRadius: 4,
                           background: 'transparent', color: 'var(--tsl-text)', fontSize: 'calc(16px * var(--text-scale, 1))' }} />
                       <button className="tsl-btn is-small" onClick={() => { setEditingPlate(false); closeKeyboard(); }}>{t('Cancel')}</button>
                       <button className="tsl-btn is-small is-primary" onClick={() => {
                         updateVehicleSetting('licensePlate', keyboardValue.trim().toUpperCase().slice(0, 10)); setEditingPlate(false); closeKeyboard();
                       }}>{t('Save')}</button>
                     </div>
                   ) : (
                     <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                       {vehicleSettings.licensePlate
                         ? <span className="tsl-plate-preview">{vehicleSettings.licensePlate}</span>
                         : <span className="tsl-field-text" style={{ flex: 1 }}>{t('No licence plate')}</span>}
                       <span style={{ flex: 1 }} />
                       {vehicleSettings.licensePlate && (
                         <button className="tsl-btn is-small" onClick={() => updateVehicleSetting('licensePlate', '')}>{t('Remove')}</button>
                       )}
                       <button className="tsl-btn" onClick={() => { setEditingPlate(true); openKeyboard(vehicleSettings.licensePlate ?? ''); }}>
                         {t(vehicleSettings.licensePlate ? 'Change' : 'Set')}
                       </button>
                     </div>
                   )}
                   <small className="tsl-hint">{t('Shown on the 3D car. Saved only on this radio.')}</small>
                 </div>
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Wheels')}</span>
                   <IconTiles value={vehicleSettings.rimColor.toLowerCase()} onChange={(hex) => updateVehicleSetting('rimColor', hex)} tiles={rimTiles} />
                 </div>
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Window Tint')}</span>
                   <IconTiles value={vehicleSettings.windowTint} onChange={(id) => updateVehicleSetting('windowTint', id as WindowTint)}
                     tiles={(['None', 'Light', 'Medium', 'Dark', 'Limo'] as const).map((id, level) => ({ id, label: t(id), icon: <TintIcon level={level} /> }))} />
                 </div>
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Headlights')}</span>
                   <IconTiles value={vehicleSettings.headlightType ?? 'halogen'} onChange={(id) => updateVehicleSetting('headlightType', id as never)} tiles={[
                     { id: 'halogen', label: t('Halogen'), icon: <Lightbulb size={26} /> },
                     { id: 'xenon', label: t('Xenon'), icon: <Lightbulb size={26} /> },
                   ]} />
                 </div>
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Mirrors')}</span>
                   <IconTiles value={vehicleSettings.mirrors ?? 'body'} onChange={(id) => updateVehicleSetting('mirrors', id as never)} tiles={[
                     { id: 'body', label: t('Body color'), icon: <ColorDot color={paint} /> },
                     { id: 'black', label: t('Black'), icon: <ColorDot color="#111111" /> },
                     { id: 'carbon', label: t('Carbon'), icon: <ColorDot color="#111" pattern="carbon" /> },
                   ]} />
                 </div>
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Grille')}</span>
                   <IconTiles value={vehicleSettings.grille ?? 'standard'} onChange={(id) => updateVehicleSetting('grille', id as never)} tiles={[
                     { id: 'standard', label: t('Standard'), icon: <ColorDot color="#3a3d40" /> },
                     { id: 'black', label: t('Gloss black'), icon: <ColorDot color="#050505" /> },
                     { id: 'chrome', label: t('Chrome'), icon: <ColorDot color="#ccc" pattern="chrome" /> },
                     { id: 'body', label: t('Body color'), icon: <ColorDot color={paint} /> },
                     { id: 'carbon', label: t('Carbon'), icon: <ColorDot color="#111" pattern="carbon" /> },
                   ]} />
                 </div>
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Exhaust')}</span>
                   <IconTiles value={vehicleSettings.exhaust ?? 'left1'} columns={4} onChange={(id) => updateVehicleSetting('exhaust', id as ExhaustLayout)}
                     tiles={EXHAUST_OPTIONS.map(([id, label]) => ({ id, label: t(label), icon: <ExhaustIcon pipes={EXHAUST_PIPES[id] ?? []} /> }))} />
                 </div>
                 {/* Achteruitcamera: die van de radio of die van PandaOS (alleen zinvol als de radio de camera vrijgeeft) */}
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Reverse camera')}</span>
                   <IconTiles value={vehicleSettings.reverseCamera ?? (isAndroidLauncher() ? 'radio' : 'pandaos')}
                     onChange={(id) => updateVehicleSetting('reverseCamera', id as 'radio' | 'pandaos')} tiles={[
                       { id: 'radio', label: t('Of the radio'), icon: <Video size={26} /> },
                       { id: 'pandaos', label: t('Of PandaOS'), icon: <Video size={26} /> },
                     ]} />
                 </div>
                 {/* Grafische kwaliteit van het 3D-model: Snel = geen schaduwen en minder pixels (alleen in Geavanceerd) */}
                 {advancedMode && <div className="tsl-section">
                   <span className="tsl-title">{t('Graphics')}</span>
                   {/* Wisselen vraagt eerst om bevestiging (venster met Ja / Nee) */}
                   <IconTiles value={vehicleSettings.graphics ?? 'High'} onChange={(id) => {
                     if (id !== (vehicleSettings.graphics ?? 'High')) setConfirmGraphics(id as 'High' | 'Low');
                   }} tiles={[
                     { id: 'High', label: t('High quality'), icon: <Zap size={26} /> },
                     { id: 'Low', label: t('Fast (no shadows)'), icon: <Zap size={26} /> },
                   ]} />
                 </div>}
              </div>
              );
            })()}

            {/* --- GEAVANCEERD: je eigen auto en de CAN-bus --- */}
            {activeTab === 'Advanced' && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                 {/* Snelle acties als tegels (Figma Controls): icoon in het midden, tekst eronder */}
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Tools')}</span>
                   <IconTiles tiles={[
                     { id: 'apply', label: t('Apply settings of my car'), icon: <CarFront size={26} />, onClick: () => setConfirmApplyCar(true) },
                     ...(advancedMode ? [{ id: 'can', label: t('CAN monitor'), icon: <Activity size={26} />, onClick: openCanMonitor }] : []),
                     ...(isAndroidLauncher() ? [{ id: 'radio', label: t('Radio settings'), icon: <RadioIcon size={26} />, onClick: () => setRadioSettingsOpen(true) }] : []),
                   ]} />
                 </div>
                 {/* CAN-bus: kastje <-> radio (merk/type) en auto <-> kastje (voertuigprotocol); gelijk aan de fabrieksinstellingen.
                     Alleen in Geavanceerd (Software > Weergave); de instellingen blijven gelden. */}
                 {advancedMode && <>
                 <div className="tsl-section">
                   <span className="tsl-title">{t('CAN box (box ↔ radio)')}</span>
                   <IconTiles value={vehicleSettings.canbox ?? 'radio'} columns={4} onChange={(id) => updateVehicleSetting('canbox', id as CanBox)}
                     tiles={CAN_BOXES.map(([id, label]) => ({ id, label: t(label), icon: id === 'radio' ? <RadioIcon size={24} /> : <Cpu size={24} /> }))} />
                 </div>
                 <div className="tsl-section">
                   <span className="tsl-title">{t('Vehicle protocol (car ↔ box)')}</span>
                   {/* Zelfde breedte als de tegels erboven (max. 640 px) */}
                   <div className="tsl-segmented is-wide" style={{ flexWrap: 'wrap', height: 'auto', maxWidth: 640 }}>
                     {CAN_PROTOCOLS.map(([id, label]) => (
                       <button key={id} style={{ flex: '1 0 45%', minHeight: 42 }}
                         className={(vehicleSettings.canProtocol ?? 'vw-pq35') === id ? 'is-active' : ''}
                         onClick={() => updateVehicleSetting('canProtocol', id)}>{t(label)}</button>
                     ))}
                   </div>
                 </div>
                 </>}
                 {/* Radio: systeembalk, volumebalk en camera-app van de radio (eerder alleen via de laptop) */}
                 <RadioSystemPanel open={radioSettingsOpen} onClose={() => setRadioSettingsOpen(false)} />
              </div>
            )}

            {/* --- DISPLAY TAB --- */}
            {activeTab === 'Display' && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '35px' }}>
                 {/* Taal: de namen staan altijd in hun eigen taal, zodat je ze ook herkent als de verkeerde taal aan staat */}
                 <LanguagePanel />
                 {/* Tijd en tijdzone direct onder Taal */}
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('Time')}</label>
                   {renderToggleGroup('timeFormat', ['12 Hour', '24 Hour'], updateDisplaySetting, displaySettings?.timeFormat === '12h' ? '12 Hour' : '24 Hour',
                     (opt: string) => updateDisplaySetting('timeFormat', opt === '12 Hour' ? '12h' : '24h'))}
                   {/* Tijd en tijdzone van de radio (Android) */}
                   <DateTimePanel />
                 </div>

                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('Appearance')}</label>
                   {renderToggleGroup('screenMode', ['Light', 'Dark', 'Auto'], () => {}, screenMode.charAt(0).toUpperCase() + screenMode.slice(1),
                     (opt: string) => setScreenMode(opt.toLowerCase() as 'light' | 'dark' | 'auto'))}
                   {screenMode === 'auto' && (
                     <small className="tsl-hint">{autoSourceText}</small>
                   )}
                 </div>

                 {/* Nachtfilter: warmere kleuren 's nachts; keuzeknoppen Uit / Aan (geen schuifschakelaar) */}
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('Night Filter')}</label>
                   <div className="tsl-segmented">
                     {([false, true] as const).map((on) => (
                       <button key={String(on)} className={!!displaySettings?.nightFilter === on ? 'is-active' : ''}
                         onClick={() => updateDisplaySetting('nightFilter', on)}>{t(on ? 'On' : 'Off')}</button>
                     ))}
                   </div>
                   <small className="tsl-hint">{t('Automatically adjust to warmer colors at night')}</small>
                 </div>

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
                 {/* Hoogte van de zwarte balk onderin (dock); de pictogrammen schalen mee */}
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('Dock height')}</label>
                   <div className="tsl-slider-row">
                     <TeslaSlider
                       value={displaySettings?.dockHeight ?? 64} min={48} max={96} step={4}
                       format={(v) => `${v} px`}
                       iconLeft={<span style={{ width: 18, height: 6, background: 'currentColor', borderRadius: 2 }} />}
                       iconRight={<span style={{ width: 18, height: 12, background: 'currentColor', borderRadius: 2 }} />}
                       onChange={(v) => updateDisplaySetting('dockHeight', v)}
                     />
                     <button className="tsl-btn" onClick={() => updateDisplaySetting('dockHeight', 64)}>{t('Default')}</button>
                   </div>
                 </div>
                 {/* Snelheid: GPS is de echte snelheid; het dashboard wijst een paar km/h te hoog aan */}
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('Speed like dashboard')}</label>
                   <small className="tsl-hint">{t('GPS shows your real speed. The dashboard of the car shows a few km/h more.')}</small>
                   <div className="tsl-slider-row">
                     <TeslaSlider
                       value={displaySettings?.speedometerOffset ?? 0} min={0} max={10} step={1}
                       format={(v) => `+${v} km/h`}
                       onChange={(v) => updateDisplaySetting('speedometerOffset', v)}
                     />
                     <button className="tsl-btn" onClick={() => updateDisplaySetting('speedometerOffset', 0)}>{t('Default')}</button>
                   </div>
                 </div>
                 {/* App-menu (raster in de dock): direct verschijnen/verdwijnen of omhoog schuiven */}
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('App menu')}</label>
                   <div className="tsl-segmented">
                     {(['instant', 'slide'] as const).map((mode) => (
                       <button key={mode} className={(displaySettings?.appMenuAnimation ?? 'instant') === mode ? 'is-active' : ''}
                         onClick={() => updateDisplaySetting('appMenuAnimation', mode)}>{t(mode === 'instant' ? 'Show directly' : 'Slide up')}</button>
                     ))}
                   </div>
                 </div>
                 {/* Dock: hoeveel recente apps (1-4) en waar de knop van het app-menu staat */}
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('Recent apps in the dock')}</label>
                   <div className="tsl-segmented">
                     {[1, 2, 3, 4].map((n) => (
                       <button key={n} className={(displaySettings?.dockRecentCount ?? 2) === n ? 'is-active' : ''}
                         onClick={() => updateDisplaySetting('dockRecentCount', n)}>{n}</button>
                     ))}
                   </div>
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('App menu button')}</label>
                   <div className="tsl-segmented">
                     {(['left', 'middle', 'right'] as const).map((pos) => (
                       <button key={pos} className={(displaySettings?.dockMenuButton ?? 'middle') === pos ? 'is-active' : ''}
                         onClick={() => updateDisplaySetting('dockMenuButton', pos)}>{t(pos === 'left' ? 'Left' : pos === 'middle' ? 'Middle' : 'Right')}</button>
                     ))}
                   </div>
                 </div>
                 {/* Grootte van de dock-pictogrammen: meegroeien met de dock of vast, plus eigen grootte */}
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   <label className="tsl-title">{t('Dock icons')}</label>
                   <div className="tsl-segmented">
                     {(['follow', 'fixed'] as const).map((mode) => (
                       <button key={mode} className={(displaySettings?.dockIconMode ?? 'follow') === mode ? 'is-active' : ''}
                         onClick={() => updateDisplaySetting('dockIconMode', mode)}>{t(mode === 'follow' ? 'Grow with dock' : 'Fixed size')}</button>
                     ))}
                   </div>
                   <div className="tsl-slider-row">
                     <TeslaSlider
                       value={displaySettings?.dockIconScale ?? 100} min={70} max={150} step={5}
                       format={(v) => `${v}%`}
                       iconLeft={<span style={{ width: 10, height: 10, background: 'currentColor', borderRadius: 3 }} />}
                       iconRight={<span style={{ width: 18, height: 18, background: 'currentColor', borderRadius: 4 }} />}
                       onChange={(v) => updateDisplaySetting('dockIconScale', v)}
                     />
                     <button className="tsl-btn" onClick={() => updateDisplaySetting('dockIconScale', 100)}>{t('Default')}</button>
                   </div>
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
                 {/* Weer in de bovenbalk (Open-Meteo, plek ±10 km of de tijdzone) */}
                 <label className="tsl-switch-row">
                   <div className="tsl-switch-text" style={{ flex: 1 }}>
                     <span className="tsl-title">{t('Weather in top bar')}</span>
                     <small className="tsl-hint">{t('Shows the weather and the outside temperature next to the time. Uses the car thermometer when it is known.')}</small>
                   </div>
                   <input type="checkbox" className="tsl-toggle" checked={displaySettings?.showWeather !== false}
                     onChange={(e) => updateDisplaySetting('showWeather', e.target.checked)} />
                 </label>
              </div>
            )}

            {/* --- SAFETY: snelheidswaarschuwing (snelheid via GPS; de maximumsnelheid van de weg komt uit kaartgegevens) --- */}
            {activeTab === 'Safety' && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                 {/* Vaste flitspalen en trajectcontroles (OpenStreetMap): op de kaart en een waarschuwing bij nadering */}
                 <label className="tsl-switch-row">
                   <input type="checkbox" className="tsl-toggle" checked={safetySettings.speedCameraWarning !== false}
                     onChange={(e) => updateSafetySetting('speedCameraWarning', e.target.checked)} />
                   <div className="tsl-switch-text">
                     <span className="tsl-field-text">{t('Speed cameras')}</span>
                     <small className="tsl-hint">{t('Fixed speed cameras and section controls on the map, with a warning when you approach one. Mobile checks are not included.')}</small>
                   </div>
                 </label>

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
                {/* Thuis en Werk (ook in de kaart in te stellen); gebruikt door de kaart en het kaartje Navigeren */}
                {(['home', 'work'] as const).map((place) => (
                  <div key={place} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label className="tsl-title">{t(place === 'home' ? 'Home address' : 'Work address')}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="tsl-field-text" style={{ flex: 1 }}>{navigationSettings[place]?.name ?? t('Not set')}</span>
                      {navigationSettings[place] && (
                        <button className="tsl-btn is-small" onClick={() => updateNavigationSetting(place, null)}>{t('Remove')}</button>
                      )}
                      <button className="tsl-btn" onClick={() => setPickingPlace(place)}>{t(navigationSettings[place] ? 'Change' : 'Set')}</button>
                    </div>
                  </div>
                ))}
                {pickingPlace && <PlacePickerModal place={pickingPlace} onClose={() => setPickingPlace(null)} />}

                {/* Kaart: PandaOS (standaard) of Mapbox met een eigen token (alleen op deze radio bewaard) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label className="tsl-title">{t('Map')}</label>
                  <div className="tsl-segmented is-wide">
                    {([['pandaos', 'PandaOS'], ['mapbox', 'Mapbox']] as const).map(([id, label]) => (
                      <button key={id} className={(navigationSettings.mapProvider ?? 'pandaos') === id ? 'is-active' : ''}
                        onClick={() => updateNavigationSetting('mapProvider', id)}>{label}</button>
                    ))}
                  </div>
                  {navigationSettings.mapProvider === 'mapbox' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {editingToken ? (
                        <>
                          <input readOnly className="tsl-input" value={keyboardValue} placeholder="pk.…" onFocus={() => openKeyboard(keyboardValue)}
                            style={{ flex: 1, minWidth: 0, height: 40, padding: '0 12px', border: '1px solid var(--tsl-border)', borderRadius: 4,
                              background: 'transparent', color: 'var(--tsl-text)' }} />
                          <button className="tsl-btn is-small" onClick={() => { setEditingToken(false); closeKeyboard(); }}>{t('Cancel')}</button>
                          <button className="tsl-btn is-small is-primary" onClick={() => {
                            updateNavigationSetting('mapboxToken', keyboardValue.trim()); setEditingToken(false); closeKeyboard();
                          }}>{t('Save')}</button>
                        </>
                      ) : (
                        <>
                          <span className="tsl-field-text" style={{ flex: 1 }}>
                            {navigationSettings.mapboxToken ? `${t('Own token')}: ${navigationSettings.mapboxToken.slice(0, 6)}…${navigationSettings.mapboxToken.slice(-4)}` : t('Standard PandaOS token')}
                          </span>
                          {navigationSettings.mapboxToken && (
                            <button className="tsl-btn is-small" onClick={() => updateNavigationSetting('mapboxToken', '')}>{t('Standard')}</button>
                          )}
                          <button className="tsl-btn" onClick={() => { setEditingToken(true); openKeyboard(navigationSettings.mapboxToken ?? ''); }}>
                            {t('Own token')}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {navigationSettings.mapProvider === 'mapbox' && (
                    <small className="tsl-hint">{t('Mapbox map with traffic jams. With an invalid token PandaOS uses its own map.')}</small>
                  )}
                </div>

                {/* Brandstof van de auto (tankstations op de kaart) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label className="tsl-title">{t('Fuel')}</label>
                  <div className="tsl-segmented is-wide">
                    {([['euro95', 'Euro 95'], ['e10', 'E10'], ['super98', 'Super 98'], ['diesel', 'Diesel'], ['lpg', 'LPG'], ['electric', 'Electric']] as const).map(([id, label]) => (
                      <button key={id} className={(navigationSettings.fuelType ?? 'euro95') === id ? 'is-active' : ''}
                        onClick={() => {
                          updateNavigationSetting('fuelType', id);
                          // Elektrisch: laadpalen in plaats van tankstations op de kaart
                          const places = new Set(navigationSettings.places ?? []);
                          if (places.has('fuel') || places.has('charging')) {
                            places.delete(id === 'electric' ? 'fuel' : 'charging'); places.add(id === 'electric' ? 'charging' : 'fuel');
                            updateNavigationSetting('places', [...places]);
                          }
                        }}>{t(label)}</button>
                    ))}
                  </div>
                </div>

                {/* Handige plekken op de PandaOS-kaart (OpenStreetMap), elk aan/uit */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label className="tsl-title">{t('On the map')}</label>
                  <div className="tsl-list">
                    {PLACE_KINDS.map((kind) => (
                      <label key={kind.id} className="tsl-switch-row">
                        <div className="tsl-switch-text" style={{ flex: 1 }}>
                          <span className="tsl-field-text" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span className="map-place" style={{ background: kind.color }} dangerouslySetInnerHTML={{ __html: PLACE_ICONS[kind.id] }} />
                            {t(kind.label)}</span>
                        </div>
                        <input type="checkbox" className="tsl-toggle" checked={(navigationSettings.places ?? []).includes(kind.id)}
                          onChange={(e) => {
                            const places = new Set(navigationSettings.places ?? []);
                            if (e.target.checked) places.add(kind.id); else places.delete(kind.id);
                            updateNavigationSetting('places', [...places]);
                          }} />
                      </label>
                    ))}
                  </div>
                  <small className="tsl-hint">{t('Shown on the PandaOS map from street level, from OpenStreetMap.')}</small>
                </div>

                {/* Ritten: opnemen aan/uit en alle ritten verwijderen (Instellingen > Ritten) */}
                <label className="tsl-switch-row">
                  <div className="tsl-switch-text" style={{ flex: 1 }}>
                    <span className="tsl-field-text">{t('Record drives')}</span>
                    <small className="tsl-hint">{t('Saves the route, distance and speeds of every drive (Settings > Trips).')}</small>
                  </div>
                  <input type="checkbox" className="tsl-toggle" checked={navigationSettings.recordDrives !== false}
                    onChange={(e) => updateNavigationSetting('recordDrives', e.target.checked)} />
                </label>
                <button className="tsl-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmClearDrives(true)}>{t('Delete all drives')}</button>
                {confirmClearDrives && (
                  <div className="tsl-modal-backdrop" onClick={() => setConfirmClearDrives(false)}>
                    <div className="tsl-modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
                      <span className="tsl-modal-title">{t('Delete all drives?')}</span>
                      <small className="tsl-hint">{t('All saved drives and their routes are removed. This cannot be undone.')}</small>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button className="tsl-btn" onClick={() => setConfirmClearDrives(false)}>{t('No')}</button>
                        <button className="tsl-btn is-primary" onClick={() => { useUIStore.getState().clearDrives(); setConfirmClearDrives(false); }}>{t('Yes')}</button>
                      </div>
                    </div>
                  </div>
                )}

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
            {/* --- RITTEN: opgenomen ritten met kaart (TripsPanel) --- */}
            {activeTab === 'Trips' && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <TripsPanel />
              </div>
            )}

            {/* --- APPS TAB: per app aan/uit en welke app hij opent --- */}
            {activeTab === 'Apps' && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <small className="tsl-hint">{t('Choose which app each PandaOS app opens. On the radio, your installed Android apps appear here.')}</small>
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

            {/* --- RECHTEN: alle rechten van PandaOS, startscherm, toetsenbord en paneel (Apps bevat alleen apps) --- */}
            {activeTab === 'Permissions' && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Startscherm: PandaOS of het scherm van de radio (alleen op de radio) */}
                {isAndroidLauncher() && <><HomeScreenPanel /><hr className="tsl-divider" /></>}
                <PermissionsPanel />
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
              </div>
            )}

            {/* --- SOFTWARE TAB --- */}
            {activeTab === 'Software' && (
              <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                 {/* De auto in zijn eigen kleur, naam en voertuiginformatie (zoals Tesla) */}
                 <VehicleHero />

                 {/* Software-update via GitHub Releases (toont ook de huidige versie) */}
                 <SoftwareUpdatePanel />

                {/* Build: Publicatie of Ontwikkelaar. Ontwikkelaar zet WebView-DevTools aan, zodat tools/pandaos.mjs op de
                    laptop werkt (doctor, test, sim, can, audio). Alleen op de radio (launcher 1.4.0+). */}
                {buildInfo && (
                  <div className="tsl-section">
                    <span className="tsl-title">{t('Build')}</span>
                    <div className="tsl-segmented">
                      {([false, true] as const).map((dev) => (
                        <button key={String(dev)} className={(buildInfo.developer || buildInfo.debugBuild) === dev ? 'is-active' : ''}
                          disabled={buildInfo.debugBuild}
                          onClick={() => { (window as any).PandaAndroid?.setDeveloperMode?.(dev); setBuildInfo({ ...buildInfo, developer: dev }); }}>
                          {t(dev ? 'Developer' : 'Release')}
                        </button>
                      ))}
                    </div>
                    <small className="tsl-hint">
                      {buildInfo.debugBuild ? t('This is a debug build: the laptop tools always work.')
                        : buildInfo.developer ? t('The laptop can connect to PandaOS (tools/pandaos.mjs). Switch back to Release when you are done testing.')
                        : t('Developer turns on the connection for the laptop tools (tools/pandaos.mjs).')}
                    </small>
                  </div>
                )}

                {/* Weergave: Standaard of Geavanceerd. Standaard verbergt CAN-instellingen, de CAN-monitor, het voertuigprotocol
                    en de grafische kwaliteit; alles blijft werken zoals ingesteld */}
                <div className="tsl-section">
                  <span className="tsl-title">{t('Settings view')}</span>
                  <div className="tsl-segmented">
                    {(['standard', 'advanced'] as const).map((mode) => (
                      <button key={mode} className={(displaySettings?.uiMode ?? 'advanced') === mode ? 'is-active' : ''}
                        onClick={() => updateDisplaySetting('uiMode', mode)}>{t(mode === 'standard' ? 'Standard' : 'Advanced')}</button>
                    ))}
                  </div>
                  <small className="tsl-hint">{t('Standard hides the CAN settings, CAN monitor, vehicle protocol and graphics quality. They keep working.')}</small>
                </div>

                 {/* WebView van de radio: versie en bijwerken (alleen op de radio) */}
                 {isAndroidLauncher() && <WebViewPanel />}

                 {/* Over: compacte tabel van twee kolommen (zoals Meer voertuiginformatie). Diagnose is een eigen app. */}
                 <div className="tsl-section">
                   <span className="tsl-title">{t('About')}</span>
                   <div className="tsl-info-table">
                     {[
                       ['PandaOS', `${t('Version')} ${PANDA_CONFIG.VERSION}`],
                       ['Made by', 'David Cotino'],
                       ['Platform', /Android/i.test(navigator.userAgent) ? 'Android' : /Linux/i.test(navigator.userAgent) ? 'Linux (Raspberry Pi)' : 'Windows'],
                       ['Screen', `${window.screen.width} × ${window.screen.height}`],
                       ['Map data', 'PDOK / Kadaster, OpenStreetMap'],
                       ['Routing', 'OSRM (OpenStreetMap)'],
                     ].map(([label, value]) => (
                       <React.Fragment key={label}><span>{t(label)}</span><span>{value}</span></React.Fragment>
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
            {/* Contacten: standaard alleen van de telefoon (Bluetooth); die van een Google-account op de radio alleen als je dat kiest */}
            {activeTab === 'Bluetooth' && isAndroidLauncher() && (
              <label className="tsl-switch-row" style={{ marginTop: 20 }}>
                <div className="tsl-switch-text" style={{ flex: 1 }}>
                  <span className="tsl-field-text">{t('Contacts from Google account')}</span>
                  <small className="tsl-hint">{t('Off: only the contacts of your phone.')}</small>
                </div>
                <input type="checkbox" className="tsl-toggle" checked={!!appSettings.contactsFromGoogle}
                  onChange={(e) => updateAppSetting('contactsFromGoogle', e.target.checked)} />
              </label>
            )}

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

            {!['Vehicle', 'Advanced', 'Bluetooth', 'Display', 'Safety', 'Navigation', 'Wi-Fi', 'Software', 'Maintenance', 'Trips', 'Apps', 'Permissions'].includes(activeTab) && (
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
      </div>

      {/* Colouriser (Vehicle > Paint): eigen kleur en lakafwerking */}
      {colouriserOpen && <Colouriser target={colouriserOpen} onClose={() => setColouriserOpen(false)} />}

      {/* Eigen kleur (lang ingedrukt): naam geven of verwijderen */}
      {editColor && (() => {
        const close = () => { setEditColor(null); closeKeyboard(); };
        const names = vehicleSettings.colorNames ?? {};
        const save = () => {
          const name = keyboardValue.trim().slice(0, 20);
          const next = { ...names };
          if (name) next[editColor.hex] = name; else delete next[editColor.hex];
          updateVehicleSetting('colorNames', next);
          close();
        };
        const remove = () => {
          updateVehicleSetting(editColor.list, (vehicleSettings[editColor.list] ?? []).filter((h) => h.toLowerCase() !== editColor.hex));
          const next = { ...names }; delete next[editColor.hex];
          updateVehicleSetting('colorNames', next);
          close();
        };
        return (
          <div className="tsl-modal-backdrop" onClick={close}>
            <div className="tsl-modal" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
              <button className="tsl-modal-close" aria-label={t('Close')} onClick={close}><X size={20} /></button>
              <span className="tsl-modal-title">{t('Own colour')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <ColorDot color={editColor.hex} />
                <input readOnly className="tsl-input" value={keyboardValue} placeholder={t('Name')}
                  onFocus={() => openKeyboard(keyboardValue)}
                  style={{ flex: 1, height: 40, padding: '0 12px', border: '1px solid var(--tsl-border)', borderRadius: 4,
                    background: 'transparent', color: 'var(--tsl-text)', fontSize: 'calc(16px * var(--text-scale, 1))' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="tsl-btn" onClick={remove}><Trash2 size={18} /> {t('Remove')}</button>
                <button className="tsl-btn is-primary" onClick={save}>{t('Save')}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bevestigen: instellingen van mijn auto toepassen (overschrijft lak, versnellingsbak enz.) */}
      {confirmApplyCar && (
        <div className="tsl-modal-backdrop" onClick={() => setConfirmApplyCar(false)}>
          <div className="tsl-modal" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
            <button className="tsl-modal-close" aria-label={t('Close')} onClick={() => setConfirmApplyCar(false)}><X size={20} /></button>
            <span className="tsl-modal-title">{t('Apply settings of my car')}</span>
            <span className="tsl-field-text" style={{ textAlign: 'center' }}>
              {t('Resets transmission, CAN bus, headlights, mirrors, grille, exhaust and paint to match this car.')}
            </span>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="tsl-btn" onClick={() => setConfirmApplyCar(false)}>{t('No')}</button>
              <button className="tsl-btn is-primary" onClick={() => {
                Object.entries(MY_VEHICLE_SETTINGS).forEach(([key, value]) => updateVehicleSetting(key as any, value as never));
                setConfirmApplyCar(false);
              }}>{t('Yes')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Bevestigen: grafische kwaliteit wisselen */}
      {releaseNotesOpen && <ReleaseNotes onClose={() => setReleaseNotesOpen(false)} />}
      {confirmGraphics && (
        <div className="tsl-modal-backdrop" onClick={() => setConfirmGraphics(null)}>
          <div className="tsl-modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <button className="tsl-modal-close" aria-label={t('Close')} onClick={() => setConfirmGraphics(null)}><X size={20} /></button>
            <span className="tsl-modal-title">{t('Graphics')}</span>
            <span className="tsl-field-text" style={{ textAlign: 'center' }}>
              {t(confirmGraphics === 'High' ? 'Switch to high quality? The 3D car gets shadows and more detail.' : 'Switch to fast? The 3D car loses its shadows, so PandaOS runs smoother.')}
            </span>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="tsl-btn" onClick={() => setConfirmGraphics(null)}>{t('No')}</button>
              <button className="tsl-btn is-primary" onClick={() => { updateVehicleSetting('graphics', confirmGraphics); setConfirmGraphics(null); }}>{t('Yes')}</button>
            </div>
          </div>
        </div>
      )}

      {/* --- SCREEN CLEAN MODE: zwart scherm dat aanraking negeert; dubbeltik stopt eerder --- */}
      {/* Via een portal op <body>: anders blijft het binnen het instellingenvak (de app-laag heeft een transform) */}
      {cleanModeUntil && createPortal(
        <div onDoubleClick={() => setCleanModeUntil(null)} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', inset: 0, zIndex: 100000, backgroundColor: '#000', color: '#757575',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', userSelect: 'none' }}>
          <span style={{ fontSize: 'calc(18px * var(--text-scale, 1))', fontWeight: 600 }}>{t('Screen Clean Mode')}</span>
          <span style={{ fontSize: 'calc(14px * var(--text-scale, 1))' }}>{cleanModeSecondsLeft} s · dubbeltik om te stoppen</span>
        </div>,
        document.body,
      )}

    </div>
  );
};

export default SettingsApp;