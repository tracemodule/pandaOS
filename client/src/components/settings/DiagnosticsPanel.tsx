// Diagnose (Settings > Software): logboek van webapp en launcher, met "Probleem melden".
// Het rapport gaat via het deelmenu van Android (WhatsApp, Gmail ...) naar je telefoon; er wordt niets vanzelf verstuurd.
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Share2, Trash2, Bug } from 'lucide-react';
import { getDiagEntries, subscribeDiag, clearDiagEntries, reportProblem } from '../../services/diagnostics';
import { useT } from '../../i18n';

type NativeEntry = { time: number; level: string; message: string };

const LEVEL_COLOR: Record<string, string> = { error: 'var(--tsl-red)', warn: '#e0a100', info: 'var(--tsl-muted)' };

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
      <div className="tsl-list">
        <div className={`tsl-list-row ${errors === 0 ? 'is-active' : ''}`}>
          <Bug size={22} />
          <div className="tsl-list-text">
            <span className="tsl-field-text">
              {errors} {t('errors')} · {warnings} {t('warnings')} · {all.length} {t('entries')}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'monospace', fontSize: 'calc(13px * var(--text-scale, 1))' }}>
        {visible.map((e, i) => (
          <div key={`${e.time}-${i}`} style={{ display: 'flex', gap: 8 }}>
            <span style={{ color: 'var(--tsl-muted)', flexShrink: 0 }}>{new Date(e.time).toLocaleTimeString('nl-NL')}</span>
            <span style={{ color: LEVEL_COLOR[e.level] ?? 'inherit', flexShrink: 0 }}>{e.source}</span>
            <span style={{ wordBreak: 'break-word' }}>{e.message}</span>
          </div>
        ))}
        {all.length === 0 && <small className="tsl-hint">{t('No entries yet.')}</small>}
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
