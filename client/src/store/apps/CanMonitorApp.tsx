// CAN-monitor: eigen app in PandaOS (app-menu), half scherm naast de auto.
// Alles wat met de CAN-bus te maken heeft op één plek, groot en goed leesbaar (ook om een foto van te maken):
//  - Live: de regels van het CAN-kastje/de radio (CanMonitor.kt op de launcher)
//  - Detectie: per soort signaal (achteruit, lichten, deuren ...) hoe vaak en wat het laatst binnenkwam
//  - Apps: CAN-apps van de fabrikant op de radio en de gekozen CAN-bus-instelling (Settings > Voertuig)
// Sneltoetsen: starten/stoppen, alleen auto of alles, opslaan (tekstbestand, ophalen met adb pull), wissen.
import React, { useEffect, useRef, useState } from 'react';
import { Activity, Play, Square, Trash2, Save, X, Filter, Share2 } from 'lucide-react';
import { reportProblem } from '../../services/diagnostics';
import { useUIStore } from '../uiStore';
import { getEffectiveTheme } from '../../settings';
import { useT } from '../../i18n';

interface MonitorLine { time: number; source: string; text: string }
interface MonitorState {
  logAccess: boolean; running: boolean; onlyCan: boolean;
  lines: MonitorLine[]; canApps: { package: string; name: string }[];
}
type Tab = 'Live' | 'Detection' | 'Apps';

// Soorten signalen om te herkennen in de regels (Detectie)
const SIGNALS: { label: string; pattern: RegExp }[] = [
  { label: 'Reverse', pattern: /backcar|reverse|\brev\b|gear[_ ]?r\b|parking ?cam/i },
  { label: 'Lights', pattern: /\bill\b|illum|headlight|lamp|light/i },
  { label: 'Doors', pattern: /door|trunk|tailgate|hood/i },
  { label: 'Steering wheel keys', pattern: /swc|steer|irkey|key ?code|keyevent/i },
  { label: 'Speed / RPM', pattern: /\b(vehicle_?|car_?)?speed\b(?!-)|\brpm\b|engine_?speed/i },
  { label: 'Temperature', pattern: /temp/i },
  { label: 'Fuel / mileage', pattern: /fuel|odometer|mileage|range|\bkm\b/i },
  { label: 'Handbrake / seatbelt', pattern: /handbrake|parking ?brake|seat ?belt/i },
  { label: 'Parking sensors', pattern: /radar|pdc|park ?sensor|ultrason/i },
];

const bridge = () => (window as any).PandaAndroid;
const time = (t: number) => new Date(t).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const CanMonitorApp: React.FC = () => {
  const t = useT();
  const { isCanMonitorOpen, closeCanMonitor, screenMode, vehicleLightsOn, vehicleSettings, openSettingsTab } = useUIStore();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const [tab, setTab] = useState<Tab>('Live');
  const [state, setState] = useState<MonitorState | null>(null);
  const [onlyCan, setOnlyCan] = useState(true);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const available = typeof bridge()?.getCanMonitor === 'function';

  const read = () => { try { setState(JSON.parse(bridge().getCanMonitor())); } catch { /* geen status */ } };

  // Bij openen meteen starten en elke seconde bijwerken; bij sluiten stoppen
  useEffect(() => {
    if (!isCanMonitorOpen || !available) return;
    bridge().canMonitorStart(onlyCan);
    read();
    const timer = setInterval(read, 1000);
    return () => { clearInterval(timer); bridge().canMonitorStop(); };
  }, [isCanMonitorOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [state?.lines.length, tab]);

  if (!isCanMonitorOpen) return null;

  const restart = (only: boolean) => {
    bridge().canMonitorStop();
    setTimeout(() => { bridge().canMonitorStart(only); read(); }, 200);
  };

  const lines = state?.lines ?? [];
  const detections = SIGNALS.map((signal) => {
    const hits = lines.filter((l) => signal.pattern.test(l.text));
    return { ...signal, count: hits.length, last: hits[hits.length - 1] };
  });

  return (
    <div className={`settings-overlay-container tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 24px',
        background: 'var(--tsl-bg)', overflow: 'hidden', boxSizing: 'border-box' }}>

      {/* Kop */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Activity size={22} />
        <span className="tsl-title" style={{ flex: 1 }}>{t('CAN monitor')}</span>
        <small className="tsl-hint">{state?.running ? `● ${t('Recording')}` : t('Stopped')} · {lines.length} {t('lines')}</small>
        <button className="tsl-btn is-small" onClick={closeCanMonitor} aria-label={t('Close')}><X size={18} /></button>
      </div>

      {!available ? (
        <small className="tsl-hint">{t('The CAN monitor only works on the radio.')}</small>
      ) : (
        <>
          {/* Sneltoetsen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {state?.running ? (
              <button className="tsl-btn" onClick={() => { bridge().canMonitorStop(); setTimeout(read, 200); }}><Square size={18} /> {t('Stop')}</button>
            ) : (
              <button className="tsl-btn is-primary" onClick={() => { bridge().canMonitorStart(onlyCan); setTimeout(read, 300); }}><Play size={18} /> {t('Start')}</button>
            )}
            <button className={`tsl-btn ${onlyCan ? 'is-primary' : ''}`} onClick={() => { setOnlyCan(!onlyCan); if (state?.running) restart(!onlyCan); }}>
              <Filter size={18} /> {onlyCan ? t('Car only') : t('Everything')}
            </button>
            <button className="tsl-btn" onClick={() => setSavedPath(bridge().canMonitorSave())}><Save size={18} /> {t('Save')}</button>
            <button className="tsl-btn" onClick={() => { bridge().canMonitorClear(); setSavedPath(null); read(); }}><Trash2 size={18} /> {t('Clear')}</button>
            <button className="tsl-btn" onClick={async () => setSavedPath(await reportProblem('Gemeld vanuit de CAN-monitor', {
              title: 'CAN-monitor (laatste 200)', lines: (state?.lines ?? []).slice(-200).map((l) => `${l.source}: ${l.text}`),
            }))}><Share2 size={18} /> {t('Report a problem')}</button>
          </div>

          {savedPath && <small className="tsl-hint">{t('Saved as')} <code>{savedPath}</code></small>}
          {state && !state.logAccess && (
            <small className="tsl-hint" style={{ color: 'var(--tsl-red)' }}>
              {t('Only signals from known broadcasts. For the full radio log, allow it once via ADB:')} <code>adb shell pm grant nl.pandaos.launcher android.permission.READ_LOGS</code>
            </small>
          )}

          <div className="tsl-segmented">
            {(['Live', 'Detection', 'Apps'] as Tab[]).map((name) => (
              <button key={name} className={tab === name ? 'is-active' : ''} onClick={() => setTab(name)}>{t(name)}</button>
            ))}
          </div>

          {/* Live regels */}
          {tab === 'Live' && (
            <div ref={listRef} style={{
              flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, borderRadius: 8, background: '#0d0d0d', color: '#9fef9f',
              fontFamily: 'monospace', fontSize: 'calc(13px * var(--text-scale, 1))', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {lines.length === 0
                ? <span style={{ color: '#888' }}>{state?.running ? t('Waiting for signals… Shift into R, open a door or turn on the lights.') : t('Tap Start to begin.')}</span>
                : lines.map((line, i) => (
                  <div key={i}><span style={{ color: '#7a7a7a' }}>{time(line.time)} [{line.source}]</span> {line.text}</div>
                ))}
            </div>
          )}

          {/* Detectie: wat is er herkend */}
          {tab === 'Detection' && (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <div className="tsl-list">
                {detections.map((d) => (
                  <div key={d.label} className={`tsl-list-row ${d.count ? 'is-active' : ''}`}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: d.count ? 'var(--tsl-green)' : 'var(--tsl-muted)', opacity: d.count ? 1 : 0.4 }} />
                    <div className="tsl-list-text">
                      <span className="tsl-field-text">{t(d.label)} · {d.count}×</span>
                      <small className="tsl-hint" style={{ fontFamily: d.last ? 'monospace' : undefined }}>
                        {d.last ? `${time(d.last.time)} ${d.last.text.slice(0, 140)}` : t('Not seen yet')}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CAN-apps van de fabrikant en de gekozen instelling */}
          {tab === 'Apps' && (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="tsl-list">
                <div className="tsl-list-row">
                  <div className="tsl-list-text">
                    <span className="tsl-field-text">{t('CAN box')}: {vehicleSettings.canbox ?? 'radio'} · {t('Protocol')}: {vehicleSettings.canProtocol ?? 'vw-pq35'}</span>
                    <small className="tsl-hint">{t('Change in Settings > Vehicle > CAN bus.')}</small>
                  </div>
                  <button className="tsl-btn is-small" onClick={() => { closeCanMonitor(); openSettingsTab('Vehicle'); }}>{t('Settings')}</button>
                </div>
              </div>
              <span className="tsl-field-text">{t('Car-related apps on this radio')}</span>
              {!state?.canApps.length ? (
                <small className="tsl-hint">{t('None found.')}</small>
              ) : (
                <div className="tsl-list">
                  {state.canApps.map((app) => (
                    <div key={app.package} className="tsl-list-row">
                      <div className="tsl-list-text">
                        <span className="tsl-field-text">{app.name}</span>
                        <small className="tsl-hint">{app.package}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CanMonitorApp;
