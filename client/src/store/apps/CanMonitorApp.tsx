// CAN-monitor: eigen app in PandaOS (app-menu), half scherm naast de auto.
// Alles wat met de CAN-bus te maken heeft op één plek, groot en goed leesbaar (ook om een foto van te maken):
//  - Live: de regels van het CAN-kastje/de radio (CanMonitor.kt op de launcher)
//  - Detectie: per soort signaal (achteruit, lichten, deuren ...) hoe vaak en wat het laatst binnenkwam
//  - Apps: CAN-apps van de fabrikant op de radio en de gekozen CAN-bus-instelling (Settings > Voertuig)
// Sneltoetsen: starten/stoppen, alleen auto of alles, opslaan (tekstbestand, ophalen met adb pull), wissen.
import React, { useEffect, useRef, useState } from 'react';
import { Activity, Circle, Square, Trash2, Save, X, Filter, Share2 } from 'lucide-react';
import { reportProblem } from '../../services/diagnostics';
import CanLinkPanel from '../../components/canmonitor/CanLinkPanel';
import CanConnectionPanel from '../../components/canmonitor/CanConnectionPanel';
import { useUIStore } from '../uiStore';
import { getEffectiveTheme } from '../../settings';
import { useT } from '../../i18n';

interface MonitorLine { time: number; source: string; text: string }
interface MonitorState {
  logAccess: boolean; running: boolean; onlyCan: boolean;
  lines: MonitorLine[]; canApps: { package: string; name: string }[];
}
type Tab = 'Live' | 'Detection' | 'Link' | 'Connection' | 'Apps';

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

// GPS-regels van de radio: bevatten 'speed' maar komen niet van de CAN-bus (zie CanMonitor.kt gpsPattern)
const GPS_PATTERN = /WatermarkService|AtcLocation|updateAslSpeed|LocationManager|GnssLocation|\bgps\b|\bnmea\b/i;

// Kaarten (zelfde stijl als de OBD2-app), compacte icoonknoppen in de kop en tabs over de hele breedte
const CSS = `
.can-app { --th-tile: var(--tsl-white); }
.can-app.dark-mode { --th-tile: rgba(255, 255, 255, 0.07); }
.can-app .can-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.can-app .can-head .tsl-title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.can-app .can-icon-btn { position: relative; flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 44px; min-width: 44px; padding: 0 11px; box-sizing: border-box; border: none; border-radius: 22px; background: var(--tsl-btn-secondary); color: var(--tsl-btn-secondary-text); font-size: calc(14px * var(--text-scale, 1)); font-weight: 600; white-space: nowrap; cursor: pointer; }
.can-app .can-icon-btn.is-active { background: var(--tsl-blue); color: #fff; }
.can-app .can-rec-dot { position: absolute; top: 5px; right: 5px; width: 10px; height: 10px; border-radius: 50%; background: var(--tsl-red); }
.can-app .can-tabs.tsl-segmented { display: flex; flex: none; width: 100%; max-width: none; }
.can-app .can-tabs button { min-width: 0; padding: 0 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.can-app .can-tabs button + button { border-left: 1px solid var(--tsl-border); }
.can-app .can-grid { flex: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.can-app .can-card { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; padding: 10px 14px; border-radius: 10px; background: var(--th-tile); }
.can-app .can-card-label { font-size: calc(13px * var(--text-scale, 1)); color: var(--tsl-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.can-app .can-card-value { display: flex; align-items: center; gap: 8px; min-width: 0; height: calc(36px * var(--text-scale, 1)); font-size: calc(28px * var(--text-scale, 1)); font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }
.can-app .can-card-value.is-text { font-size: calc(18px * var(--text-scale, 1)); }
.can-app .can-dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--tsl-muted); }
.can-app .can-dot.is-on { background: #25cb55; }
.can-app .can-dot.is-busy { background: #f5b301; }
`;

// CAN-ID's in de regels: "id=0x2C1", "can_id: 1A0" of een los 11-bits id als "0x3E5". De regels zijn tekst uit het
// logboek/broadcasts, dus dit is een schatting; staan er geen ID's in, dan tellen we verschillende signalen.
const ID_PATTERNS = [/\b(?:can[_ ]?)?id\s*[:=]\s*(?:0x)?([0-9a-f]{2,8})\b/gi, /\b0x([0-7][0-9a-f]{2})\b/gi];
const signature = (text: string) => text.replace(/^[VDIWEF]\//, '').replace(/\d+/g, '#').trim(); // zoals CanMonitor.kt
const RATE_WINDOW = 5000; // berichten per seconde over de laatste 5 seconden

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
    const hits = lines.filter((l) => !GPS_PATTERN.test(l.text) && signal.pattern.test(l.text));
    return { ...signal, count: hits.length, last: hits[hits.length - 1] };
  });
  // GPS apart tonen, zodat duidelijk is dat die regels herkend zijn maar niet als autodata tellen
  const gpsHits = lines.filter((l) => GPS_PATTERN.test(l.text));
  detections.push({ label: 'GPS (not CAN)', pattern: GPS_PATTERN, count: gpsHits.length, last: gpsHits[gpsHits.length - 1] });

  // Kaarten bovenaan Live: alles uit de regels die de app al heeft (de radio stuurt de laatste 200)
  const now = Date.now();
  const recent = lines.filter((l) => l.time > now - RATE_WINDOW);
  // Is de lijst vol en valt de oudste regel binnen het venster, dan alleen over die periode rekenen
  const span = lines.length >= 200 && recent.length === lines.length ? Math.max(1000, now - lines[0].time) : RATE_WINDOW;
  const rate = state?.running ? recent.length / (span / 1000) : 0;
  const ids = new Set<string>();
  lines.forEach((l) => ID_PATTERNS.forEach((re) => {
    for (const m of Array.from(l.text.matchAll(re))) ids.add(parseInt(m[1], 16).toString(16));
  }));
  const signals = new Set(lines.map((l) => signature(l.text))).size;
  const connection = !state ? { label: 'No information.', tone: '' }
    : !state.running ? { label: 'Stopped', tone: '' }
    : state.logAccess ? { label: 'Full log', tone: 'is-on' } : { label: 'Broadcasts only', tone: 'is-busy' };
  const lineCount = `${lines.length} ${t(lines.length === 1 ? 'line' : 'lines')}`;
  const recordLabel = t(state?.running ? 'Stop recording' : 'Start recording');
  const toggleRecording = () => {
    if (state?.running) { bridge().canMonitorStop(); setTimeout(read, 200); }
    else { bridge().canMonitorStart(onlyCan); setTimeout(read, 300); }
  };

  return (
    <div className={`settings-overlay-container tsl-ui can-app ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 24px',
        background: 'var(--tsl-bg)', overflow: 'hidden', boxSizing: 'border-box' }}>
      <style>{CSS}</style>

      {/* Kop: titel, compacte icoonknoppen (opnemen, filter, opslaan, wissen, melden) en sluiten */}
      <div className="can-head">
        <Activity size={22} style={{ flex: 'none' }} />
        <span className="tsl-title">{t('CAN monitor')}</span>
        {available && (
          <>
            <button className="can-icon-btn" onClick={toggleRecording} title={recordLabel} aria-label={recordLabel}>
              {state?.running ? <><Square size={18} /><i className="can-rec-dot" /></> : <Circle size={18} />}
            </button>
            <button className={`can-icon-btn ${onlyCan ? 'is-active' : ''}`} aria-pressed={onlyCan}
              title={t(onlyCan ? 'Car only' : 'Everything')}
              onClick={() => { setOnlyCan(!onlyCan); if (state?.running) restart(!onlyCan); }}>
              <Filter size={18} /> {t(onlyCan ? 'Car only' : 'Everything')}
            </button>
            <button className="can-icon-btn" title={t('Save')} aria-label={t('Save')}
              onClick={() => setSavedPath(bridge().canMonitorSave())}><Save size={18} /></button>
            <button className="can-icon-btn" title={t('Clear')} aria-label={t('Clear')}
              onClick={() => { bridge().canMonitorClear(); setSavedPath(null); read(); }}><Trash2 size={18} /></button>
            <button className="can-icon-btn" title={t('Report a problem')} aria-label={t('Report a problem')}
              onClick={async () => setSavedPath(await reportProblem('Gemeld vanuit de CAN-monitor', {
                title: 'CAN-monitor (laatste 200)', lines: (state?.lines ?? []).slice(-200).map((l) => `${l.source}: ${l.text}`),
              }))}><Share2 size={18} /></button>
          </>
        )}
        <button className="can-icon-btn" onClick={closeCanMonitor} title={t('Close')} aria-label={t('Close')}><X size={20} /></button>
      </div>

      {!available ? (
        <small className="tsl-hint">{t('The CAN monitor only works on the radio.')}</small>
      ) : (
        <>
          {savedPath && <small className="tsl-hint">{t('Saved as')} <code>{savedPath}</code></small>}
          {state && !state.logAccess && (
            <small className="tsl-hint" style={{ color: 'var(--tsl-red)' }}>
              {t('Only signals from known broadcasts. For the full radio log, allow it once via ADB:')} <code>adb shell pm grant nl.pandaos.launcher android.permission.READ_LOGS</code>
            </small>
          )}

          <div className="tsl-segmented can-tabs">
            {(['Live', 'Detection', 'Link', 'Connection', 'Apps'] as Tab[]).map((name) => (
              <button key={name} className={tab === name ? 'is-active' : ''} onClick={() => setTab(name)}>{t(name)}</button>
            ))}
          </div>

          {/* Live regels */}
          {tab === 'Live' && (
            <div className="can-grid">
              <div className="can-card">
                <span className="can-card-label">{t('Messages per second')}</span>
                <span className="can-card-value">{rate < 10 ? rate.toFixed(1) : Math.round(rate)}</span>
              </div>
              <div className="can-card">
                <span className="can-card-label">{t(ids.size || !signals ? 'CAN IDs' : 'Different signals')}</span>
                <span className="can-card-value">{ids.size || signals}</span>
              </div>
              <div className="can-card">
                <span className="can-card-label">{t('Connection')}</span>
                <span className="can-card-value is-text"><i className={`can-dot ${connection.tone}`} />{t(connection.label)}</span>
              </div>
            </div>
          )}
          {tab === 'Live' && <small className="tsl-hint" style={{ marginBottom: -4 }}>{lineCount}</small>}
          {tab === 'Live' && (
            <div ref={listRef} style={{
              flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, borderRadius: 8, background: '#0d0d0d', color: '#9fef9f',
              fontFamily: 'monospace', fontSize: 'calc(13px * var(--text-scale, 1))', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {lines.length === 0
                ? <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#888' }}>
                    {state?.running ? t('Waiting for signals… Shift into R, open a door or turn on the lights.') : t('Tap the record button to begin.')}
                  </div>
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

          {/* Koppelen: signalen van de radio aan functies van PandaOS koppelen, door te leren */}
          {tab === 'Link' && <CanLinkPanel logAccess={!!state?.logAccess} />}

          {/* Verbinding: poorten, eigenschappen en apps van de radio */}
          {tab === 'Connection' && <CanConnectionPanel />}

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
