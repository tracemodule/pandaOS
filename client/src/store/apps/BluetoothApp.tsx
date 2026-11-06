// Bluetooth (eigen PandaOS-app, naast de auto), zoals de mediabron Bluetooth bij Tesla:
//  - Apparaten: kaarten met de gekoppelde telefoons/apparaten (verbonden of niet) en "Apparaat verbinden"
//  - Muziek: wat er via Bluetooth speelt, met bediening
//  - Daaronder: muziekapps om direct vanuit te streamen (geïnstalleerd = openen, anders de Play Store)
// Gegevens via de launcher (RadioConnectivity.kt). Koppelen zelf gebeurt bij Instellingen > Bluetooth.
import React, { useCallback, useEffect, useState } from 'react';
import { X, Bluetooth, BluetoothOff, Smartphone, Headphones, Plus, Download } from 'lucide-react';
import { useUIStore } from '../uiStore';
import { useT } from '../../i18n';
import { getEffectiveTheme } from '../../settings';
import { getAndroidAppIcon, getInstalledAppList, launchAndroidPackage } from '../appLinks';
import { toggleRadio } from '../../services/radioToggle';
import MusicBar from '../../components/music/MusicBar';
import './_theater.scss';

const bridge = () => (window as any).PandaAndroid;

type Device = { name: string; address: string; connected: boolean; phone: boolean };
type BtState = { available: boolean; enabled: boolean; name?: string; devices?: Device[] };

// Muziek- en podcastapps om direct vanuit te streamen (in deze volgorde)
const STREAM_APPS: { name: string; package: string; color: string }[] = [
  { name: 'Spotify', package: 'com.spotify.music', color: '#1db954' },
  { name: 'YouTube Music', package: 'com.google.android.apps.youtube.music', color: '#ff0000' },
  { name: 'Apple Music', package: 'com.apple.android.music', color: '#fa2d48' },
  { name: 'Deezer', package: 'deezer.android.app', color: '#a238ff' },
  { name: 'TIDAL', package: 'com.aspiro.tidal', color: '#000000' },
  { name: 'Amazon Music', package: 'com.amazon.mp3', color: '#25d1da' },
  { name: 'SoundCloud', package: 'com.soundcloud.android', color: '#ff5500' },
  { name: 'TuneIn', package: 'tunein.player', color: '#14b8a6' },
  { name: 'NPO Luister', package: 'nl.npo.luister', color: '#ff6d00' },
  { name: 'Audible', package: 'com.audible.application', color: '#f7991c' },
  { name: 'Pocket Casts', package: 'au.com.shiftyjelly.pocketcasts', color: '#f43e37' },
  { name: 'Podimo', package: 'com.podimo', color: '#5a2bd6' },
];

const BluetoothApp: React.FC = () => {
  const t = useT();
  const { closePanelApp, screenMode, vehicleLightsOn, openSettingsTab } = useUIStore();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const [tab, setTab] = useState<'devices' | 'music'>('devices');
  const [state, setState] = useState<BtState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const read = useCallback(() => {
    try { setState(JSON.parse(bridge()?.getBluetoothState?.() ?? 'null')); } catch { setState(null); }
  }, []);
  useEffect(() => {
    read();
    const timer = window.setInterval(read, 3000);
    return () => window.clearInterval(timer);
  }, [read]);

  const installed = new Set(getInstalledAppList().map((a) => a.package));
  const apps = [...STREAM_APPS].sort((a, b) => Number(installed.has(b.package)) - Number(installed.has(a.package)));
  const onRadio = !!bridge();

  const toggleConnect = (device: Device) => {
    setBusy(device.address);
    bridge()?.connectBluetooth?.(device.address, !device.connected);
    window.setTimeout(() => { setBusy(null); read(); }, 2500);
  };

  const openApp = (pkg: string) => {
    if (installed.has(pkg)) launchAndroidPackage(pkg);
    else bridge()?.openPlayStore?.(pkg);
  };

  const card: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 12, border: 'none',
    background: 'var(--th-tile)', color: 'inherit', textAlign: 'left', cursor: 'pointer', minHeight: 76,
  };

  return (
    <div className={`theater-app tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="theater-head">
        <div className="theater-title" style={{ gap: 18 }}>
          <Bluetooth size={24} /><span>{t('Bluetooth')}</span>
          <div className="tsl-segmented" style={{ marginLeft: 8 }}>
            <button className={tab === 'devices' ? 'is-active' : ''} onClick={() => setTab('devices')}>{t('Devices')}</button>
            <button className={tab === 'music' ? 'is-active' : ''} onClick={() => setTab('music')}>{t('Music')}</button>
          </div>
        </div>
        <button className="theater-close" onClick={closePanelApp} aria-label={t('Close')}><X size={22} /></button>
      </div>

      {tab === 'devices' && (
        <>
          {/* Bluetooth uit: eerst aanzetten */}
          {state?.available && !state.enabled ? (
            <button style={card} onClick={() => toggleRadio('bluetooth', true, read)}>
              <BluetoothOff size={26} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="tsl-field-text">{t('Bluetooth is off')}</span>
                <small className="tsl-hint">{t('Tap to switch Bluetooth on')}</small>
              </div>
            </button>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              {(state?.devices ?? []).map((device) => (
                <button key={device.address} style={card} onClick={() => toggleConnect(device)}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: device.connected ? 'rgba(10, 122, 255, 0.15)' : 'var(--th-tile-active)', color: device.connected ? '#0a7aff' : 'inherit' }}>
                    {device.phone ? <Smartphone size={22} /> : <Headphones size={22} />}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span className="tsl-field-text" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{device.name}</span>
                    <small className="tsl-hint" style={{ color: device.connected ? '#0a7aff' : undefined }}>
                      {busy === device.address ? t('One moment…') : t(device.connected ? 'Connected' : 'Not connected')}
                    </small>
                  </div>
                </button>
              ))}
              <button style={card} onClick={() => openSettingsTab('Bluetooth')}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'var(--th-tile-active)' }}>
                  <Plus size={22} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="tsl-field-text">{t('Connect device')}</span>
                  <small className="tsl-hint">{onRadio ? t('Pair a new phone or speaker') : t('Only on the radio')}</small>
                </div>
              </button>
            </div>
          )}

          {/* Direct streamen vanuit een app */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="tsl-field-text">{t('Or stream directly from one of these apps')}</span>
            <small className="tsl-hint">{t('Play music directly from the apps on the radio instead of streaming from your phone.')}</small>
          </div>
          <div className="theater-grid">
            {apps.map((app) => {
              const has = installed.has(app.package);
              return (
                <button key={app.package} className={`theater-tile ${has ? '' : 'is-missing'}`} style={{ aspectRatio: '16 / 6', justifyContent: 'flex-start', padding: '0 14px' }}
                  onClick={() => openApp(app.package)}>
                  {has ? <img src={getAndroidAppIcon(app.package)} alt="" />
                    : <span style={{ width: 28, height: 28, borderRadius: 8, background: app.color, flexShrink: 0 }} />}
                  <span className="theater-name" style={{ fontSize: 'calc(15px * var(--text-scale, 1))' }}>{app.name}</span>
                  {!has && onRadio && <span className="theater-get"><Download size={12} /> {t('Get')}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {tab === 'music' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <MusicBar />
          <small className="tsl-hint">
            {t('Music from your phone plays through the radio. When you press play, PandaOS switches the radio to Bluetooth music.')}
          </small>
        </div>
      )}
    </div>
  );
};

export default BluetoothApp;
