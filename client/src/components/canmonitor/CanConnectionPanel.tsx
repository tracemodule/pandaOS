// CAN-monitor > Verbinding: hoe de radio met het CAN-kastje verbonden is. Seriële poorten (het kastje en de MCU
// hangen meestal aan een UART), CAN-netwerkinterfaces, systeemeigenschappen met can/mcu/protocol, CAN-apps, en of
// PandaOS het logboek kan lezen. Alleen lezen: PandaOS stuurt niets naar de poorten.
import React, { useEffect, useState } from 'react';
import { RotateCw, Cable, FileText } from 'lucide-react';
import { useT } from '../../i18n';

type Info = {
  ports: { name: string; read: boolean; write: boolean }[];
  properties: string[];
  canInterfaces: string[];
  canApps: { package: string; name: string }[];
  logAccess: boolean;
  reading: boolean;
  background: boolean;
};

const CanConnectionPanel: React.FC = () => {
  const t = useT();
  const [info, setInfo] = useState<Info | null>(null);
  const read = () => { try { setInfo(JSON.parse((window as any).PandaAndroid.canConnectionInfo())); } catch { setInfo(null); } };
  useEffect(read, []);

  if (!info) return <small className="tsl-hint">{t('No information.')}</small>;
  const yesNo = (v: boolean) => t(v ? 'Yes' : 'No');

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <small className="tsl-hint" style={{ flex: 1 }}>
          {t('Log access')}: {yesNo(info.logAccess)} · {t('Reading now')}: {yesNo(info.reading)} · {t('Links active in background')}: {yesNo(info.background)}
        </small>
        <button className="tsl-btn is-small" onClick={read}><RotateCw size={16} /> {t('Refresh')}</button>
      </div>

      <span className="tsl-title">{t('Serial ports')}</span>
      <div className="tsl-list">
        {info.ports.length === 0 && <div className="tsl-list-row"><small className="tsl-hint">{t('None found.')}</small></div>}
        {info.ports.map((p) => (
          <div key={p.name} className="tsl-list-row">
            <Cable size={18} />
            <div className="tsl-list-text">
              <span className="tsl-field-text" style={{ fontFamily: 'monospace' }}>{p.name}</span>
              <small className="tsl-hint">
                {t('Readable')}: {yesNo(p.read)} · {t('Writable')}: {yesNo(p.write)}
                {!p.read && ` · ${t('only for the system (normal on Android)')}`}
              </small>
            </div>
          </div>
        ))}
      </div>

      {info.canInterfaces.length > 0 && (
        <>
          <span className="tsl-title">{t('CAN interfaces')}</span>
          <small className="tsl-hint" style={{ fontFamily: 'monospace' }}>{info.canInterfaces.join(', ')}</small>
        </>
      )}

      <span className="tsl-title">{t('System properties')}</span>
      <div style={{ borderRadius: 8, background: '#0d0d0d', color: '#9fef9f', padding: 10, fontFamily: 'monospace',
        fontSize: 'calc(12px * var(--text-scale, 1))', wordBreak: 'break-all' }}>
        {info.properties.length === 0 ? <span style={{ color: '#888' }}>{t('None found.')}</span>
          : info.properties.map((p, i) => <div key={i}>{p}</div>)}
      </div>

      <span className="tsl-title">{t('Car-related apps on this radio')}</span>
      <div className="tsl-list">
        {info.canApps.length === 0 && <div className="tsl-list-row"><small className="tsl-hint">{t('None found.')}</small></div>}
        {info.canApps.map((a) => (
          <div key={a.package} className="tsl-list-row">
            <FileText size={18} />
            <div className="tsl-list-text">
              <span className="tsl-field-text">{a.name}</span>
              <small className="tsl-hint">{a.package}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CanConnectionPanel;
