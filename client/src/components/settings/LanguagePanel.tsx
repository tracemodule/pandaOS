// Settings > Display > Taal: knop met de huidige taal, venster met de keuzes (zoals de tijdzone).
// De taal geldt voor PandaOS en, als dat mag, ook voor Android zelf (eenmalige toestemming via de laptop:
// CHANGE_CONFIGURATION). Lukt Android niet, dan staat er een knop naar de taalinstellingen van Android.
// De namen staan altijd in hun eigen taal, zodat je ze ook herkent als de verkeerde taal aan staat.
import React, { useState } from 'react';
import { Languages, X, Check, ExternalLink } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useT } from '../../i18n';

const LANGUAGES: { id: 'nl' | 'en'; name: string; android: string }[] = [
  { id: 'nl', name: 'Nederlands', android: 'nl-NL' },
  { id: 'en', name: 'English', android: 'en-GB' },
];
const bridge = () => (window as any).PandaAndroid;

const LanguagePanel: React.FC = () => {
  const t = useT();
  const { displaySettings, updateDisplaySetting } = useUIStore();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const current = LANGUAGES.find((l) => l.id === displaySettings.language) ?? LANGUAGES[0];

  const pick = (lang: typeof LANGUAGES[number]) => {
    updateDisplaySetting('language', lang.id);
    setOpen(false);
    if (!bridge()?.setSystemLanguage) return;
    let result = { ok: false, error: 'missing' as string | null };
    try { result = JSON.parse(bridge().setSystemLanguage(lang.android)); } catch { /* oude launcher */ }
    setMessage(result.ok ? null : result.error === 'no-permission'
      ? t('PandaOS changed its own language. For Android too, run this once from the laptop:')
      : t('PandaOS changed its own language. Android could not be changed; use Android language settings.'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label className="tsl-title" style={{ flex: 1 }}>{t('Language')}</label>
        <button className="tsl-btn" onClick={() => setOpen(true)}><Languages size={18} /> {current.name}</button>
      </div>
      {message && <small className="tsl-hint" style={{ color: 'var(--tsl-red)' }}>{message}</small>}
      {message && /laptop/i.test(message) && (
        <code style={{ userSelect: 'all', fontSize: 'calc(12px * var(--text-scale, 1))', wordBreak: 'break-all' }}>
          adb shell pm grant nl.pandaos.launcher android.permission.CHANGE_CONFIGURATION
        </code>
      )}
      {message && bridge()?.openLanguageSettings && (
        <button className="tsl-btn" style={{ alignSelf: 'flex-start' }} onClick={() => bridge().openLanguageSettings()}>
          <ExternalLink size={18} /> {t('Android language settings')}
        </button>
      )}

      {open && (
        <div className="tsl-modal-backdrop" onClick={() => setOpen(false)}>
          <div className="tsl-modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <button className="tsl-modal-close" aria-label={t('Close')} onClick={() => setOpen(false)}><X size={20} /></button>
            <span className="tsl-modal-title">{t('Language')}</span>
            <div className="tsl-list">
              {LANGUAGES.map((lang) => (
                <div key={lang.id} className={`tsl-list-row ${lang.id === current.id ? 'is-active' : ''}`} style={{ cursor: 'pointer' }}
                  onClick={() => pick(lang)}>
                  <span className="tsl-field-text" style={{ flex: 1 }}>{lang.name}</span>
                  {lang.id === current.id && <Check size={20} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguagePanel;
