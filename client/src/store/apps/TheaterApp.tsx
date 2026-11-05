// Theater: half scherm naast de auto (zoals Settings en de CAN-monitor) met tegels van videoapps.
// Staat de app op de radio, dan opent hij volledig scherm en schuift hij van onder naar boven in beeld
// (PandaBridge.launchAppSlideUp). Staat hij er niet op, dan opent de Play Store bij die app.
// Op de laptop/Pi (geen Android) opent de webversie in een nieuw tabblad.
import React from 'react';
import { X, Download, Clapperboard } from 'lucide-react';
import { useUIStore } from '../uiStore';
import { useInstalledApps, getAndroidAppIcon, isAndroidLauncher } from '../appLinks';
import { useT } from '../../i18n';
import { getEffectiveTheme } from '../../settings';
import './_theater.scss';

type TheaterApp = { id: string; name: string; package: string; color: string; web: string };

// Kleur = de huiskleur van de app, alleen voor de naam op de tegel (geen logo's nagemaakt)
const THEATER_APPS: TheaterApp[] = [
  { id: 'netflix', name: 'Netflix', package: 'com.netflix.mediaclient', color: '#e50914', web: 'https://www.netflix.com' },
  { id: 'youtube', name: 'YouTube', package: 'com.google.android.youtube', color: '#ff0033', web: 'https://www.youtube.com' },
  { id: 'twitch', name: 'Twitch', package: 'tv.twitch.android.app', color: '#9146ff', web: 'https://www.twitch.tv' },
  { id: 'disney', name: 'Disney+', package: 'com.disney.disneyplus', color: '#2f80ed', web: 'https://www.disneyplus.com' },
  { id: 'prime', name: 'Prime Video', package: 'com.amazon.avod.thirdpartyclient', color: '#1fa9e1', web: 'https://www.primevideo.com' },
  { id: 'max', name: 'HBO Max', package: 'com.wbd.stream', color: '#6c5ce7', web: 'https://www.max.com' },
  { id: 'videoland', name: 'Videoland', package: 'nl.rtl.videoland.v2', color: '#ff2d55', web: 'https://www.videoland.com' },
  { id: 'npo', name: 'NPO Start', package: 'nl.uitzendinggemist', color: '#ff6d00', web: 'https://npo.nl/start' },
];

const bridge = () => (window as any).PandaAndroid;

const TheaterApp: React.FC = () => {
  const t = useT();
  const { isTheaterOpen, closeTheater, screenMode, vehicleLightsOn } = useUIStore();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const installed = useInstalledApps();

  if (!isTheaterOpen) return null;

  const isInstalled = (app: TheaterApp) => installed.some((a) => a.package === app.package);

  const open = (app: TheaterApp) => {
    if (!isAndroidLauncher()) { window.open(app.web, '_blank'); return; }
    if (isInstalled(app)) {
      const ok = bridge()?.launchAppSlideUp?.(app.package) ?? bridge()?.launchApp?.(app.package);
      if (ok !== false) return;
    }
    bridge()?.openPlayStore?.(app.package);
  };

  return (
    <div className={`theater-app tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="theater-head">
        <div className="theater-title">
          <Clapperboard size={22} />
          <span>{t('Theater')}</span>
        </div>
        <button className="theater-close" onClick={closeTheater} aria-label={t('Close')}><X size={22} /></button>
      </div>

      <div className="theater-grid">
        {THEATER_APPS.map((app) => {
          const has = !isAndroidLauncher() || isInstalled(app);
          const icon = isAndroidLauncher() && has ? getAndroidAppIcon(app.package) : '';
          return (
            <button key={app.id} className={`theater-tile ${has ? '' : 'is-missing'}`} onClick={() => open(app)}>
              {icon && <img src={icon} alt="" />}
              <span className="theater-name" style={{ color: app.color }}>{app.name}</span>
              {!has && <span className="theater-get"><Download size={14} /> {t('Get app')}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TheaterApp;
