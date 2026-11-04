import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Volume2, VolumeX, LayoutGrid, X } from 'lucide-react';
import "../../control-bar/_control-bar.scss";
import { useUIStore } from '../../../store/uiStore';
import { getEffectiveTheme } from '../../../../src/settings';
import VolkswagenIcon from './VolkswagenIcon';
import VolumePopup from './VolumePopup';
import { getLaunchAction, runLaunchAction, useInstalledApps, getAndroidAppIcon, isAndroidAppVisible, launchAndroidPackage } from '../../../store/appLinks';
import { pressApp, useAppDrag } from '../../../store/appDrag';
import { useT } from '../../../i18n';

// Android-app in de dock: id 'pkg:<pakketnaam>'
const PKG = 'pkg:';
const isAndroidId = (id: string) => id.startsWith(PKG);

const VOLUME_STEP = 1;

const ControlBar: React.FC = () => {
  const {
    toggleMenu, toggleQuickActions, isAppEditMode,
    pinnedApps, recentApps, unpinApp, screenMode, addRecentApp,
    openWebApp, toggleMusic, openSettingsTab, toggleCarPlay, // <--- Hier toegevoegd!
    isPhoneOpen, openPhone, closePhone, openCanMonitor,
    volume, stepVolume, toggleVolume, isVolumeOpen, vehicleLightsOn, appLinks
  } = useUIStore();
  // Uitgeschakelde en (op de radio) ontbrekende apps verdwijnen uit de dock (Settings > Apps);
  // niet-geïnstalleerde apps met een Play Store-pagina worden lichter
  const installedApps = useInstalledApps();
  const t = useT();
  const actionOf = (id: string) => getLaunchAction(appLinks, id, installedApps);
  // Android-apps: alleen als ze nog geïnstalleerd en niet uitgezet zijn (Settings > Apps)
  const isVisible = (id: string) => isAndroidId(id)
    ? installedApps.some((a) => a.package === id.slice(PKG.length)) && isAndroidAppVisible(appLinks, id.slice(PKG.length))
    : actionOf(id).kind !== 'hidden';
  const dockApps = pinnedApps.filter(isVisible);
  const dockRecents = recentApps.filter((id) => isVisible(id) && !pinnedApps.includes(id));
  const isNotInstalled = (id: string) => !isAndroidId(id) && actionOf(id).kind === 'store';
  // Wat er nu gesleept wordt (app-menu of dock), voor het meebewegende pictogram en de markering van het doel
  const drag = useAppDrag((s) => s.drag);

  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  // Anker voor de volume-popup (speaker + pijltjes): klikken hierbinnen sluiten de popup niet
  const volumeAnchorRef = useRef<HTMLDivElement>(null);

  const getAppIconUrl = (id: string) => isAndroidId(id) ? getAndroidAppIcon(id.slice(PKG.length)) : `/app-icons/${id}.svg`;

  const handleDockAppClick = (id: string) => {
    if (isAppEditMode) return;
    if (isAndroidId(id)) {
      addRecentApp(id);
      launchAndroidPackage(id.slice(PKG.length));
      return;
    }
    const action = actionOf(id);
    if (action.kind === 'none') return; // gekoppeld aan "Geen" (Settings > Apps)

    if (action.kind !== 'store') addRecentApp(id);
    if (runLaunchAction(action)) return; // Android-app of Play Store (op de radio)

    if (id === 'spotify') openWebApp('spotify');
    else if (id === 'youtube') openWebApp('youtube');
    else if (id === 'netflix') openWebApp('netflix');
    else if (id === 'music') toggleMusic();
    else if (id === 'settings') openSettingsTab('Display');
    else if (id === 'bluetooth') openSettingsTab('Bluetooth');
    else if (id === 'carplay') toggleCarPlay();
    else if (id === 'canmonitor') openCanMonitor(); // <--- Hier toegevoegd!
    else if (id === 'phone') isPhoneOpen ? closePhone() : openPhone(); // Telefoon via Bluetooth (CarPlay staat los in het app-menu)
    else console.log(`Opening from dock: ${id}...`);
  };

  return (
    <footer className="tsl-control-bar" style={{ position: 'relative', userSelect: 'none' }}>
      
      {/* If in Edit Mode, show labels above the dock */}
      {isAppEditMode && (
         <div style={{ position: 'absolute', top: -20, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ display: 'flex', gap: '60px', color: '#888', fontSize: 'calc(11px * var(--text-scale, 1))', fontWeight: 'bold' }}>
               <span style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', top: '50%', right: '105%', width: '30px', height: '1px', background: '#444' }}></span>
                  {t('My Apps')}
                  <span style={{ position: 'absolute', top: '50%', left: '105%', width: '30px', height: '1px', background: '#444' }}></span>
               </span>
               <span style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', top: '50%', right: '105%', width: '30px', height: '1px', background: '#444' }}></span>
                  {t('Recent Apps')}
                  <span style={{ position: 'absolute', top: '50%', left: '105%', width: '30px', height: '1px', background: '#444' }}></span>
               </span>
            </div>
         </div>
      )}

      {/* Left Controls */}
      <div className="control-group">
        <button className="icon-btn" onClick={() => { if(!isAppEditMode) toggleMenu(); }}>
          <VolkswagenIcon size={28} />
        </button>
        <div className="stepper">
          <ChevronLeft className="arrow" size={24} />
          <span>72</span>
          <ChevronRight className="arrow" size={24} />
        </div>
      </div>

      {/* Center: App Dock */}
      <div className="app-dock" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        
        {/* Pinned Apps (My Apps Dropzone) */}
        <div 
          style={{ 
             display: 'flex', gap: '10px', padding: isAppEditMode ? '5px 10px' : '0', 
             background: isAppEditMode ? (drag?.over?.startsWith('pinned') ? 'rgba(62,106,225,0.35)' : 'rgba(255,255,255,0.1)') : 'transparent',
             borderRadius: '12px', transition: 'background 0.3s',
             minHeight: isAppEditMode ? '40px' : 'auto',
             minWidth: isAppEditMode ? '100px' : 'auto'
          }}
          // Neerzetten op de zone = achteraan; op een pictogram = op die plek
          data-drop="pinned"
        >
           {dockApps.map((id, index) => (
              <div 
                key={id} 
                className="dock-app" 
                data-drop="pinned" data-index={index}
                style={{ position: 'relative', width: 36, height: 36, cursor: isAppEditMode ? 'grab' : 'pointer',
                  opacity: drag?.id === id ? 0.3 : isNotInstalled(id) ? 0.4 : 1, touchAction: isAppEditMode ? 'none' : 'auto',
                  // plek waar de app terechtkomt
                  boxShadow: drag?.over === `pinned:${index}` ? '-6px 0 0 -3px #3e6ae1' : 'none' }}
                onClick={() => handleDockAppClick(id)}
                onPointerDown={(e) => { if (isAppEditMode) pressApp(e, { id, icon: getAppIconUrl(id), longPress: false }); }}
              >
                <img 
                  src={getAppIconUrl(id)} 
                  alt={id} 
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                  onError={(e) => { e.currentTarget.style.display='none'; }}
                />
                
                {/* Red X for removal in Edit Mode */}
                {isAppEditMode && (
                  <div 
                     onPointerDown={(e) => e.stopPropagation()}
                     onClick={(e) => { e.stopPropagation(); unpinApp(id); }}
                     style={{ position: 'absolute', top: -5, right: -5, background: '#E04E3B', color: 'white', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}
                  >
                    <X size={10} />
                  </div>
                )}
              </div>
           ))}
        </div>

        {/* Separator */}
        <div style={{ width: '1px', height: '24px', background: isDarkMode ? '#444' : '#ccc', margin: '0 5px' }}></div>

        {/* Recent Apps */}
        <div style={{ display: 'flex', gap: '10px', opacity: isAppEditMode ? 0.7 : 1 }}>
           {dockRecents.map(id => (
              <div 
                key={id} 
                className="dock-app" 
                style={{ width: 36, height: 36, cursor: isAppEditMode ? 'grab' : 'pointer', opacity: isNotInstalled(id) ? 0.4 : 1, touchAction: isAppEditMode ? 'none' : 'auto' }}
                onClick={() => handleDockAppClick(id)}
                onPointerDown={(e) => { if (isAppEditMode) pressApp(e, { id, icon: getAppIconUrl(id), longPress: false }); }}
              >
                <img 
                  src={getAppIconUrl(id)} 
                  alt={id} 
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                  onError={(e) => { e.currentTarget.style.display='none'; }}
                />
              </div>
           ))}
        </div>

        {/* The X Dropzone (Only visible in Edit Mode) */}
        {isAppEditMode && (
           <div 
              style={{ 
                 marginLeft: '10px', width: '40px', height: '40px', borderRadius: '8px', 
                 display: 'flex', justifyContent: 'center', alignItems: 'center',
                 background: drag?.over === 'remove' ? '#E04E3B' : (isDarkMode ? '#333' : '#ddd'),
                 color: drag?.over === 'remove' ? '#fff' : (isDarkMode ? '#888' : '#555'),
                 transition: 'all 0.2s'
              }}
              // Favoriet hierheen slepen = weghalen uit de dock
              data-drop="remove"
           >
              <X size={20} />
           </div>
        )}

        {/* Quick Actions Launcher Button */}
        {!isAppEditMode && (
           <div className="dock-app" onClick={toggleQuickActions} style={{cursor: 'pointer', marginLeft: '10px'}}>
             <LayoutGrid color="#A2A3A5" />
           </div>
        )}
      </div>

      {/* Right Controls */}
      <div className="control-group">
        <div className="stepper">
          <ChevronLeft className="arrow" size={24} />
          <span>72</span>
          <ChevronRight className="arrow" size={24} />
        </div>

        {/* Volume: < en > stappen van 1 en tonen de popup 3 seconden; speaker opent/sluit de popup */}
        <div className="stepper volume-stepper" ref={volumeAnchorRef} style={{ marginLeft: '16px' }}>
          <ChevronLeft className="arrow" size={24} onClick={() => stepVolume(-VOLUME_STEP)} />
          <div className="volume-anchor">
            <button
              type="button"
              className={`volume-btn ${isVolumeOpen ? 'active' : ''}`}
              onClick={toggleVolume}
              aria-label="Volume"
            >
              {volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}
            </button>
            <VolumePopup anchorRef={volumeAnchorRef} />
          </div>
          <ChevronRight className="arrow" size={24} onClick={() => stepVolume(VOLUME_STEP)} />
        </div>
      </div>

      {/* Pictogram dat met de vinger meebeweegt tijdens het slepen (app-menu of dock); via een portal, zodat
          filters/animaties van de schermlagen de vaste positie niet verstoren */}
      {drag && createPortal(
        <img src={drag.icon} alt="" draggable={false}
          style={{ position: 'fixed', left: drag.x - 24, top: drag.y - 24, width: 48, height: 48, borderRadius: 10,
            pointerEvents: 'none', zIndex: 9999, opacity: 0.9, boxShadow: '0 8px 20px rgba(0,0,0,0.35)' }} />,
        document.body
      )}
    </footer>
  );
};

export default ControlBar;