// Eigen Wi-Fi-scherm voor de radio (Settings > Wi-Fi): wifi aan/uit, netwerken zoeken, verbinden met wachtwoord
// (PandaOS-toetsenbord), netwerk vergeten. Via de launcher (window.PandaAndroid, RadioConnectivity.kt), dus met
// dezelfde wifi-driver als de schermen van de fabrikant.
import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, Lock, RotateCw, Check, ChevronRight } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useT } from '../../i18n';

interface WifiNetwork { ssid: string; level: number; secure: boolean; saved: boolean; connected: boolean }
interface WifiState { enabled: boolean; connected?: boolean; ssid?: string | null; level?: number; networks?: WifiNetwork[] }

const bridge = () => (window as any).PandaAndroid;

// Signaal als streepjes (0-4), in de kleur van de tekst
const SignalBars: React.FC<{ level: number }> = ({ level }) => (
  <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden>
    {[0, 1, 2, 3].map((i) => (
      <rect key={i} x={i * 6} y={12 - i * 4} width="4" height={4 + i * 4} rx="1"
        fill="currentColor" opacity={level > i ? 1 : 0.25} />
    ))}
  </svg>
);

const AndroidWifiPanel: React.FC = () => {
  const t = useT();
  const { openKeyboard, closeKeyboard, keyboardValue } = useUIStore();
  const [state, setState] = useState<WifiState | null>(null);
  const [passwordFor, setPasswordFor] = useState<string | null>(null); // netwerk waarvoor het wachtwoordveld open staat
  const [connecting, setConnecting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const read = () => { try { setState(JSON.parse(bridge().getWifiState())); } catch { /* geen geldige status */ } };

  // Status elke 2 s, zoeken elke 15 s (Android beperkt het aantal zoekacties)
  useEffect(() => {
    read();
    bridge()?.startWifiScan?.();
    const status = setInterval(read, 2000);
    const scan = setInterval(() => bridge()?.startWifiScan?.(), 15000);
    return () => { clearInterval(status); clearInterval(scan); };
  }, []);

  // Verbonden met het netwerk waarmee we bezig waren: klaar
  useEffect(() => {
    if (connecting && state?.connected && state.ssid === connecting) {
      setConnecting(null);
      setMessage(null);
    }
  }, [state, connecting]);

  // Na 20 s nog niet verbonden: waarschijnlijk een fout wachtwoord
  useEffect(() => {
    if (!connecting) return;
    const timer = setTimeout(() => {
      setConnecting(null);
      setMessage(t('Could not connect. Check the password and try again.'));
    }, 20000);
    return () => clearTimeout(timer);
  }, [connecting, t]);

  const connect = (network: WifiNetwork, password = '') => {
    setMessage(null);
    const ok = bridge()?.connectWifi(network.ssid, password);
    if (ok) setConnecting(network.ssid);
    else setMessage(t('Could not connect. Check the password and try again.'));
    setPasswordFor(null);
    closeKeyboard();
  };

  const onNetworkClick = (network: WifiNetwork) => {
    if (network.connected) return;
    if (!network.secure || network.saved) return connect(network);
    setPasswordFor(network.ssid);
    openKeyboard('');
  };

  if (!state) return <small className="tsl-hint">…</small>;

  const networks = state.networks ?? [];

  return (
    <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Wifi aan/uit */}
      <label className="tsl-switch-row">
        {state.enabled ? <Wifi size={22} /> : <WifiOff size={22} />}
        <div className="tsl-switch-text" style={{ flex: 1 }}>
          <span className="tsl-field-text">{t('Wi-Fi')}{state.enabled && state.connected && state.ssid ? ` · ${state.ssid}` : ''}</span>
          <small className="tsl-hint">
            {!state.enabled ? t('Off') : state.connected ? `${t('Connected to')} ${state.ssid || t('Wi-Fi network')}` : t('Not connected')}
          </small>
        </div>
        <input type="checkbox" className="tsl-toggle" checked={state.enabled}
          onChange={(e) => { bridge()?.setWifiEnabled(e.target.checked); setTimeout(read, 800); }} />
      </label>

      {/* Verborgen netwerk: via het wifi-scherm van Android (daar kun je de naam zelf invullen) */}
      {state.enabled && (
        <button className="tsl-row-link" onClick={() => bridge()?.openWifiSettings?.()}>
          {t('Add Hidden Wi-Fi Network')} <ChevronRight size={18} />
        </button>
      )}

      {state.enabled && (
        <div className="tsl-section">
          <div className="tsl-title-row">
            {/* Zoals in de Tesla: 'Searching for Wi-Fi Networks' met draaiend rondje zolang er nog niets is */}
            {networks.length === 0
              ? <span className="tsl-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{t('Searching for Wi-Fi Networks')} <span className="tsl-spinner" /></span>
              : <span className="tsl-title">{t('Networks')}</span>}
            <button className="tsl-link" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => { bridge()?.startWifiScan?.(); setTimeout(read, 1500); }}>
              <RotateCw size={16} /> {t('Refresh')}
            </button>
          </div>

          {message && <small className="tsl-hint" style={{ color: 'var(--tsl-red)' }}>{message}</small>}

          {networks.length === 0 ? null : (
            <div className="tsl-list">
              {networks.map((network) => (
                <React.Fragment key={network.ssid}>
                  <div className={`tsl-list-row ${network.connected ? 'is-active' : ''}`} style={{ cursor: 'pointer' }}
                    onClick={() => onNetworkClick(network)}>
                    <SignalBars level={network.level} />
                    <div className="tsl-list-text">
                      <span className="tsl-field-text">{network.ssid}</span>
                      <small className="tsl-hint">
                        {network.connected ? t('Connected') : connecting === network.ssid ? t('Connecting…')
                          : network.saved ? t('Saved') : network.secure ? t('Secured') : t('Open')}
                      </small>
                    </div>
                    {network.connected && <Check size={20} />}
                    {network.secure && !network.connected && <Lock size={16} />}
                    {network.saved && (
                      <button className="tsl-link" onClick={(e) => { e.stopPropagation(); bridge()?.forgetWifi(network.ssid); setTimeout(read, 800); }}>
                        {t('Forget')}
                      </button>
                    )}
                  </div>

                  {/* Wachtwoord via het PandaOS-toetsenbord */}
                  {passwordFor === network.ssid && (
                    <div className="tsl-list-row" style={{ gap: 12 }}>
                      <input type="password" readOnly className="tsl-input" placeholder={t('Password')}
                        value={keyboardValue}
                        onFocus={() => openKeyboard(keyboardValue)}
                        style={{ flex: 1, height: 40, padding: '0 12px', border: '1px solid var(--tsl-border)', borderRadius: 4,
                          background: 'transparent', color: 'var(--tsl-text)', fontSize: 'calc(16px * var(--text-scale, 1))' }} />
                      <button className="tsl-btn is-small" onClick={() => { setPasswordFor(null); closeKeyboard(); }}>{t('Cancel')}</button>
                      <button className="tsl-btn is-small is-primary" disabled={keyboardValue.length < 8 && network.secure}
                        onClick={() => connect(network, keyboardValue)}>{t('Connect')}</button>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AndroidWifiPanel;
