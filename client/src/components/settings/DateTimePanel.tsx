// Settings > Display > Datum en tijd: tijd en tijdzone van de radio (Android) vanuit PandaOS.
// - Tijd automatisch (via internet/wifi) en Tijdzone automatisch: schakelaars die Android zelf aanpassen. Vraagt dezelfde
//   eenmalige toestemming als Radio-instellingen (WRITE_SECURE_SETTINGS).
// - Handmatig: tijdzone kiezen en (als de tijd niet automatisch is) de tijd zelf instellen. Android laat een app de tijd
//   en zone alleen zetten als apparaateigenaar; lukt het niet, dan toont PandaOS zelf wel de gekozen zone en kun je het
//   via de knop in de Android-datuminstellingen doen.
import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Minus, Plus, Globe, X, Check } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useT } from '../../i18n';

type TimeState = { now: number; zone: string; autoTime: boolean; autoZone: boolean; canWrite: boolean; deviceOwner: boolean };
type Result = { ok: boolean; error: string | null };

const ZONES: [string, string][] = [
  ['Europe/Amsterdam', 'Netherlands'], ['Europe/Brussels', 'Belgium'], ['Europe/Berlin', 'Germany'], ['Europe/Paris', 'France'],
  ['Europe/London', 'United Kingdom'], ['Europe/Madrid', 'Spain'], ['Europe/Istanbul', 'Turkey'], ['America/Curacao', 'Curaçao'],
  ['America/Paramaribo', 'Suriname'], ['UTC', 'UTC'],
];
// Alle tijdzones die de WebView kent (oudere WebViews: alleen de lijst hierboven)
const ALL_ZONES: string[] = (() => { try { return (Intl as any).supportedValuesOf('timeZone'); } catch { return []; } })();
// UTC-verschil nu, bijv. "UTC+1"
const offset = (id: string) => {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: id, timeZoneName: 'shortOffset' }).formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value.replace('GMT', 'UTC') ?? '';
  } catch { return ''; }
};
const bridge = () => (window as any).PandaAndroid;
const parse = (raw?: string): Result => { try { return JSON.parse(raw ?? 'null') ?? { ok: false, error: 'missing' }; } catch { return { ok: false, error: 'missing' }; } };

const DateTimePanel: React.FC = () => {
  const t = useT();
  const { displaySettings, updateDisplaySetting } = useUIStore();
  const [state, setState] = useState<TimeState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [manual, setManual] = useState<Date | null>(null); // tijd die je aan het instellen bent
  const [zonePicker, setZonePicker] = useState(false);
  const [choice, setChoice] = useState<{ id: string; title: string; auto: boolean; onChange: (v: boolean) => void } | null>(null);
  // Naam van een zone: land uit de lijst, anders de stad uit de id (Europe/Lisbon -> Lisbon)
  const zoneName = (id: string) => {
    const known = ZONES.find(([z]) => z === id);
    return known ? t(known[1]) : id.split('/').pop()!.replace(/_/g, ' ');
  };

  const read = useCallback(() => {
    try { setState(JSON.parse(bridge()?.getTimeState?.() ?? 'null')); } catch { setState(null); }
  }, []);
  useEffect(() => { read(); const timer = setInterval(read, 5000); return () => clearInterval(timer); }, [read]);

  const report = (result: Result, fallback?: string) => {
    setMessage(result.ok ? null
      : result.error === 'no-permission' ? t('PandaOS has no permission yet. Run the command below once from the laptop.')
      : fallback ?? `${t('Did not work')}: ${result.error}`);
    setTimeout(read, 500);
  };

  // Gekozen zone van PandaOS; anders die van Android (of van de laptop)
  const zone = displaySettings.timeZone || state?.zone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const pickZone = (id: string) => {
    updateDisplaySetting('timeZone', id);
    if (!bridge()?.setSystemTimeZone) return;
    report(parse(bridge().setSystemTimeZone(id)),
      t('PandaOS now shows this time zone. Android itself could not be changed: set it once under Android date settings.'));
  };

  const shift = (minutes: number) => setManual((d) => new Date((d ?? new Date()).getTime() + minutes * 60000));
  const saveManual = () => {
    if (!manual) return;
    report(parse(bridge()?.setSystemTime?.(manual.getTime())),
      t('Android only lets PandaOS set the time as device owner. Use Android date settings instead.'));
    setManual(null);
  };

  const androidTime = state ? new Date(state.now).toLocaleString('nl-NL', { timeZone: state.zone, dateStyle: 'medium', timeStyle: 'short' }) : null;
  const shown = manual ?? (state ? new Date(state.now) : new Date());

  // Keuze Automatisch / Handmatig: knop met de huidige stand, venster met de keuze (net als Taal)
  const Choice = ({ id, title, hint, auto, onChange }: { id: 'time' | 'zone'; title: string; hint: string; auto: boolean; onChange: (v: boolean) => void }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: state?.canWrite ? 1 : 0.5 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="tsl-field-text">{title}</span>
        <small className="tsl-hint">{hint}</small>
      </div>
      <button className="tsl-btn" disabled={!state?.canWrite} onClick={() => setChoice({ id, title, auto, onChange })}>
        {t(auto ? 'Automatic (time)' : 'Manual (time)')}
      </button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {state && <small className="tsl-hint">{t('Android')}: {androidTime} · {state.zone}</small>}

      {state && (
        <>
          <Choice id="time" title={t('Time')} hint={t('Automatic: Android gets the time from the internet (via Wi-Fi).')}
            auto={state.autoTime} onChange={(v) => report(parse(bridge()?.setAutoTime?.(v)))} />
          <Choice id="zone" title={t('Time zone')} hint={t('Automatic uses the mobile network. Without a SIM card, choose Manual.')}
            auto={state.autoZone} onChange={(v) => report(parse(bridge()?.setAutoTimeZone?.(v)))} />
          {!state.canWrite && (
            <code style={{ userSelect: 'all', fontSize: 'calc(12px * var(--text-scale, 1))', wordBreak: 'break-all' }}>
              adb shell pm grant nl.pandaos.launcher android.permission.WRITE_SECURE_SETTINGS
            </code>
          )}
        </>
      )}

      {/* Handmatige tijd: alleen als automatische tijd uit staat */}
      {state && !state.autoTime && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="tsl-field-text">{t('Time')}</span>
          <button className="tsl-btn is-small" onClick={() => shift(-60)} aria-label="-1 h"><Minus size={14} /> {t('hour')}</button>
          <button className="tsl-btn is-small" onClick={() => shift(-1)} aria-label="-1 min"><Minus size={14} /> {t('min')}</button>
          <span className="tsl-field-text" style={{ minWidth: 70, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {shown.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: zone })}
          </span>
          <button className="tsl-btn is-small" onClick={() => shift(1)} aria-label="+1 min"><Plus size={14} /> {t('min')}</button>
          <button className="tsl-btn is-small" onClick={() => shift(60)} aria-label="+1 h"><Plus size={14} /> {t('hour')}</button>
          {manual && <button className="tsl-btn is-small is-primary" onClick={saveManual}>{t('Save')}</button>}
        </div>
      )}

      {/* Tijdzone handmatig: knop met de huidige zone, venster met de keuzes. Alleen als automatische tijdzone uit
          staat (anders zet Android hem terug) */}
      {(!state || !state.autoZone) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="tsl-field-text" style={{ flex: 1 }}>{t('Time zone')}</span>
          <button className="tsl-btn" onClick={() => setZonePicker(true)}>
            <Globe size={18} /> {zoneName(zone)}
          </button>
        </div>
      )}

      {choice && (
        <div className="tsl-modal-backdrop" onClick={() => setChoice(null)}>
          <div className="tsl-modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <button className="tsl-modal-close" aria-label={t('Close')} onClick={() => setChoice(null)}><X size={20} /></button>
            <span className="tsl-modal-title">{choice.title}</span>
            <div className="tsl-list">
              {([true, false] as const).map((auto) => (
                <div key={String(auto)} className={`tsl-list-row ${choice.auto === auto ? 'is-active' : ''}`} style={{ cursor: 'pointer' }}
                  onClick={() => { choice.onChange(auto); setChoice(null); }}>
                  <span className="tsl-field-text" style={{ flex: 1 }}>{t(auto ? 'Automatic (time)' : 'Manual (time)')}</span>
                  {choice.auto === auto && <Check size={20} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {zonePicker && (
        <div className="tsl-modal-backdrop" onClick={() => setZonePicker(false)}>
          <div className="tsl-modal" style={{ width: 520, maxHeight: '90%' }} onClick={(e) => e.stopPropagation()}>
            <button className="tsl-modal-close" aria-label={t('Close')} onClick={() => setZonePicker(false)}><X size={20} /></button>
            <span className="tsl-modal-title">{t('Time zone')}</span>
            <div className="tsl-list" style={{ overflowY: 'auto', minHeight: 0 }}>
              {[...ZONES.map(([id]) => id), ...ALL_ZONES.filter((id) => !ZONES.some(([z]) => z === id))].map((id) => (
                <div key={id} className={`tsl-list-row ${zone === id ? 'is-active' : ''}`} style={{ cursor: 'pointer' }}
                  onClick={() => { pickZone(id); setZonePicker(false); }}>
                  <div className="tsl-list-text">
                    <span className="tsl-field-text">{zoneName(id)}</span>
                    <small className="tsl-hint">{id} · {offset(id)}</small>
                  </div>
                  {zone === id && <Check size={20} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {message && <small className="tsl-hint" style={{ color: 'var(--tsl-red)' }}>{message}</small>}
      {bridge()?.openDateSettings && (
        <button className="tsl-btn" style={{ alignSelf: 'flex-start' }} onClick={() => bridge().openDateSettings()}>
          <ExternalLink size={18} /> {t('Android date settings')}
        </button>
      )}
    </div>
  );
};

export default DateTimePanel;
