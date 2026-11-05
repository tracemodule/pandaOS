// Diagnose als eigen app (half scherm naast de auto, zoals de CAN-monitor): logboek van webapp en launcher,
// met "Probleem melden" via het deelmenu van Android. Stond eerst onder Settings > Software.
import React from 'react';
import { X, Stethoscope } from 'lucide-react';
import { useUIStore } from '../uiStore';
import { getEffectiveTheme } from '../../settings';
import DiagnosticsPanel from '../../components/settings/DiagnosticsPanel';
import { useT } from '../../i18n';

const DiagnosticsApp: React.FC = () => {
  const t = useT();
  const { isDiagnosticsOpen, closeDiagnostics, screenMode, vehicleLightsOn } = useUIStore();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  if (!isDiagnosticsOpen) return null;

  return (
    <div className={`settings-overlay-container tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 24px',
        background: 'var(--tsl-bg)', overflow: 'hidden', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Stethoscope size={22} />
        <span className="tsl-title" style={{ flex: 1 }}>{t('Diagnostics')}</span>
        <button className="tsl-btn is-small" onClick={closeDiagnostics} aria-label={t('Close')}><X size={18} /></button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <DiagnosticsPanel hideTitle />
      </div>
    </div>
  );
};

export default DiagnosticsApp;
