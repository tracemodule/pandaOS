// Radio: FM/AM/DAB van de radio zelf (Jancar-tuner, app com.jancar.radio), in de stijl van het radioscherm van Tesla:
// tabbladen Zenders | Direct afstemmen | Favorieten, een groot vak met de zender die nu speelt (vorige/volgende = zoeken)
// en een raster met zenders. De launcher (JancarRadio.kt) leest de radio via zijn mediasessie en het logboek en stuurt
// het DOM-event 'pandaos-radio'; getRadioInfo() geeft hetzelfde op vraag. Afstemmen gaat via geraden broadcasts en is
// nog niet geverifieerd op de radio (zie BEVINDINGEN.md, "Radio (Jancar)").
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Radio, SkipBack, SkipForward, Play, Pause, Star, Delete, Minus, Plus, Settings } from 'lucide-react';
import { useUIStore } from '../uiStore';
import { useT } from '../../i18n';
import { getEffectiveTheme } from '../../settings';
import './_theater.scss';

const bridge = () => (window as any).PandaAndroid;

type Band = 'FM' | 'AM' | 'DAB';
type Tab = 'stations' | 'tune' | 'favourites';

interface Station { band: Band; freq: number | null; name?: string; text?: string; lastSeen?: number; preset?: number }
interface Favourite { name: string; freq: number | null; band: Band }
interface RadioInfo {
  available?: boolean;
  installed?: boolean;
  label?: string;
  sessionAccess?: boolean;
  session?: { package: string; title: string; artist: string; album: string; playing: boolean } | null;
  log?: { readable: boolean; running: boolean; lines: number; shapes: number };
  current?: { band: Band | null; freq: number | null; ps: string | null; rt: string | null; updatedAt: number } | null;
  presets?: { index: number; band: Band; freq: number }[];
  stations?: Station[];
  lastTune?: { band: Band; freq: number; at: number; verified: boolean } | null;
}

const FAV_KEY = 'pandaos-radio-favourites';
const RANGE: Record<'FM' | 'AM', { min: number; max: number; step: number }> = {
  FM: { min: 87.5, max: 108.0, step: 0.1 },
  AM: { min: 531, max: 1602, step: 9 },
};

const readInfo = (): RadioInfo | null => {
  try { return bridge()?.getRadioInfo ? JSON.parse(bridge().getRadioInfo()) : null; } catch { return null; }
};
const loadFavourites = (): Favourite[] => {
  try { const list = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]'); return Array.isArray(list) ? list : []; } catch { return []; }
};
const keyOf = (s: { band: Band; freq: number | null; name?: string }) => `${s.band}:${s.freq ?? s.name ?? ''}`;
const fmt = (band: Band | null | undefined, freq: number | null | undefined) =>
  freq == null ? (band ?? '') : band === 'AM' ? `${Math.round(freq)} kHz` : `${freq.toFixed(1)} MHz`;
const snap = (band: 'FM' | 'AM', v: number) => {
  const r = RANGE[band];
  const n = Math.round((v - r.min) / r.step) * r.step + r.min;
  return Math.min(r.max, Math.max(r.min, band === 'FM' ? Math.round(n * 10) / 10 : Math.round(n)));
};
// Logo: initialen in een gekleurde cirkel (kleur uit de naam)
const initials = (name: string) => {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length === 1 ? words[0].slice(0, 3) : words.slice(0, 2).map((w) => w[0]).join('')).toUpperCase();
};
const hue = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const Logo: React.FC<{ name: string; size: number }> = ({ name, size }) => (
  <div className="rd-logo" style={{ width: size, height: size, fontSize: size * 0.32, background: `hsl(${hue(name)} 55% 42%)` }}>
    {initials(name)}
  </div>
);

const CSS = `
.rd-app .rd-head { display: flex; align-items: center; gap: 16px; }
.rd-app .rd-head .tsl-segmented { flex: 1; max-width: 520px; margin: 0 auto; }
.rd-app .rd-now { display: flex; align-items: center; gap: 20px; padding: 16px 20px; border-radius: 12px; background: var(--th-hero); }
.rd-app .rd-logo { flex: none; display: flex; align-items: center; justify-content: center; border-radius: 50%; color: #fff; font-weight: 800; letter-spacing: -0.02em; }
.rd-app .rd-now-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.rd-app .rd-now-name { font-size: calc(26px * var(--text-scale, 1)); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rd-app .rd-now-sub { font-size: calc(15px * var(--text-scale, 1)); color: var(--tsl-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rd-app .rd-chip { align-self: flex-start; padding: 2px 8px; border-radius: 4px; background: var(--th-tile); font-size: calc(12px * var(--text-scale, 1)); font-weight: 600; }
.rd-app .rd-ctrls { display: flex; align-items: center; gap: 10px; }
.rd-app .rd-round { display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; border: none; border-radius: 50%; background: var(--th-tile); color: var(--tsl-text); cursor: pointer; }
.rd-app .rd-round:active { background: var(--th-tile-active); }
.rd-app .rd-round.is-on { color: #f5b301; }
.rd-app .rd-bar { display: flex; align-items: center; gap: 16px; }
.rd-app .rd-bar .tsl-segmented { width: 240px; height: 40px; }
.rd-app .rd-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.rd-app .rd-tile { position: relative; display: flex; align-items: center; gap: 12px; min-width: 0; padding: 12px 14px; border: 2px solid transparent; border-radius: 10px; background: var(--th-tile); color: var(--tsl-text); text-align: left; cursor: pointer; }
.rd-app .rd-tile:active { background: var(--th-tile-active); }
.rd-app .rd-tile.is-current { border-color: #3e6ae1; }
.rd-app .rd-tile-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rd-app .rd-tile-name { font-size: calc(16px * var(--text-scale, 1)); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rd-app .rd-tile-sub { font-size: calc(13px * var(--text-scale, 1)); color: var(--tsl-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rd-app .rd-tile-x { position: absolute; top: 6px; right: 6px; display: flex; padding: 4px; border: none; border-radius: 50%; background: transparent; color: var(--tsl-muted); cursor: pointer; }
.rd-app .rd-card { display: flex; align-items: center; gap: 16px; padding: 16px 18px; border-radius: 12px; background: var(--th-tile); }
.rd-app .rd-card-text { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.rd-app .rd-tune { display: flex; gap: 24px; align-items: stretch; }
.rd-app .rd-tune-main { flex: 1; display: flex; flex-direction: column; gap: 14px; justify-content: center; }
.rd-app .rd-tune-value { font-size: calc(54px * var(--text-scale, 1)); font-weight: 700; text-align: center; font-variant-numeric: tabular-nums; }
.rd-app .rd-tune-value small { font-size: 0.4em; font-weight: 600; color: var(--tsl-muted); margin-left: 8px; }
.rd-app .rd-tune-row { display: flex; align-items: center; gap: 12px; }
.rd-app .rd-tune-row input[type=range] { flex: 1; accent-color: #3e6ae1; height: 28px; }
.rd-app .rd-keypad { display: grid; grid-template-columns: repeat(3, 64px); gap: 8px; }
.rd-app .rd-keypad button { height: 52px; border: none; border-radius: 8px; background: var(--th-tile); color: var(--tsl-text); font-size: calc(20px * var(--text-scale, 1)); font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.rd-app .rd-keypad button:active { background: var(--th-tile-active); }
`;

const RadioApp: React.FC = () => {
  const t = useT();
  const { closePanelApp, openSettingsTab, screenMode, vehicleLightsOn } = useUIStore();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const [info, setInfo] = useState<RadioInfo | null>(readInfo);
  const [tab, setTab] = useState<Tab>('stations');
  const [band, setBand] = useState<Band>(() => readInfo()?.current?.band ?? 'FM');
  const [favourites, setFavourites] = useState<Favourite[]>(loadFavourites);

  // Live: event van de launcher, plus elke 3 s vragen (mediasessie, toegang die intussen gegeven is)
  useEffect(() => {
    const onRadio = (e: Event) => { const detail = (e as CustomEvent).detail; if (detail) setInfo(detail); };
    window.addEventListener('pandaos-radio', onRadio);
    const timer = window.setInterval(() => { const next = readInfo(); if (next) setInfo(next); }, 3000);
    return () => { window.removeEventListener('pandaos-radio', onRadio); window.clearInterval(timer); };
  }, []);

  const saveFavourites = (list: Favourite[]) => {
    setFavourites(list);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch { /* vol of geblokkeerd */ }
  };

  const installed = !!info?.installed;
  const current = info?.current ?? null;
  const session = info?.session ?? null;
  const learned = info?.stations ?? [];
  const nameFor = useCallback((b: Band, f: number | null) =>
    learned.find((s) => s.band === b && s.freq != null && f != null && Math.abs(s.freq - f) < 0.05)?.name, [learned]);

  // Zender die nu speelt
  const nowBand = (current?.band ?? null) as Band | null;
  const nowFreq = current?.freq ?? null;
  const freqText = nowFreq != null ? `${nowBand ?? ''} ${fmt(nowBand, nowFreq)}`.trim() : '';
  const nowName = current?.ps || session?.title || (nowBand ? nameFor(nowBand, nowFreq) : undefined) || freqText;
  const nowText = current?.rt || session?.artist || (nowName !== freqText ? freqText : '');
  const hasNow = !!nowName;
  const nowStation: Station | null = nowBand && (nowFreq != null || nowName)
    ? { band: nowBand, freq: nowFreq, name: current?.ps || session?.title || undefined } : null;
  const isFavourite = (s: { band: Band; freq: number | null; name?: string }) => favourites.some((f) => keyOf(f) === keyOf(s));
  const isCurrent = (s: Station) => !!nowStation && s.band === nowStation.band &&
    (s.freq != null && nowStation.freq != null ? Math.abs(s.freq - nowStation.freq) < 0.05 : s.name === nowStation.name);

  // Zenders van deze band: geleerd (gespeeld op de radio) + voorkeuzes + favorieten + de huidige
  const stations = useMemo(() => {
    const map = new Map<string, Station>();
    const add = (s: Station) => {
      const k = keyOf(s);
      const old = map.get(k);
      map.set(k, { ...s, ...old, name: old?.name || s.name, text: old?.text || s.text, preset: old?.preset ?? s.preset });
    };
    learned.filter((s) => s.band === band).forEach(add);
    (info?.presets ?? []).filter((p) => p.band === band)
      .forEach((p) => add({ band: p.band, freq: p.freq, name: nameFor(p.band, p.freq), preset: p.index }));
    favourites.filter((f) => f.band === band).forEach((f) => add({ band: f.band, freq: f.freq, name: f.name || undefined }));
    if (nowStation && nowStation.band === band) add({ ...nowStation, text: current?.rt ?? undefined });
    return [...map.values()].sort((a, b) => (a.freq ?? 0) - (b.freq ?? 0) || (a.name ?? '').localeCompare(b.name ?? ''));
  }, [learned, info?.presets, favourites, band, nameFor, nowStation?.band, nowStation?.freq, nowStation?.name, current?.rt]);

  // Afstemmen (geraden broadcasts, niet geverifieerd) en de radio-app kort openen: dat zet de bron op radio
  const play = (s: Station) => {
    const android = bridge();
    if (!android) return;
    if (s.freq != null) android.tuneRadio?.(s.freq, s.band);
    android.openJancarRadio?.(s.band, s.freq != null); // DAB zonder frequentie: de radio-app open laten om te kiezen
    window.setTimeout(() => { const next = readInfo(); if (next) setInfo(next); }, 1500);
  };
  const command = (cmd: string) => bridge()?.radioCommand?.(cmd);
  const openRadio = () => bridge()?.openJancarRadio?.(band, false);
  const openAppsSettings = () => { closePanelApp(); openSettingsTab('Apps'); };

  const toggleFavourite = (s: Station) => {
    if (isFavourite(s)) saveFavourites(favourites.filter((f) => keyOf(f) !== keyOf(s)));
    else saveFavourites([...favourites, { name: s.name ?? '', freq: s.freq, band: s.band }]);
  };

  // Afstemstatus: net afgestemd en nog niet bevestigd door de radio
  const tune = info?.lastTune;
  const tuneAge = tune ? Date.now() - tune.at : Infinity;
  const tuneStatus = !tune || tuneAge > 20000 ? '' : tune.verified ? ''
    : tuneAge < 3500 ? `${t('Tuning to')} ${fmt(tune.band, tune.freq)}…`
    : t('The radio did not confirm the new frequency. Open the radio to tune there.');

  // Tegel als functie (geen eigen component: geen nieuw component-type bij elke update)
  const tile = (s: Station, removable = false) => {
    const label = s.name || fmt(s.band, s.freq);
    const sub = isCurrent(s) && current?.rt ? current.rt : s.name ? fmt(s.band, s.freq) : s.preset != null ? `${t('Preset')} ${s.preset}` : s.band;
    return (
      <button key={keyOf(s)} className={`rd-tile ${isCurrent(s) ? 'is-current' : ''}`} onClick={() => play(s)}>
        <Logo name={s.name || (s.freq != null ? s.freq.toFixed(s.band === 'AM' ? 0 : 1) : s.band)} size={44} />
        <span className="rd-tile-text">
          <span className="rd-tile-name">{label}</span>
          <span className="rd-tile-sub">{sub}</span>
        </span>
        {removable && (
          <span className="rd-tile-x" role="button" aria-label={t('Remove from favourites')}
            onClick={(e) => { e.stopPropagation(); toggleFavourite(s); }}><X size={16} /></span>
        )}
      </button>
    );
  };

  const notice = !installed ? (
    <div className="rd-card">
      <Radio size={28} />
      <div className="rd-card-text">
        <span className="tsl-field-text">{t('Radio of the car not found')}</span>
        <span className="tsl-hint">{t('PandaOS plays FM, AM and DAB through the radio app of the car. It was not found on this device. You can link another radio app in Settings > Apps.')}</span>
      </div>
      <button className="tsl-btn is-small" onClick={openAppsSettings}><Settings size={16} />{t('Settings > Apps')}</button>
    </div>
  ) : !hasNow && learned.length === 0 && !(info?.presets?.length) ? (
    <div className="rd-card">
      <Radio size={28} />
      <div className="rd-card-text">
        <span className="tsl-field-text">{t('Start the radio once; PandaOS learns the stations')}</span>
        <span className="tsl-hint">{t('Open the radio of the car and play a station. PandaOS then shows the station, its text and the stations you played.')}</span>
      </div>
      <button className="tsl-btn is-primary is-small" onClick={openRadio}>{t('Open radio')}</button>
    </div>
  ) : null;

  return (
    <div className={`theater-app tsl-ui rd-app ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
      <style>{CSS}</style>
      <div className="rd-head">
        <div className="theater-title"><Radio size={22} /><span>{t('Radio')}</span></div>
        <div className="tsl-segmented">
          <button className={tab === 'stations' ? 'is-active' : ''} onClick={() => setTab('stations')}>{t('Stations')}</button>
          <button className={tab === 'tune' ? 'is-active' : ''} onClick={() => setTab('tune')}>{t('Direct tune')}</button>
          <button className={tab === 'favourites' ? 'is-active' : ''} onClick={() => setTab('favourites')}>{t('Favourites')}</button>
        </div>
        <button className="theater-close" onClick={closePanelApp} aria-label={t('Close')}><X size={22} /></button>
      </div>

      <div className="rd-now">
        <Logo name={nowName || 'Radio'} size={84} />
        <div className="rd-now-text">
          <span className="rd-now-name">{nowName || t('No station')}</span>
          <span className="rd-now-sub">{nowText || (installed ? t('Start the radio to see the station') : '')}</span>
          {nowBand && <span className="rd-chip">{nowBand}{nowFreq != null && nowName !== freqText ? ` · ${fmt(nowBand, nowFreq)}` : ''}</span>}
        </div>
        <div className="rd-ctrls">
          <button className="rd-round" onClick={() => command('prev')} aria-label={t('Previous station')} disabled={!installed}><SkipBack size={24} /></button>
          <button className="rd-round" onClick={() => command(session ? (session.playing ? 'pause' : 'play') : 'toggle')} disabled={!installed}
            aria-label={session?.playing ? t('Pause') : t('Play')}>{session?.playing ? <Pause size={24} /> : <Play size={24} />}</button>
          <button className="rd-round" onClick={() => command('next')} aria-label={t('Next station')} disabled={!installed}><SkipForward size={24} /></button>
          <button className={`rd-round ${nowStation && isFavourite(nowStation) ? 'is-on' : ''}`} disabled={!nowStation}
            onClick={() => nowStation && toggleFavourite(nowStation)}
            aria-label={nowStation && isFavourite(nowStation) ? t('Remove from favourites') : t('Add to favourites')}>
            <Star size={22} fill={nowStation && isFavourite(nowStation) ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      <div className="rd-bar">
        <div className="tsl-segmented">
          {(['FM', 'AM', 'DAB'] as Band[]).map((b) => (
            <button key={b} className={band === b ? 'is-active' : ''} onClick={() => setBand(b)}>{b}</button>
          ))}
        </div>
        {tuneStatus && <span className="tsl-hint">{tuneStatus}</span>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {notice}
        {tab === 'stations' && (stations.length ? (
          <div className="rd-grid">{stations.map((s) => tile(s))}</div>
        ) : installed && !notice ? <p className="tsl-hint">{t('Stations appear here once the radio has played them.')}</p> : null)}
        {tab === 'favourites' && (() => {
          const list = favourites.filter((f) => f.band === band);
          return list.length
            ? <div className="rd-grid">{list.map((f) => tile({ ...f, name: f.name || undefined }, true))}</div>
            : <p className="tsl-hint">{t('No favourites yet. Tap the star to add the station that is playing.')}</p>;
        })()}
        {tab === 'tune' && (band === 'DAB'
          ? <p className="tsl-hint">{t('Direct tune is not available for DAB. Open the radio to choose a DAB station.')}</p>
          : <DirectTune key={band} band={band} start={nowBand === band ? nowFreq : null}
              onTune={(f) => play({ band, freq: f })}
              isFavourite={(f) => isFavourite({ band, freq: f })}
              onFavourite={(f) => toggleFavourite({ band, freq: f, name: nameFor(band, f) })} />)}
      </div>
    </div>
  );
};

// Direct afstemmen: schuif, stappen en toetsen (FM 87,5-108,0 per 0,1; AM 531-1602 per 9)
const DirectTune: React.FC<{
  band: 'FM' | 'AM'; start: number | null;
  onTune: (freq: number) => void; isFavourite: (freq: number) => boolean; onFavourite: (freq: number) => void;
}> = ({ band, start, onTune, isFavourite, onFavourite }) => {
  const t = useT();
  const r = RANGE[band];
  const [value, setValue] = useState(() => snap(band, start ?? r.min));
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');

  // Getypte waarde: FM "1017" = 101,7
  const parseTyped = (text: string): number | null => {
    let v = parseFloat(text);
    if (!isFinite(v)) return null;
    if (band === 'FM' && !text.includes('.') && v > r.max) v = v / 10;
    return v >= r.min && v <= r.max ? snap(band, v) : null;
  };
  const press = (key: string) => {
    setError('');
    if (key === 'del') { setTyped((s) => s.slice(0, -1)); return; }
    if (key === '.' && (band === 'AM' || typed.includes('.'))) return;
    if (typed.replace('.', '').length >= 4) return;
    setTyped((s) => s + key);
  };
  const tune = () => {
    let f = value;
    if (typed) {
      const parsed = parseTyped(typed);
      if (parsed == null) { setError(t('Out of range')); return; }
      f = parsed; setValue(parsed); setTyped('');
    }
    onTune(f);
  };
  const shown = typed || (band === 'FM' ? value.toFixed(1) : String(value));
  const fav = !typed && isFavourite(value);

  return (
    <div className="rd-tune">
      <div className="rd-tune-main">
        <div className="rd-tune-value">{shown}<small>{band === 'FM' ? 'MHz' : 'kHz'}</small></div>
        <div className="rd-tune-row">
          <button className="rd-round" aria-label="-" onClick={() => { setTyped(''); setValue((v) => snap(band, v - r.step)); }}><Minus size={22} /></button>
          <input type="range" min={r.min} max={r.max} step={r.step} value={value}
            onChange={(e) => { setTyped(''); setValue(snap(band, parseFloat(e.target.value))); }} />
          <button className="rd-round" aria-label="+" onClick={() => { setTyped(''); setValue((v) => snap(band, v + r.step)); }}><Plus size={22} /></button>
        </div>
        <div className="rd-tune-row" style={{ justifyContent: 'center' }}>
          <button className="tsl-btn is-primary" onClick={tune}>{t('Tune')}</button>
          <button className={`rd-round ${fav ? 'is-on' : ''}`} disabled={!!typed} onClick={() => onFavourite(value)}
            aria-label={fav ? t('Remove from favourites') : t('Add to favourites')}>
            <Star size={22} fill={fav ? 'currentColor' : 'none'} />
          </button>
        </div>
        {error && <p className="tsl-hint" style={{ textAlign: 'center', color: 'var(--tsl-red)' }}>{error}</p>}
      </div>
      <div className="rd-keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'].map((k) => (
          <button key={k} onClick={() => press(k)} disabled={k === '.' && band === 'AM'}>{k}</button>
        ))}
        <button onClick={() => press('del')} aria-label={t('Delete')}><Delete size={20} /></button>
      </div>
    </div>
  );
};

export default RadioApp;
