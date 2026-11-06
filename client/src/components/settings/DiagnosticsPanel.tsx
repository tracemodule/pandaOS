// Diagnose (Settings > Software): logboek van webapp en launcher, met "Probleem melden".
// Het rapport gaat via het deelmenu van Android (WhatsApp, Gmail ...) naar je telefoon; er wordt niets vanzelf verstuurd.
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Share2, Trash2, Bug } from 'lucide-react';
import { getDiagEntries, subscribeDiag, clearDiagEntries, reportProblem } from '../../services/diagnostics';
import { useT } from '../../i18n';

type NativeEntry = { time: number; level: string; message: string };

// Gewone CSS (geen effecten/animaties): de software-GPU van de radio kan daar niet goed tegen.
const CSS = `
.diag-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.diag-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: calc(14px * var(--text-scale, 1)); font-weight: 600; background: rgba(128, 128, 128, 0.14); color: var(--tsl-muted); }
.diag-chip.is-error { color: var(--tsl-red); background: rgba(237, 78, 59, 0.14); }
.diag-chip.is-warn { color: #c98a00; background: rgba(245, 179, 1, 0.16); }
.diag-log { border: 1px solid var(--tsl-border); border-radius: 12px; padding: 10px 16px 10px 12px; display: grid; grid-template-columns: auto auto auto minmax(0, 1fr); column-gap: 10px; row-gap: 6px; align-items: baseline; font-family: monospace; font-size: calc(13px * var(--text-scale, 1)); line-height: 1.4; }
.diag-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--tsl-blue); align-self: start; margin-top: 0.45em; }
.diag-dot.is-error { background: var(--tsl-red); }
.diag-dot.is-warn { background: #f5b301; }
.diag-time, .diag-src { color: var(--tsl-muted); white-space: nowrap; }
.diag-msg { min-width: 0; overflow-wrap: anywhere; word-break: break-word; white-space: pre-wrap; }
.diag-log .diag-empty { grid-column: 1 / -1; }
`;

const levelClass = (level: string) => (level === 'error' ? 'is-error' : level === 'warn' ? 'is-warn' : '');

const DiagnosticsPanel: React.FC<{ hideTitle?: boolean }> = ({ hideTitle }) => {
  const t = useT();
  const web = useSyncExternalStore(subscribeDiag, getDiagEntries);
  const [native, setNative] = useState<NativeEntry[]>([]);
  const [shared, setShared] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    try { setNative(JSON.parse((window as any).PandaAndroid?.getNativeDiagnostics?.() ?? '{}').entries ?? []); } catch { setNative([]); }
  }, [web]);

  // Webapp en launcher samen, nieuwste bovenaan
  const all = [
    ...web.map((e) => ({ ...e, source: e.source })),
    ...native.map((e) => ({ ...e, source: 'launcher' })),
  ].sort((a, b) => b.time - a.time);
  const errors = all.filter((e) => e.level === 'error').length;
  const warnings = all.filter((e) => e.level === 'warn').length;
  const visible = showAll ? all.slice(0, 200) : all.slice(0, 8);

  return (
    <div className="tsl-section">
      {!hideTitle && <span className="tsl-title">{t('Diagnostics')}</span>}
      <small className="tsl-hint">
        {t('PandaOS keeps a log of errors and events. Send it when something goes wrong.')}
      </small>
      <style>{CSS}</style>
      <div className="diag-chips">
        <span className={`diag-chip ${errors > 0 ? 'is-error' : ''}`}><Bug size={16} /> {errors} {t('errors')}</span>
        <span className={`diag-chip ${warnings > 0 ? 'is-warn' : ''}`}>{warnings} {t('warnings')}</span>
        <span className="diag-chip">{all.length} {t('entries')}</span>
      </div>

      <div className="diag-log">
        {visible.map((e, i) => (
          <React.Fragment key={`${e.time}-${i}`}>
            <span className={`diag-dot ${levelClass(e.level)}`} title={e.level} />
            <span className="diag-time">{new Date(e.time).toLocaleTimeString('nl-NL')}</span>
            <span className="diag-src">{e.source}</span>
            <span className="diag-msg">{e.message}</span>
          </React.Fragment>
        ))}
        {all.length === 0 && <small className="tsl-hint diag-empty">{t('No entries yet.')}</small>}
      </div>
      {all.length > 8 && (
        <button className="tsl-btn is-small" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll(!showAll)}>
          {showAll ? t('Show less') : t('Show all')}
        </button>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className="tsl-btn is-primary" onClick={async () => setShared(await reportProblem())}>
          <Share2 size={18} /> {t('Report a problem')}
        </button>
        <button className="tsl-btn" onClick={() => { clearDiagEntries(); setShared(null); }}>
          <Trash2 size={18} /> {t('Clear log')}
        </button>
      </div>
      {shared && (
        <small className="tsl-hint">
          {shared === 'klembord' ? t('Report copied to the clipboard.') : <>{t('Report saved as')} <code>{shared}</code></>}
        </small>
      )}
    </div>
  );
};

export default DiagnosticsPanel;
