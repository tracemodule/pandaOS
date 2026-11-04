import React, { useState, useEffect, useRef } from 'react';
import { useUIStore, type AppSettings } from '../../store/uiStore';
import { getEffectiveTheme } from '../../settings';
import { useT } from '../../i18n';
import { getLaunchAction, runLaunchAction, useInstalledApps, getAndroidAppIcon, getAndroidAppName, isAndroidAppVisible, launchAndroidPackage, androidAppKey, getPackagesBehindPandaOSIcons, isAndroidLauncher, type LaunchAction } from '../appLinks';
import { pressApp } from '../appDrag';
import { Wind, Settings2, ChevronLeft } from 'lucide-react';

// Keuzes voor App Settings (tandwiel rechtsboven in het app-menu)
const APP_SETTING_ROWS: { key: keyof AppSettings; title: string; options: { id: string; label: string }[] }[] = [
  { key: 'defaultNav', title: 'Navigation App', options: [{ id: 'nav', label: 'Nav' }, { id: 'maps', label: 'Google Maps' }, { id: 'waze', label: 'Waze' }] },
  { key: 'defaultMusic', title: 'Music App', options: [{ id: 'music', label: 'Music' }, { id: 'spotify', label: 'Spotify' }, { id: 'youtube', label: 'YouTube' }] },
  { key: 'startup', title: 'On Startup', options: [{ id: 'home', label: 'Home' }, { id: 'nav', label: 'Navigation' }, { id: 'music', label: 'Music' }] },
];

// Volledige lijst van alle apps met correcte paden naar de SVG-iconen in /public/app-icons/
const ALL_APPS = [
  { id: 'dashcam', icon: '/app-icons/dashcam.svg', name: 'Dashcam', type: 'image' },
  { id: 'calendar', icon: '/app-icons/calendar.svg', name: 'Calendar', type: 'image' },
  { id: 'messages', icon: '/app-icons/messages.svg', name: 'Messages', type: 'image' },
  { id: 'zoom', icon: '/app-icons/zoom.svg', name: 'Zoom', type: 'image' },
  { id: 'netflix', icon: '/app-icons/netflix.svg', name: 'Theater', type: 'image' },
  { id: 'toybox', icon: '/app-icons/toybox.svg', name: 'Toybox', type: 'image' },
  { id: 'spotify', icon: '/app-icons/spotify.svg', name: 'Spotify', type: 'image' },
  { id: 'caraoke', icon: '/app-icons/caraoke.svg', name: 'Caraoke', type: 'image' },
  { id: 'tunein', icon: '/app-icons/tunein.svg', name: 'TuneIn', type: 'image' },
  { id: 'music', icon: '/app-icons/music.svg', name: 'Music', type: 'image' },
  { id: 'youtube', icon: '/app-icons/youtube.svg', name: 'YouTube', type: 'image' },
  { id: 'camera', icon: '/app-icons/camera.svg', name: 'Camera', type: 'image' },
  { id: 'energy', icon: '/app-icons/energy.svg', name: 'Energy', type: 'image' },
  { id: 'phone', icon: '/app-icons/phone.svg', name: 'Phone', type: 'image' },
  { id: 'carplay', icon: '/app-icons/carplay.svg', name: 'CarPlay', type: 'image' },
  { id: 'bluetooth', icon: '/app-icons/bluetooth.svg', name: 'Bluetooth', type: 'image' },
  { id: 'settings', icon: '/app-icons/settings.svg', name: 'Settings', type: 'image' },
  { id: 'maps', icon: '/app-icons/maps.svg', name: 'Nav', type: 'image' },
  { id: 'canmonitor', icon: '/app-icons/canmonitor.svg', name: 'CAN monitor', type: 'image' },
  // Rechtstreeks naar de ontwikkelaarsopties van Android (alleen op de radio)
  { id: 'developer', icon: '/app-icons/developer.svg', name: 'Developer options', type: 'image' },
];

const QuickActionsApp: React.FC = () => {
  const { 
    toggleMusic, openWebApp, isAppEditMode, setAppEditMode, 
    pinnedApps, pinApp, screenMode, addRecentApp, closeQuickActions,
    openSettingsTab, openMap, openCamera, openCarPlay, openPhone,
    appSettings, updateAppSetting, appLinks, openCanMonitor
  } = useUIStore();
  const [showAppSettings, setShowAppSettings] = useState(false);
  const t = useT();

  const isDarkMode = getEffectiveTheme(screenMode) === 'dark';
  const overlayRef = useRef<HTMLDivElement>(null);

  // Click outside listener: sluit edit mode of de lade
  useEffect(() => {
    const handleClickOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      // De dock hoort bij het bewerken (favorieten, kruisje): niet als "buiten" tellen
      if (target.closest?.('.tsl-control-bar')) return;
      if (overlayRef.current && !overlayRef.current.contains(target)) {
        if (isAppEditMode) {
          setAppEditMode(false);
        } else {
          closeQuickActions();
        }
      }
    };

    document.addEventListener('pointerdown', handleClickOutside);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [isAppEditMode, setAppEditMode, closeQuickActions]);

  // Geïnstalleerde Android-apps (op de radio) en wat elk PandaOS-pictogram doet (Settings > Apps)
  const installedApps = useInstalledApps();
  const actions = new Map<string, LaunchAction>(ALL_APPS.map((app) => [app.id, getLaunchAction(appLinks, app.id, installedApps)]));
  const visibleApps = ALL_APPS.filter((app) => actions.get(app.id)!.kind !== 'hidden' && (app.id !== 'developer' || isAndroidLauncher()));
  // Overige Android-apps: alles wat niet al achter een PandaOS-pictogram zit
  // (en ook geen alternatieven daarvan, bijv. Google Phone als Telefoon op PandaOS staat)
  const coveredPackages = getPackagesBehindPandaOSIcons(appLinks, installedApps);
  // (zelf uitgezet in Settings > Apps = niet tonen)
  const otherAndroidApps = installedApps.filter((a) => !coveredPackages.has(a.package) && isAndroidAppVisible(appLinks, a.package));

  const handleAndroidAppClick = (pkg: string) => {
    if (isAppEditMode) return;
    addRecentApp(androidAppKey(pkg)); // recente apps rechts in de dock
    launchAndroidPackage(pkg);
    closeQuickActions();
  };

  const handleAppClick = (id: string) => {
    if (isAppEditMode) return;
    const action = actions.get(id) ?? { kind: 'pandaos' };
    if (action.kind === 'none') return; // gekoppeld aan "Geen" (Settings > Apps)

    // Voeg toe aan recente lijst in de store
    if (action.kind !== 'store') addRecentApp(id);
    // Android-app of Play Store (op de radio)
    if (runLaunchAction(action)) {
      closeQuickActions();
      return;
    }

    // Routeer naar de juiste actie op basis van ID
    switch (id) {
      case 'spotify':
      case 'youtube':
      case 'netflix':
        openWebApp(id as any);
        break;
      case 'music':
        toggleMusic();
        break;
      case 'settings':
        openSettingsTab('Display');
        break;
      case 'bluetooth':
        openSettingsTab('Bluetooth');
        break;
      case 'maps':
        openMap();
        break;
      case 'camera':
      case 'dashcam':
        openCamera();
        break;
      case 'phone':
        openPhone();
        break;
      case 'carplay':
        openCarPlay();
        break;
      case 'canmonitor':
        openCanMonitor();
        break;
      case 'developer':
        addRecentApp('developer');
        (window as any).PandaAndroid?.openDeveloperSettings?.();
        break;
      default:
        console.log(`Geen actie gekoppeld aan: ${id}`);
    }
    
    // Sluit de lade na een klik (tenzij in edit mode)
    if(!isAppEditMode) closeQuickActions();
  };

  const renderAppIcon = (app: any) => {
    return (
      <img 
        src={app.icon} 
        alt={app.name} 
        draggable={false} // Voorkomt browser ghost images
        style={{ 
          width: 40, 
          height: 40, 
          borderRadius: 8, 
          objectFit: 'contain', 
          pointerEvents: 'none' // CRUCIAAL: voorkomt dat de afbeelding het slepen van de knop verstoort
        }} 
        onError={(e) => {
           e.currentTarget.style.display = 'none';
        }} 
      />
    );
  };

  return (
    <div style={{ position: 'relative' }} ref={overlayRef}>
      
      {/* "Done" knop boven het venster in Edit Mode */}
      {isAppEditMode && (
         <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
            <button 
              onClick={(e) => { e.stopPropagation(); setAppEditMode(false); }}
              style={{ background: '#222', color: '#fff', padding: '10px 30px', borderRadius: '25px', border: '1px solid #444', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}
            >
              {t('Done')}
            </button>
         </div>
      )}

      <div
        className={`tsl-quick-actions-overlay tsl-ui${isDarkMode ? ' dark-mode' : ''}`}
        style={{
          position: 'relative',
          backgroundColor: isDarkMode ? '#1a1a1a' : '#ffffff',
          borderRadius: '16px',
          padding: '24px 32px',
          width: '720px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          border: isDarkMode ? '1px solid #333' : '1px solid #eee',
          userSelect: 'none' // Geen tekstselectie tijdens slepen
        }}
      >
        {isAppEditMode && (
          <div style={{ textAlign: 'center', marginBottom: '25px', color: '#888', fontSize: 'calc(14px * var(--text-scale, 1))', fontWeight: '500' }}>
            {t('Drag icons to My Apps to customize')}
          </div>
        )}

        {/* Tandwiel: wisselt tussen de apps en App Settings */}
        {!isAppEditMode && (
          <button
            onClick={() => setShowAppSettings(!showAppSettings)}
            aria-label={showAppSettings ? 'Back to apps' : 'App Settings'}
            style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: isDarkMode ? '#ccc' : '#555', display: 'flex' }}
          >
            {showAppSettings ? <ChevronLeft size={22} /> : <Settings2 size={22} />}
          </button>
        )}

        {showAppSettings && !isAppEditMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '4px' }}>
            <span className="tsl-title">{t('App Settings')}</span>
            {APP_SETTING_ROWS.map((row) => (
              <div key={row.key} className="tsl-section">
                <span className="tsl-field-text">{t(row.title)}</span>
                <div className="tsl-segmented">
                  {row.options.map((opt) => (
                    <button key={opt.id} className={appSettings[row.key] === opt.id ? 'is-active' : ''}
                      onClick={() => updateAppSetting(row.key, opt.id as never)}>{t(opt.label)}</button>
                  ))}
                </div>
              </div>
            ))}
            <small className="tsl-hint">{t('Google Maps and Waze open as real apps on the radio. Until then, Nav opens.')}</small>
          </div>
        ) : (<>

        {/* Bovenste rij: Climate knoppen */}
        <div className="qa-row qa-climate" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          {['Front Defrost', 'Rear Defrost', 'Left Seat', 'Heated Steering', 'Climate', 'Wipers'].map(item => (
             <button key={item} style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: isDarkMode ? '#ccc' : '#555', cursor: 'pointer' }}>
               <Wind size={28} style={{ pointerEvents: 'none' }} />
               <span style={{ fontSize: 'calc(11px * var(--text-scale, 1))', pointerEvents: 'none' }}>{item}</span>
             </button>
          ))}
        </div>

        <div style={{ height: '1px', background: isDarkMode ? '#333' : '#eee', marginBottom: '25px' }}></div>

        {/* Grid van alle apps; op de radio scrollt dit als er veel Android-apps zijn */}
        <div style={{ maxHeight: 262, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '25px 10px' }}>
          {visibleApps.map(app => {
            const isPinned = pinnedApps.includes(app.id);
            // Niet geïnstalleerd op de radio: lichter, een tik opent de Play Store
            const notInstalled = actions.get(app.id)!.kind === 'store';
            return (
              <button 
                key={app.id} 
                onContextMenu={(e) => e.preventDefault()}
                // Lang indrukken = bewerkmodus; in de bewerkmodus slepen naar de dock, of tikken = vastzetten
                onPointerDown={(e) => pressApp(e, { id: app.id, icon: app.icon, onTap: () => pinApp(app.id) })}
                onClick={() => handleAppClick(app.id)}
                style={{ 
                  background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', 
                  cursor: isAppEditMode ? 'grab' : 'pointer', touchAction: isAppEditMode ? 'none' : 'auto',
                  opacity: (isAppEditMode && isPinned) ? 0.3 : notInstalled ? 0.4 : 1,
                  transition: 'all 0.2s ease',
                  outline: 'none'
                }}
              >
                <div style={{ pointerEvents: 'none' }}>{renderAppIcon(app)}</div>
                <span style={{ color: isDarkMode ? '#fff' : '#000', fontSize: 'calc(12px * var(--text-scale, 1))', fontWeight: '500', pointerEvents: 'none' }}>
                  {t(app.name)}
                </span>
              </button>
            );
          })}

          {/* Overige Android-apps van de radio, met hun eigen pictogram (volledig scherm) */}
          {otherAndroidApps.map((app) => (
            <button key={app.package} onClick={() => handleAndroidAppClick(app.package)}
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => pressApp(e, { id: androidAppKey(app.package), icon: getAndroidAppIcon(app.package), onTap: () => pinApp(androidAppKey(app.package)) })}
              style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', outline: 'none', minWidth: 0,
                cursor: isAppEditMode ? 'grab' : 'pointer', touchAction: isAppEditMode ? 'none' : 'auto',
                opacity: isAppEditMode && pinnedApps.includes(androidAppKey(app.package)) ? 0.3 : 1 }}>
              <div style={{ pointerEvents: 'none' }}>{renderAppIcon({ icon: getAndroidAppIcon(app.package), name: app.name })}</div>
              <span style={{ color: isDarkMode ? '#fff' : '#000', fontSize: 'calc(12px * var(--text-scale, 1))', fontWeight: '500', pointerEvents: 'none',
                maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t(getAndroidAppName(app))}
              </span>
            </button>
          ))}
        </div>
        </div>
        </>)}
      </div>
    </div>
  );
};

export default QuickActionsApp;