// Startscherm (Settings > Apps): kiezen wat de Home-knop opent, PandaOS of het scherm van de radio, en dat later
// weer veranderen. Als apparaateigenaar stelt PandaOS het meteen in; anders opent Android zijn keuzescherm.
import React, { useCallback, useEffect, useState } from 'react';
import { Home, CheckCircle2, Circle, ExternalLink } from 'lucide-react';
import { useT } from '../../i18n';

type HomeApp = { package: string; activity: string; name: string; default: boolean; pandaos: boolean };

const HomeScreenPanel: React.FC = () => {
  const t = useT();
  const bridge = (window as any).PandaAndroid;
  const [apps, setApps] = useState<HomeApp[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [owner, setOwner] = useState<boolean>(() => !!bridge?.isDeviceOwner?.());
  const [confirmClear, setConfirmClear] = useState(false);

  const read = useCallback(() => {
    try { setApps(JSON.parse(bridge?.getHomeApps?.() ?? '[]')); } catch { setApps([]); }
  }, [bridge]);

  // Opnieuw lezen na terugkomen uit het keuzescherm van Android
  useEffect(() => {
    read();
    document.addEventListener('visibilitychange', read);
    return () => document.removeEventListener('visibilitychange', read);
  }, [read]);

  if (!bridge?.getHomeApps) return null; // alleen op de radio
  const noDefault = !apps.some((a) => a.default);

  const choose = (app: HomeApp) => {
    if (app.default) return;
    const done = bridge.setHomeApp(app.package);
    setMessage(done ? null : t('Choose it in the Android screen that opens, and pick "Always".'));
    setTimeout(read, 500);
  };

  return (
    <div className="tsl-section">
      <span className="tsl-title">{t('Home screen')}</span>
      <small className="tsl-hint">{t('What the Home button opens. You can change this at any time.')}</small>
      <div className="tsl-list">
        {apps.map((app) => (
          <div key={app.package} className={`tsl-list-row ${app.default ? 'is-active' : ''}`}
            style={{ cursor: 'pointer' }} onClick={() => choose(app)}>
            {app.default ? <CheckCircle2 size={22} /> : <Circle size={22} />}
            <div className="tsl-list-text">
              <span className="tsl-field-text">{app.pandaos ? 'PandaOS' : app.name}</span>
              <small className="tsl-hint">{app.pandaos ? t('This screen') : t('Screen of the radio')} · {app.package}</small>
            </div>
            {/* Even naar het andere startscherm, zonder de keuze te veranderen */}
            {!app.pandaos && (
              <button className="tsl-btn is-small" onClick={(e) => { e.stopPropagation(); bridge.openHomeApp(app.package); }}>
                <Home size={16} /> {t('Open')}
              </button>
            )}
          </div>
        ))}
      </div>
      {noDefault && <small className="tsl-hint">{t('No fixed home screen yet: Android asks every time you press Home.')}</small>}
      {message && <small className="tsl-hint">{message}</small>}
      <button className="tsl-btn" style={{ alignSelf: 'flex-start' }} onClick={() => bridge.openHomeSettings()}>
        <ExternalLink size={18} /> {t('Android home screen settings')}
      </button>
      <small className="tsl-hint">{t('Also possible in the radio menu: More settings → Selection of the start window.')}</small>

      {/* Apparaateigenaar (ingesteld via de laptop, LAPTOP-ADB.md): hier weer opheffen, zonder fabrieksreset */}
      {owner && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <small className="tsl-hint">{t('PandaOS is device owner: it stays the home screen and blocks the Android panel.')}</small>
          {confirmClear ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="tsl-btn is-primary" onClick={() => { bridge.clearDeviceOwner(); setOwner(!!bridge.isDeviceOwner()); setConfirmClear(false); read(); }}>{t('Yes, remove device owner')}</button>
              <button className="tsl-btn" onClick={() => setConfirmClear(false)}>{t('Cancel')}</button>
            </div>
          ) : (
            <button className="tsl-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmClear(true)}>{t('Remove device owner')}</button>
          )}
        </div>
      )}
    </div>
  );
};

export default HomeScreenPanel;
