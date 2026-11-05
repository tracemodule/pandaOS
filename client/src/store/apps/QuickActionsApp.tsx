import React, { useState, useEffect, useRef } from 'react';
import { useUIStore, type AppSettings } from '../../store/uiStore';
import { getEffectiveTheme } from '../../settings';
import { useT } from '../../i18n';
import { getLaunchAction, runLaunchAction, useInstalledApps, getAndroidAppIcon, getAndroidAppName, isAndroidAppVisible, launchAndroidPackage, androidAppKey, getPackagesBehindPandaOSIcons, isAndroidLauncher, type LaunchAction } from '../appLinks';
import { pressApp } from '../appDrag';
import { Wind, Settings2, ChevronLeft, Plus, Pencil, Trash2, Check, ListChecks } from 'lucide-react';
import { useAppGroups } from '../appGroups';

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
  // De CAN-app van de radio (Voertuig informatie: deuren, airco, instellingen van het CAN-kastje; alleen op de radio)
  { id: 'carinfo', icon: '/app-icons/carinfo.svg', name: 'Car info', type: 'image' },
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
  // App-groepen (mappen): open groep, en of je apps kiest of de naam bewerkt
  const { groups, addGroup, renameGroup, removeGroup, toggleApp } = useAppGroups();
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<'view' | 'choose' | 'rename'>('view');
  const [groupName, setGroupName] = useState('');

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
  const visibleApps = ALL_APPS.filter((app) => actions.get(app.id)!.kind !== 'hidden' && (!['developer', 'carinfo'].includes(app.id) || isAndroidLauncher()));
  // Overige Android-apps: alles wat niet al achter een PandaOS-pictogram zit
  // (en ook geen alternatieven daarvan, bijv. Google Phone als Telefoon op PandaOS staat)
  const coveredPackages = getPackagesBehindPandaOSIcons(appLinks, installedApps);
  // (zelf uitgezet in Settings > Apps = niet tonen)
  const otherAndroidApps = installedApps.filter((a) => !coveredPackages.has(a.package) && isAndroidAppVisible(appLinks, a.package));

  // Alle apps uit het menu als één lijst (voor groepen): sleutel, naam, pictogram en wat een tik doet
  type MenuItem = { key: string; name: string; icon: string; launch: () => void };
  const allItems: MenuItem[] = [
    ...visibleApps.map((app) => ({ key: app.id, name: t(app.name), icon: app.icon, launch: () => handleAppClick(app.id) })),
    ...otherAndroidApps.map((app) => ({ key: androidAppKey(app.package), name: t(getAndroidAppName(app)), icon: getAndroidAppIcon(app.package), launch: () => handleAndroidAppClick(app.package) })),
  ];
  const itemByKey = new Map(allItems.map((i) => [i.key, i]));
  const groupedKeys = new Set(groups.flatMap((g) => g.apps));
  const openGroup = groups.find((g) => g.id === openGroupId) ?? null;

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
      case 'carinfo':
        addRecentApp('carinfo');
        (window as any).PandaAndroid?.openCarInfoApp?.();
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

  // Open groep: apps starten, apps kiezen, hernoemen of de groep verwijderen
  const renderGroup = (group: { id: string; name: string; apps: string[] }) => {
    const members = group.apps.map((k) => itemByKey.get(k)).filter(Boolean) as MenuItem[];
    const text = isDarkMode ? '#fff' : '#000';
    const googleKeys = allItems.filter((i) => i.key.startsWith('pkg:com.google.') || i.key === 'pkg:com.android.vending').map((i) => i.key);
    const saveName = () => { renameGroup(group.id, groupName.trim() || group.name); setGroupMode('view'); };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="tsl-btn is-small" aria-label={t('Back')} onClick={() => { setOpenGroupId(null); setGroupMode('view'); }}><ChevronLeft size={18} /></button>
          {groupMode === 'rename' ? (
            <input autoFocus value={groupName} onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }}
              style={{ flex: 1, fontSize: 'calc(18px * var(--text-scale, 1))', padding: '6px 10px', borderRadius: 8, border: '1px solid #888' }} />
          ) : (
            <span className="tsl-title" style={{ flex: 1 }}>{group.name}</span>
          )}
          {groupMode === 'rename' ? (
            <button className="tsl-btn is-small is-primary" onClick={saveName}><Check size={16} /> {t('Save')}</button>
          ) : groupMode === 'choose' ? (
            <button className="tsl-btn is-small is-primary" onClick={() => setGroupMode('view')}><Check size={16} /> {t('Done')}</button>
          ) : (
            <>
              <button className="tsl-btn is-small" onClick={() => { setGroupName(group.name); setGroupMode('rename'); }}><Pencil size={16} /> {t('Rename')}</button>
              <button className="tsl-btn is-small" onClick={() => setGroupMode('choose')}><ListChecks size={16} /> {t('Choose apps')}</button>
              <button className="tsl-btn is-small" onClick={() => { removeGroup(group.id); setOpenGroupId(null); }}><Trash2 size={16} /> {t('Delete group')}</button>
            </>
          )}
        </div>

        {groupMode === 'choose' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <small className="tsl-hint" style={{ flex: 1 }}>{t('Tap apps to put them in this group or take them out.')}</small>
            {googleKeys.length > 0 && (
              <button className="tsl-btn is-small" onClick={() => googleKeys.forEach((k) => { if (!useAppGroups.getState().groups.find((g) => g.id === group.id)?.apps.includes(k)) toggleApp(group.id, k); })}>{t('Add all Google apps')}</button>
            )}
          </div>
        )}

        <div style={{ maxHeight: 262, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '25px 10px' }}>
            {(groupMode === 'choose' ? allItems : members).map((item) => {
              const inGroup = group.apps.includes(item.key);
              return (
                <button key={item.key} onClick={() => (groupMode === 'choose' ? toggleApp(group.id, item.key) : item.launch())}
                  style={{ position: 'relative', background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', outline: 'none', cursor: 'pointer', minWidth: 0,
                    opacity: groupMode === 'choose' && !inGroup ? 0.45 : 1 }}>
                  <img src={item.icon} alt="" draggable={false} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'contain', pointerEvents: 'none' }} />
                  {groupMode === 'choose' && inGroup && (
                    <span style={{ position: 'absolute', top: -6, right: 'calc(50% - 26px)', width: 18, height: 18, borderRadius: 9, background: 'var(--tsl-blue, #3e6ae1)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={12} /></span>
                  )}
                  <span style={{ color: text, fontSize: 'calc(12px * var(--text-scale, 1))', fontWeight: '500', pointerEvents: 'none',
                    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                </button>
              );
            })}
          </div>
          {groupMode !== 'choose' && members.length === 0 && (
            <small className="tsl-hint">{t('This group is empty. Tap Choose apps.')}</small>
          )}
        </div>
      </div>
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

        {openGroup ? renderGroup(openGroup) : (<>
        {/* Grid van alle apps; op de radio scrollt dit als er veel Android-apps zijn */}
        <div style={{ maxHeight: 262, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '25px 10px' }}>
          {/* Groepen (mappen) eerst */}
          {groups.map((group) => {
            const members = group.apps.map((k) => itemByKey.get(k)).filter(Boolean) as MenuItem[];
            return (
              <button key={group.id} onClick={() => { if (!isAppEditMode) { setOpenGroupId(group.id); setGroupMode('view'); } }}
                style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', outline: 'none', cursor: 'pointer', minWidth: 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, padding: 3, boxSizing: 'border-box', background: isDarkMode ? '#333' : '#e6e6e6',
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, pointerEvents: 'none' }}>
                  {members.slice(0, 4).map((m) => <img key={m.key} src={m.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 3 }} />)}
                </div>
                <span style={{ color: isDarkMode ? '#fff' : '#000', fontSize: 'calc(12px * var(--text-scale, 1))', fontWeight: '500', pointerEvents: 'none',
                  maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</span>
              </button>
            );
          })}

          {visibleApps.filter((app) => !groupedKeys.has(app.id)).map(app => {
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
          {otherAndroidApps.filter((app) => !groupedKeys.has(androidAppKey(app.package))).map((app) => (
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

          {/* Nieuwe groep */}
          {!isAppEditMode && (
            <button onClick={() => { const id = addGroup(t('New group')); setOpenGroupId(id); setGroupMode('choose'); }}
              style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', outline: 'none', cursor: 'pointer' }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, border: `2px dashed ${isDarkMode ? '#555' : '#ccc'}`, boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', pointerEvents: 'none' }}><Plus size={20} /></div>
              <span style={{ color: '#888', fontSize: 'calc(12px * var(--text-scale, 1))', fontWeight: '500', pointerEvents: 'none' }}>{t('New group')}</span>
            </button>
          )}
        </div>
        </div>
        </>)}
        </>)}
      </div>
    </div>
  );
};

export default QuickActionsApp;