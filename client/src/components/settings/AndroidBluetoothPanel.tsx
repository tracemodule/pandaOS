// Eigen Bluetooth-scherm voor de radio (Settings > Bluetooth): Bluetooth aan/uit, zichtbaar maken, apparaten zoeken,
// koppelen, vergeten en (als de radio het toestaat) verbinden. Via de launcher (RadioConnectivity.kt), met dezelfde
// Bluetooth-driver als de schermen van de fabrikant.
import React, { useEffect, useState } from 'react';
import { Bluetooth, BluetoothOff, Smartphone, RotateCw } from 'lucide-react';
import { useT } from '../../i18n';

interface BtDevice { name: string; address: string; connected?: boolean; pairing?: boolean }
interface BtState {
  available: boolean; enabled?: boolean; name?: string; discovering?: boolean;
  devices?: BtDevice[]; nearby?: BtDevice[];
}

const bridge = () => (window as any).PandaAndroid;

const AndroidBluetoothPanel: React.FC = () => {
  const t = useT();
  const [state, setState] = useState<BtState | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const read = () => { try { setState(JSON.parse(bridge().getBluetoothState())); } catch { /* geen geldige status */ } };

  // Status elke 2 s; bij openen meteen zoeken naar apparaten in de buurt
  useEffect(() => {
    read();
    bridge()?.startBluetoothScan?.();
    const timer = setInterval(read, 2000);
    return () => clearInterval(timer);
  }, []);

  if (!state) return <small className="tsl-hint">…</small>;
  if (!state.available) return <small className="tsl-hint">{t('This device has no Bluetooth.')}</small>;

  const toggleConnection = (device: BtDevice) => {
    setMessage(null);
    const ok = bridge()?.connectBluetooth(device.address, !device.connected);
    if (!ok) setMessage(t('The radio does not allow PandaOS to connect devices. Use the Bluetooth app of the radio (Settings > Apps > Bluetooth).'));
    setTimeout(read, 1500);
  };

  return (
    <div className="settings-list" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Bluetooth aan/uit en zichtbaarheid */}
      <label className="tsl-switch-row">
        {state.enabled ? <Bluetooth size={22} /> : <BluetoothOff size={22} />}
        <div className="tsl-switch-text" style={{ flex: 1 }}>
          <span className="tsl-field-text">{t('Bluetooth')}</span>
          <small className="tsl-hint">{state.enabled ? `${t('Visible as')} ${state.name}` : t('Off')}</small>
        </div>
        <input type="checkbox" className="tsl-toggle" checked={!!state.enabled}
          onChange={(e) => { bridge()?.setBluetoothEnabled(e.target.checked); setTimeout(read, 1000); }} />
      </label>

      {state.enabled && (
        <>
          <div className="tsl-section">
            <button className="tsl-btn" style={{ alignSelf: 'flex-start' }} onClick={() => bridge()?.makeBluetoothDiscoverable()}>
              {t('Make Discoverable')}
            </button>
            <small className="tsl-hint">{t('Then search for this radio on your phone and pair it.')}</small>
          </div>

          {message && <small className="tsl-hint" style={{ color: 'var(--tsl-red)' }}>{message}</small>}

          {/* Gekoppelde apparaten */}
          <div className="tsl-section">
            <span className="tsl-title">{t('Paired Devices')}</span>
            {state.devices?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {state.devices.map((device) => (
                  // Kaart per apparaat (zoals 'Paired Devices' in de Tesla): naam en status, daaronder twee brede knoppen
                  <div key={device.address} className="tsl-card">
                    <div className="tsl-card-head">
                      <Smartphone size={24} color={device.connected ? 'var(--tsl-blue)' : undefined} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span className="tsl-field-text">{device.name}</span>
                        <small className="tsl-hint" style={{ color: device.connected ? 'var(--tsl-blue)' : undefined }}>
                          {device.connected ? t('Connected') : t('Not connected')}
                        </small>
                      </div>
                    </div>
                    <div className="tsl-wide-buttons">
                      {device.connected
                        ? <button className="tsl-btn" onClick={() => toggleConnection(device)}>{t('Disconnect')}</button>
                        : <button className="tsl-btn is-primary" onClick={() => toggleConnection(device)}>{t('Connect')}</button>}
                      <button className="tsl-btn" onClick={() => { bridge()?.forgetBluetooth(device.address); setTimeout(read, 1000); }}>
                        {t('Forget Device')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <small className="tsl-hint">{t('No paired devices yet.')}</small>
            )}
          </div>

          <hr className="tsl-divider" />

          {/* Apparaten in de buurt */}
          <div className="tsl-section">
            <div className="tsl-title-row">
              <span className="tsl-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {t('Nearby Devices')} {state.discovering && <span className="tsl-spinner" />}
              </span>
              <button className="tsl-link" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => { bridge()?.startBluetoothScan(); setTimeout(read, 500); }}>
                <RotateCw size={16} className={state.discovering ? 'spin-animation' : ''} /> {t('Refresh')}
              </button>
            </div>
            {state.nearby?.length ? (
              <div className="tsl-list">
                {state.nearby.map((device) => (
                  <div key={device.address} className="tsl-list-row">
                    <Smartphone size={22} />
                    <div className="tsl-list-text">
                      <span className="tsl-field-text">{device.name}</span>
                      <small className="tsl-hint">{device.pairing ? t('Pairing…') : device.address}</small>
                    </div>
                    <button className="tsl-btn is-small is-primary" disabled={device.pairing}
                      onClick={() => { bridge()?.pairBluetooth(device.address); setTimeout(read, 800); }}>{t('Pair')}</button>
                  </div>
                ))}
              </div>
            ) : (
              <small className="tsl-hint">{state.discovering ? t('Searching for devices…') : t('No devices found. Make sure your phone is discoverable.')}</small>
            )}
            <small className="tsl-hint">{t('When pairing, Android asks you to confirm the code. That confirmation is always shown by the system.')}</small>
          </div>
        </>
      )}
    </div>
  );
};

export default AndroidBluetoothPanel;
