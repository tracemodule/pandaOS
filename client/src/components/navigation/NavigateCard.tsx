import React from 'react';
import { Search, Home, Briefcase } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { getLaunchAction, runLaunchAction } from '../../store/appLinks';
import { getEffectiveTheme } from '../../settings';
import { useT } from '../../i18n';

// Kaartje "Navigeren" naast de muziekbalk als de auto het hele scherm vult (Figma Mockups > Car status):
// bovenaan zoeken, onderaan Thuis en Werk. Opent Nav zoals het pictogram in de dock (PandaOS-kaart of de gekozen app).
const NavigateCard: React.FC = () => {
  const t = useT();
  const { appLinks, openMap, screenMode, vehicleLightsOn } = useUIStore();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';

  const openNav = () => {
    if (!runLaunchAction(getLaunchAction(appLinks, 'maps'))) openMap();
  };

  // Thuis/Werk: nog niet ingesteld = Instellingen > Navigatie; Android-app (Waze, Google Maps) = daar navigeren;
  // PandaOS-kaart = kaart open en route
  const goTo = (place: 'home' | 'work') => {
    const store = useUIStore.getState();
    const saved = store.navigationSettings[place];
    if (!saved) { store.openSettingsTab('Navigation'); return; }
    const action = getLaunchAction(appLinks, 'maps');
    if (action.kind === 'android' && (window as any).PandaAndroid?.navigateTo?.(saved.lat, saved.lon, action.package)) return;
    openMap();
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('pandaos-nav-place', { detail: place })), 300);
  };

  return (
    <div className={`tsl-navigate-card ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
      <button className="navigate-search" onClick={openNav}>
        <Search size={16} /> <span>{t('Navigate')}</span>
      </button>
      <div className="navigate-places">
        <button onClick={() => goTo('home')}><Home size={16} /> {t('Home (place)')}</button>
        <button onClick={() => goTo('work')}><Briefcase size={16} /> {t('Work')}</button>
      </div>
    </div>
  );
};

export default NavigateCard;
