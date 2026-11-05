// Bovenkant van Settings > Software, zoals de Tesla: de auto in zijn eigen kleur, de naam ("Name Your Vehicle"),
// en een link naar "Additional Vehicle Information" (venster met een tabel van twee kolommen).
// Alleen echte gegevens: het profiel van de auto (vehicleProfile.ts) en wat de radio over zichzelf zegt.
// Kilometerstand en chassisnummer komen niet via de CAN-bus, dus die staan er niet (geen verzonnen waarden).
import React, { useEffect, useState } from 'react';
import { X, Pencil } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { MY_VEHICLE } from '../../store/vehicleProfile';
import { takeCarSnapshot, cropToContent } from '../../services/carSnapshot';
import { PANDA_CONFIG } from '../../settings';
import { useT } from '../../i18n';

type Device = { manufacturer?: string; model?: string; board?: string; android?: string; sdk?: number; screen?: string; webview?: string };

const VehicleHero: React.FC = () => {
  const t = useT();
  const vehicle = useUIStore((s) => s.vehicleSettings);
  const update = useUIStore((s) => s.updateVehicleSetting);
  const { keyboardValue, openKeyboard, closeKeyboard, isMenuOpen, activeTab } = useUIStore();
  const [image, setImage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Beeld van de 3D-auto, opnieuw bij een andere lak of als Software weer opent
  useEffect(() => {
    if (!isMenuOpen || activeTab !== 'Software') return;
    const timer = setTimeout(() => {
      const shot = takeCarSnapshot();
      if (shot) cropToContent(shot).then(setImage);
    }, 300);
    return () => clearTimeout(timer);
  }, [isMenuOpen, activeTab, vehicle.paintColor, vehicle.paintFinish, vehicle.rimColor]);

  const modelName = MY_VEHICLE.name.replace(/^Volkswagen\s+/, '');
  const name = vehicle.vehicleName?.trim() || '';

  const saveName = () => { update('vehicleName', keyboardValue.trim().slice(0, 30)); setEditing(false); closeKeyboard(); };

  let device: Device = {};
  try { device = JSON.parse((window as any).PandaAndroid?.getNativeDiagnostics?.() ?? '{}').device ?? {}; } catch { /* laptop/Pi */ }

  const rows: [string, string][] = [
    ['Car', `${MY_VEHICLE.name} (${MY_VEHICLE.year})`],
    ['Engine', t(MY_VEHICLE.engine)],
    ['Transmission', t(MY_VEHICLE.transmission)],
    ['Fuel', `${t(MY_VEHICLE.fuel)} · ${MY_VEHICLE.tank} l`],
    ['Tyres', MY_VEHICLE.tyres],
    ['CAN protocol', MY_VEHICLE.canProtocol],
    ['PandaOS', PANDA_CONFIG.VERSION],
    ...(device.model ? [
      ['Radio', `${device.manufacturer ?? ''} ${device.model}`.trim()],
      ['Chipset', device.board ?? '—'],
      ['Android', `${device.android ?? '?'} (SDK ${device.sdk ?? '?'})`],
      ['WebView', device.webview ?? '—'],
      ['Screen', device.screen ?? '—'],
    ] as [string, string][] : []),
  ];

  return (
    <div className="tsl-vehicle-hero">
      {image && <img src={image} alt={modelName} />}
      <span className="tsl-vehicle-name">{modelName}</span>

      {editing ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input readOnly className="tsl-input" value={keyboardValue} placeholder={t('Name Your Vehicle')}
            onFocus={() => openKeyboard(keyboardValue)}
            style={{ flex: 1, height: 40, padding: '0 12px', border: '1px solid var(--tsl-border)', borderRadius: 4,
              background: 'transparent', color: 'var(--tsl-text)', fontSize: 'calc(16px * var(--text-scale, 1))' }} />
          <button className="tsl-btn is-small" onClick={() => { setEditing(false); closeKeyboard(); }}>{t('Cancel')}</button>
          <button className="tsl-btn is-small is-primary" onClick={saveName}>{t('Save')}</button>
        </div>
      ) : (
        <button className="tsl-link" style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: 0 }}
          onClick={() => { setEditing(true); openKeyboard(name); }}>
          {name ? <span className="tsl-field-text">{name}</span> : t('Name Your Vehicle')} <Pencil size={14} />
        </button>
      )}

      <button className="tsl-link" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setShowInfo(true)}>
        {t('Additional Vehicle Information')}
      </button>

      {showInfo && (
        <div className="tsl-modal-backdrop" onClick={() => setShowInfo(false)}>
          <div className="tsl-modal" onClick={(e) => e.stopPropagation()}>
            <button className="tsl-modal-close" aria-label={t('Close')} onClick={() => setShowInfo(false)}><X size={20} /></button>
            <span className="tsl-modal-title">{t('Additional Vehicle Information')}</span>
            <div className="tsl-info-table">
              {rows.map(([label, value]) => (
                <React.Fragment key={label}><span>{t(label)}</span><span>{value}</span></React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleHero;
