// CAN-monitor > Koppelen: een regel uit het logboek of een broadcast van de radio koppelen aan een functie van
// PandaOS, door het in de auto te leren: "Leer aan" → deur openen → uit de nieuwe regels de juiste kiezen.
// De koppelingen staan op de radio (CanLinks.kt) en werken daarna altijd, ook met de CAN-monitor dicht.
import React, { useEffect, useRef, useState } from 'react';
import { GraduationCap, Trash2, Check, RotateCcw, X, ChevronDown, ChevronUp } from 'lucide-react';
import { CAN_FUNCTIONS, getCanLinks, saveCanLinks, suggestMatch, type CanAction, type CanFunction, type CanLink } from '../../services/canSignals';
import { useT } from '../../i18n';

type Line = { time: number; source: 'logcat' | 'broadcast'; text: string };
type Learning = {
  fn: CanFunction; action: CanAction;
  phase: 'doing' | 'choose';
  seconds: number;
  lines: Line[];
  selected: Line | null;
  match: string;
};

const LEARN_SECONDS = 10;
const bridge = () => (window as any).PandaAndroid;

const CanLinkPanel: React.FC<{ logAccess: boolean }> = ({ logAccess }) => {
  const t = useT();
  const [links, setLinks] = useState<CanLink[]>(() => getCanLinks());
  const [learning, setLearning] = useState<Learning | null>(null);
  const [showCanOnly, setShowCanOnly] = useState(false); // signalen die alleen via een werkend CAN-kastje komen
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(timer.current), []);

  const finish = () => {
    window.clearInterval(timer.current);
    let lines: Line[] = [];
    try { lines = JSON.parse(bridge().canLearnResult()).lines ?? []; } catch { /* geen uitslag */ }
    setLearning((l) => (l ? { ...l, phase: 'choose', lines, seconds: 0 } : l));
  };

  const startLearning = (fn: CanFunction, action: CanAction) => {
    bridge().canMonitorStart(false); // alles meelezen, niet alleen 'auto'-regels
    bridge().canLearnStart();
    setLearning({ fn, action, phase: 'doing', seconds: LEARN_SECONDS, lines: [], selected: null, match: '' });
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      setLearning((l) => {
        if (!l || l.phase !== 'doing') return l;
        if (l.seconds <= 1) { window.setTimeout(finish, 0); return { ...l, seconds: 0 }; }
        return { ...l, seconds: l.seconds - 1 };
      });
    }, 1000);
  };

  const save = () => {
    if (!learning?.selected || !learning.match.trim()) return;
    const link: CanLink = {
      id: Date.now().toString(36), func: learning.fn.id, action: learning.action,
      match: learning.match.trim(), source: learning.selected.source,
    };
    const next = [...links, link];
    if (saveCanLinks(next)) setLinks(next);
    setLearning(null);
  };

  const remove = (id: string) => {
    const next = links.filter((l) => l.id !== id);
    if (saveCanLinks(next)) setLinks(next);
  };

  const actionLabel = (a: CanAction) => t(a === 'on' ? 'On' : a === 'off' ? 'Off' : 'Value');

  // --- Leren: eerst de handeling doen, daarna de juiste regel kiezen ---
  if (learning) {
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8, background: 'var(--tsl-btn-secondary)' }}>
          <GraduationCap size={22} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="tsl-field-text">{t('Learning')}: {t(learning.fn.label)} · {actionLabel(learning.action)}</span>
            <small className="tsl-hint">{t(learning.fn.hint)}</small>
          </div>
          <button className="tsl-btn is-small" onClick={() => { window.clearInterval(timer.current); setLearning(null); }}><X size={16} /> {t('Cancel')}</button>
        </div>

        {learning.phase === 'doing' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <span style={{ fontSize: 'calc(56px * var(--text-scale, 1))', fontWeight: 600 }}>{learning.seconds}</span>
            <span className="tsl-field-text">{t('Do it now in the car.')}</span>
            <button className="tsl-btn is-primary" onClick={finish}><Check size={18} /> {t('Done')}</button>
          </div>
        ) : (
          <>
            <small className="tsl-hint">
              {learning.lines.length
                ? t('These lines came in for the first time. Tap the one that belongs to it.')
                : t('No new lines came in. Try again, or check the connection of the CAN box.')}
            </small>
            <div style={{ flex: 1, minHeight: 140, overflowY: 'auto', borderRadius: 8, background: '#0d0d0d', padding: 8 }}>
              {learning.lines.map((line, i) => {
                const selected = learning.selected === line;
                return (
                  <div key={i} onClick={() => setLearning({ ...learning, selected: line, match: suggestMatch(line.text, learning.action, line.source) })}
                    style={{ padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'monospace', wordBreak: 'break-all',
                      fontSize: 'calc(12px * var(--text-scale, 1))', color: selected ? '#fff' : '#9fef9f', background: selected ? 'var(--tsl-blue)' : 'transparent' }}>
                    [{line.source}] {line.text}
                  </div>
                );
              })}
            </div>
            {learning.selected && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <small className="tsl-hint">
                  {learning.action === 'value'
                    ? t('PandaOS looks for this text; the first number after it is the value.')
                    : t('PandaOS looks for this text. Remove parts that change (times, numbers).')}
                </small>
                <input className="tsl-input" value={learning.match}
                  onChange={(e) => setLearning({ ...learning, match: e.target.value })}
                  style={{ fontFamily: 'monospace', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--tsl-border, #ccc)' }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="tsl-btn is-primary" disabled={!learning.selected || !learning.match.trim()} onClick={save}><Check size={18} /> {t('Save link')}</button>
              <button className="tsl-btn" onClick={() => startLearning(learning.fn, learning.action)}><RotateCcw size={18} /> {t('Try again')}</button>
            </div>
          </>
        )}
      </div>
    );
  }

  // --- Overzicht: per functie de koppelingen en de knoppen om te leren ---
  const groups = ['Drive', 'Doors', 'Lights', 'Values'] as const;
  const renderGroups = (list: CanFunction[]) => (
    groups.filter((group) => list.some((f) => f.group === group)).map((group) => (
        <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="tsl-title">{t(group === 'Drive' ? 'Driving' : group)}</span>
          <div className="tsl-list">
            {list.filter((f) => f.group === group).map((fn) => {
              const own = links.filter((l) => l.func === fn.id);
              return (
                <div key={fn.id} className={`tsl-list-row ${own.length ? 'is-active' : ''}`} style={{ alignItems: 'flex-start' }}>
                  <div className="tsl-list-text" style={{ gap: 4 }}>
                    <span className="tsl-field-text">{t(fn.label)}{fn.unit ? ` (${fn.unit})` : ''}</span>
                    {own.length === 0 && <small className="tsl-hint">{t('Not linked')}</small>}
                    {own.map((l) => (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <small className="tsl-hint" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          {actionLabel(l.action)} · {l.source === 'broadcast' ? 'broadcast' : 'log'}: {l.match}
                        </small>
                        <button className="tsl-btn is-small" aria-label={t('Remove')} onClick={() => remove(l.id)}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {fn.kind === 'switch' ? (
                      <>
                        <button className="tsl-btn is-small" onClick={() => startLearning(fn, 'on')}><GraduationCap size={14} /> {t('Learn on')}</button>
                        <button className="tsl-btn is-small" onClick={() => startLearning(fn, 'off')}><GraduationCap size={14} /> {t('Learn off')}</button>
                      </>
                    ) : (
                      <button className="tsl-btn is-small" onClick={() => startLearning(fn, 'value')}><GraduationCap size={14} /> {t('Learn')}</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))
  );
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <small className="tsl-hint">
        {t('Link signals of the radio to PandaOS: tap Learn, do it in the car and pick the new line. Links keep working when the CAN monitor is closed.')}
      </small>
      {!logAccess && (
        <small className="tsl-hint" style={{ color: 'var(--tsl-red)' }}>
          {t('Without log access only broadcasts can be linked. Allow it once via ADB:')} <code>adb shell pm grant nl.pandaos.launcher android.permission.READ_LOGS</code>
        </small>
      )}
      {/* Eerst wat nu binnenkomt; wat alleen via een werkend CAN-kastje kan, ingeklapt onderaan */}
      {renderGroups(CAN_FUNCTIONS.filter((f) => !f.canOnly || links.some((l) => l.func === f.id)))}
      <button className="tsl-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowCanOnly(!showCanOnly)}>
        {showCanOnly ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {t('Only with a working CAN box')} ({CAN_FUNCTIONS.filter((f) => f.canOnly && !links.some((l) => l.func === f.id)).length})
      </button>
      {showCanOnly && (
        <>
          <small className="tsl-hint">{t('These signals only come through the CAN box. On this radio the CAN box reports "protocol not connected", so learning them does not work yet.')}</small>
          {renderGroups(CAN_FUNCTIONS.filter((f) => f.canOnly && !links.some((l) => l.func === f.id)))}
        </>
      )}
    </div>
  );
};

export default CanLinkPanel;
