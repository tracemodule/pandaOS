// OBD2-app (paneel naast de auto): ELM327-dongle via Bluetooth, live waarden, foutcodes en verbindingsinfo.
// De launcher praat met de dongle (window.PandaAndroid.obd*), services/obd.ts houdt de toestand bij.
//  - Niet verbonden: gekoppelde apparaten (waarschijnlijke OBD-dongles eerst), Demo, automatisch verbinden, uitleg
//  - Verbonden: tabbladen Live | Foutcodes | Info
// Foutcodes wissen kan bewust niet: dat hoort bij een garage-tester (anders verdwijnt ook de info voor de garage).
// Alleen gewone CSS/SVG (geen blur/grote verlopen): de software-GPU van de radio kan daar niet tegen.
import React, { useEffect, useMemo, useState } from 'react';
import { X, Gauge, Bluetooth, RefreshCw, Settings } from 'lucide-react';
import { useUIStore } from '../uiStore';
import { useT } from '../../i18n';
import { getEffectiveTheme } from '../../settings';
import {
  useObd, obdListDevices, obdGetSettings, obdBluetoothInfo, obdConnect, obdDisconnect, obdSetAutoConnect, obdReadDtc,
  setObdDemoFeed, refreshObd, type ObdDevice, type ObdSettings, type ObdBluetoothInfo, type ObdState,
} from '../../services/obd';
import './_theater.scss';

type Tab = 'live' | 'dtc' | 'info';

const RPM_MAX = 7000;
const RPM_RED = 6000; // benzine Golf 6: rood vanaf ~6000

// Veelvoorkomende P-codes: [Engels, Nederlands]
const DTC_TEXT: Record<string, [string, string]> = {
  P0100: ['Mass air flow sensor: circuit fault', 'Luchtmassameter: storing in circuit'],
  P0101: ['Mass air flow sensor: range/performance', 'Luchtmassameter: waarde buiten bereik'],
  P0102: ['Mass air flow sensor: signal too low', 'Luchtmassameter: signaal te laag'],
  P0103: ['Mass air flow sensor: signal too high', 'Luchtmassameter: signaal te hoog'],
  P0106: ['Intake pressure sensor: range/performance', 'Inlaatdruksensor: waarde buiten bereik'],
  P0110: ['Intake air temperature sensor: circuit fault', 'Inlaatluchttemperatuursensor: storing in circuit'],
  P0113: ['Intake air temperature sensor: signal too high', 'Inlaatluchttemperatuursensor: signaal te hoog'],
  P0115: ['Coolant temperature sensor: circuit fault', 'Koelvloeistoftemperatuursensor: storing in circuit'],
  P0117: ['Coolant temperature sensor: signal too low', 'Koelvloeistoftemperatuursensor: signaal te laag'],
  P0118: ['Coolant temperature sensor: signal too high', 'Koelvloeistoftemperatuursensor: signaal te hoog'],
  P0121: ['Throttle position sensor: range/performance', 'Gasklepsensor: waarde buiten bereik'],
  P0128: ['Thermostat: engine does not warm up enough', 'Thermostaat: motor wordt niet warm genoeg'],
  P0130: ['Oxygen sensor (bank 1, sensor 1): circuit fault', 'Lambdasonde (bank 1, sensor 1): storing in circuit'],
  P0133: ['Oxygen sensor (bank 1, sensor 1): slow response', 'Lambdasonde (bank 1, sensor 1): reageert traag'],
  P0135: ['Oxygen sensor heater (bank 1, sensor 1)', 'Verwarming lambdasonde (bank 1, sensor 1) defect'],
  P0141: ['Oxygen sensor heater (bank 1, sensor 2)', 'Verwarming lambdasonde (bank 1, sensor 2) defect'],
  P0171: ['Mixture too lean (bank 1)', 'Mengsel te arm (bank 1)'],
  P0172: ['Mixture too rich (bank 1)', 'Mengsel te rijk (bank 1)'],
  P0234: ['Turbo: boost pressure too high', 'Turbo: laaddruk te hoog'],
  P0299: ['Turbo: boost pressure too low', 'Turbo: laaddruk te laag'],
  P0300: ['Misfire: random/multiple cylinders', 'Overslaan: willekeurige/meerdere cilinders'],
  P0301: ['Misfire: cylinder 1', 'Overslaan: cilinder 1'],
  P0302: ['Misfire: cylinder 2', 'Overslaan: cilinder 2'],
  P0303: ['Misfire: cylinder 3', 'Overslaan: cilinder 3'],
  P0304: ['Misfire: cylinder 4', 'Overslaan: cilinder 4'],
  P0325: ['Knock sensor: circuit fault', 'Klopsensor: storing in circuit'],
  P0335: ['Crankshaft position sensor: circuit fault', 'Krukassensor: storing in circuit'],
  P0340: ['Camshaft position sensor: circuit fault', 'Nokkenassensor: storing in circuit'],
  P0351: ['Ignition coil cylinder 1: circuit fault', 'Bobine cilinder 1: storing'],
  P0352: ['Ignition coil cylinder 2: circuit fault', 'Bobine cilinder 2: storing'],
  P0353: ['Ignition coil cylinder 3: circuit fault', 'Bobine cilinder 3: storing'],
  P0354: ['Ignition coil cylinder 4: circuit fault', 'Bobine cilinder 4: storing'],
  P0411: ['Secondary air injection: incorrect flow', 'Secundaire luchtinjectie: verkeerde doorstroming'],
  P0420: ['Catalytic converter efficiency too low (bank 1)', 'Katalysator: rendement te laag (bank 1)'],
  P0440: ['Fuel vapour system (EVAP): fault', 'Brandstofdampsysteem (EVAP): storing'],
  P0441: ['Fuel vapour system: incorrect purge flow', 'Brandstofdampsysteem: verkeerde spoelstroom (koolfilterklep)'],
  P0442: ['Fuel vapour system: small leak', 'Brandstofdampsysteem: klein lek'],
  P0455: ['Fuel vapour system: large leak (check fuel cap)', 'Brandstofdampsysteem: groot lek (controleer tankdop)'],
  P0456: ['Fuel vapour system: very small leak', 'Brandstofdampsysteem: zeer klein lek'],
  P0500: ['Vehicle speed sensor: fault', 'Snelheidssensor: storing'],
  P0505: ['Idle control system: fault', 'Stationairregeling: storing'],
  P0506: ['Idle speed lower than expected', 'Stationair toerental te laag'],
  P0507: ['Idle speed higher than expected', 'Stationair toerental te hoog'],
  P0560: ['System voltage: fault', 'Boordspanning: storing'],
  P0562: ['System voltage too low', 'Boordspanning te laag'],
  P0563: ['System voltage too high', 'Boordspanning te hoog'],
  P0600: ['Engine control unit: communication fault', 'Motorregeling: communicatiefout'],
  P0700: ['Transmission control: fault (read the gearbox)', 'Storing versnellingsbak (lees de bak apart uit)'],
  P2187: ['Mixture too lean at idle (bank 1)', 'Mengsel te arm bij stationair (bank 1)'],
  P2188: ['Mixture too rich at idle (bank 1)', 'Mengsel te rijk bij stationair (bank 1)'],
  P2279: ['Intake air system leak', 'Valse lucht in het inlaatsysteem'],
};

const CSS = `
.obd-app .obd-status { display: flex; align-items: center; gap: 14px; padding: 10px 14px; border-radius: 12px; background: var(--th-tile); }
.obd-app .obd-pill { flex: none; display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; font-size: calc(14px * var(--text-scale, 1)); font-weight: 600; background: var(--th-tile-active); }
.obd-app .obd-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--tsl-muted); }
.obd-app .obd-pill.is-on { color: #1f9d4c; background: rgba(37, 203, 85, 0.15); }
.obd-app .obd-pill.is-on .obd-dot { background: #25cb55; }
.obd-app .obd-pill.is-busy { color: #c98a00; background: rgba(245, 179, 1, 0.16); }
.obd-app .obd-pill.is-busy .obd-dot { background: #f5b301; animation: obd-blink 1s steps(2, start) infinite; }
.obd-app .obd-pill.is-error { color: var(--tsl-red); background: rgba(237, 78, 59, 0.14); }
.obd-app .obd-pill.is-error .obd-dot { background: var(--tsl-red); }
@keyframes obd-blink { to { visibility: hidden; } }
.obd-app .obd-status-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.obd-app .obd-status-text > * { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.obd-app .obd-badge { display: inline-block; padding: 1px 7px; border-radius: 4px; background: #3e6ae1; color: #fff; font-size: calc(11px * var(--text-scale, 1)); font-weight: 700; letter-spacing: 0.04em; }
.obd-app .obd-badge.is-muted { background: var(--th-tile-active); color: var(--tsl-text); }
.obd-app .obd-body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.obd-app .obd-cols { display: flex; gap: 18px; align-items: flex-start; }
.obd-app .obd-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.obd-app .obd-device { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 2px solid transparent; border-radius: 10px; background: var(--th-tile); color: var(--tsl-text); text-align: left; cursor: pointer; min-height: 60px; }
.obd-app .obd-device:active { background: var(--th-tile-active); }
.obd-app .obd-device.is-last { border-color: #3e6ae1; }
.obd-app .obd-device:disabled { opacity: 0.5; }
.obd-app .obd-device-icon { flex: none; display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 50%; background: var(--th-tile-active); }
.obd-app .obd-device-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.obd-app .obd-device-text > * { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.obd-app .obd-steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; }
.obd-app .obd-steps li { font-size: calc(14px * var(--text-scale, 1)); line-height: 1.35; }
.obd-app .obd-live { display: flex; gap: 12px; align-items: stretch; }
.obd-app .obd-gauge { flex: 0 0 210px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px; border-radius: 12px; background: var(--th-tile); }
.obd-app .obd-gauge svg { width: 100%; height: auto; display: block; }
.obd-app .obd-grid { flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.obd-app .obd-card { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; padding: 10px 14px; border-radius: 10px; background: var(--th-tile); }
.obd-app .obd-card-label { font-size: calc(13px * var(--text-scale, 1)); color: var(--tsl-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.obd-app .obd-card-value { font-size: calc(28px * var(--text-scale, 1)); font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.obd-app .obd-card-value small { margin-left: 4px; font-size: 0.5em; font-weight: 600; color: var(--tsl-muted); }
.obd-app .obd-card.is-warn { box-shadow: inset 0 0 0 2px var(--tsl-red); }
.obd-app .obd-card.is-warn .obd-card-value { color: var(--tsl-red); }
.obd-app .obd-code { display: flex; align-items: center; gap: 14px; padding: 10px 14px; border-radius: 10px; background: var(--th-tile); }
.obd-app .obd-code-id { flex: none; width: 76px; font-size: calc(18px * var(--text-scale, 1)); font-weight: 800; font-variant-numeric: tabular-nums; }
.obd-app .obd-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 10px; background: var(--th-tile); }
.obd-app .obd-row > span:first-child { flex: 1; }
.obd-app .obd-row > .tsl-hint { text-align: right; }
`;

// Toerentalmeter: boog van 240°, rood vanaf RPM_RED
const RpmGauge: React.FC<{ rpm: number | null; label: string; locale: string }> = ({ rpm, label, locale }) => {
  const cx = 100, cy = 100, r = 78, start = 150, sweep = 240;
  const point = (deg: number, radius = r) => {
    const a = (deg * Math.PI) / 180;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)] as const;
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const frac = rpm == null ? 0 : Math.max(0, Math.min(1, rpm / RPM_MAX));
  const redFrom = start + (sweep * RPM_RED) / RPM_MAX;
  const hot = rpm != null && rpm >= RPM_RED;
  return (
    <svg viewBox="0 0 200 172" role="img" aria-label={label}>
      <path d={arc(start, start + sweep)} fill="none" stroke="var(--th-tile-active)" strokeWidth="14" strokeLinecap="round" />
      <path d={arc(redFrom, start + sweep)} fill="none" stroke="rgba(237, 78, 59, 0.45)" strokeWidth="14" />
      {frac > 0.004 && (
        <path d={arc(start, start + sweep * frac)} fill="none" stroke={hot ? 'var(--tsl-red)' : '#3e6ae1'} strokeWidth="14" strokeLinecap="round" />
      )}
      {Array.from({ length: RPM_MAX / 1000 + 1 }, (_, i) => {
        const deg = start + (sweep * i) / (RPM_MAX / 1000);
        const [x, y] = point(deg, r - 22);
        return <text key={i} x={x} y={y + 4} textAnchor="middle" fontSize="11" fill="var(--tsl-muted)">{i}</text>;
      })}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="34" fontWeight="700" fill="var(--tsl-text)">
        {rpm == null ? '—' : Math.round(rpm).toLocaleString(locale)}
      </text>
      <text x={cx} y={cy + 24} textAnchor="middle" fontSize="12" fill="var(--tsl-muted)">rpm</text>
      <text x={cx} y={cy + 66} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--tsl-muted)">{label}</text>
    </svg>
  );
};

// Gedeelde opmaak (eenheden uit Instellingen > Weergave)
const useUnits = () => {
  const { temperature, distance, language, timeFormat } = useUIStore((s) => s.displaySettings);
  const locale = language === 'nl' ? 'nl-NL' : 'en-GB';
  const miles = distance === 'Miles';
  const fmt = (v: number | null, digits = 0) =>
    v == null ? null : v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return {
    locale, language,
    temp: (c: number | null) => fmt(c == null ? null : temperature === 'F' ? c * 9 / 5 + 32 : c),
    tempUnit: temperature === 'F' ? '°F' : '°C',
    speed: (kmh: number | null) => fmt(kmh == null ? null : miles ? kmh / 1.609344 : kmh),
    speedUnit: miles ? 'mph' : 'km/h',
    dist: (km: number | null) => fmt(km == null ? null : miles ? km / 1.609344 : km),
    distUnit: miles ? 'mi' : 'km',
    num: fmt,
    time: (ts: number | null) => ts == null ? null : new Date(ts).toLocaleTimeString(locale,
      { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: timeFormat === '12h' }),
  };
};

const statusOf = (s: ObdState | null) =>
  !s || s.state === 'idle' ? { tone: '', label: 'Not connected' }
  : s.state === 'connected' ? { tone: 'is-on', label: 'Connected' }
  : s.state === 'error' ? { tone: 'is-error', label: 'Connection error' }
  : { tone: 'is-busy', label: 'Connecting…' };

const ObdApp: React.FC = () => {
  const t = useT();
  const { closePanelApp, openSettingsTab, screenMode, vehicleLightsOn } = useUIStore();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const u = useUnits();
  const { available, state: s, demoFeed } = useObd();
  const [tab, setTab] = useState<Tab>('live');
  const [devices, setDevices] = useState<ObdDevice[]>([]);
  const [settings, setSettings] = useState<ObdSettings | null>(null);
  const [btInfo, setBtInfo] = useState<ObdBluetoothInfo | null>(null);
  const [reading, setReading] = useState(false);

  const connected = s?.state === 'connected';
  const busy = s?.state === 'connecting' || s?.state === 'initializing';

  // Apparatenlijst en instellingen: bij openen en elke 5 s zolang er geen verbinding is (net gekoppeld in Instellingen)
  useEffect(() => {
    if (connected) return;
    const load = () => { setDevices(obdListDevices()); setSettings(obdGetSettings()); };
    load();
    refreshObd();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [connected]);

  // Bluetooth-info alleen op het Info-tabblad
  useEffect(() => {
    if (!connected || tab !== 'info') return;
    const load = () => setBtInfo(obdBluetoothInfo());
    load();
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [connected, tab]);

  // Foutcodes lezen: klaar zodra er een nieuwe uitslag is (of na 20 s)
  const readAt = s?.dtc?.readAt ?? null;
  useEffect(() => { setReading(false); }, [readAt]);
  useEffect(() => {
    if (!reading) return;
    const timer = window.setTimeout(() => setReading(false), 20000);
    return () => window.clearTimeout(timer);
  }, [reading]);

  // Waarschijnlijke OBD-dongles eerst, Demo als laatste
  const sorted = useMemo(() => {
    const real = devices.filter((d) => d.address !== 'demo');
    return [...real.filter((d) => d.likelyObd), ...real.filter((d) => !d.likelyObd), ...devices.filter((d) => d.address === 'demo')];
  }, [devices]);
  const target = sorted.find((d) => d.address === settings?.lastAddress) ?? sorted.find((d) => d.likelyObd) ?? null;

  const connect = (address: string) => { setTab('live'); obdConnect(address); };
  const toggleAuto = (on: boolean) => {
    obdSetAutoConnect(on);
    setSettings((old) => ({ lastAddress: null, lastName: null, ...old, autoConnect: on }));
  };

  const status = statusOf(s);
  const v = s?.values;

  // --- Kopregel met status en knop ---
  const statusBar = (
    <div className="obd-status">
      <span className={`obd-pill ${status.tone}`}><i className="obd-dot" />{t(status.label)}</span>
      <div className="obd-status-text">
        {s?.device || busy || connected ? (
          <>
            <span className="tsl-field-text">{s?.device?.address === 'demo' ? t('Demo') : s?.device?.name || '—'}</span>
            <small className="tsl-hint">
              {s?.state === 'initializing' ? t('Initializing adapter…') : s?.protocol || (busy ? t('One moment…') : '')}
              {s?.demo ? ` · ${t('Simulated values')}` : ''}
            </small>
          </>
        ) : (
          <small className="tsl-hint">{available ? (target ? target.name : t('No adapter chosen')) : t('Only on the radio')}</small>
        )}
        {s?.state === 'error' && s.error && <small className="tsl-hint" style={{ color: 'var(--tsl-red)' }}>{s.error}</small>}
      </div>
      {connected || busy ? (
        <button className="tsl-btn is-small" onClick={obdDisconnect}>{t(busy ? 'Cancel' : 'Disconnect')}</button>
      ) : (
        <button className="tsl-btn is-primary is-small" disabled={!available || !target} onClick={() => target && connect(target.address)}>
          {t('Connect')}
        </button>
      )}
    </div>
  );

  // --- Niet verbonden: apparaten en uitleg ---
  const setup = (
    <div className="obd-cols">
      <div className="obd-col">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="tsl-field-text" style={{ flex: 1 }}>{t('Paired devices')}</span>
          <button className="theater-close" aria-label={t('Refresh')} disabled={!available}
            onClick={() => { setDevices(obdListDevices()); setSettings(obdGetSettings()); }}><RefreshCw size={18} /></button>
        </div>
        {!available && <small className="tsl-hint">{t('OBD2 works on the radio with the PandaOS launcher. On this device there is no adapter to connect to.')}</small>}
        {available && sorted.filter((d) => d.address !== 'demo').length === 0 && (
          <small className="tsl-hint">{t('No paired devices found. Pair the adapter in Settings > Bluetooth first.')}</small>
        )}
        {sorted.map((d) => {
          const demo = d.address === 'demo';
          return (
            <button key={d.address} className={`obd-device ${d.address === settings?.lastAddress ? 'is-last' : ''}`}
              disabled={busy} onClick={() => connect(d.address)}>
              <span className="obd-device-icon">{demo ? <Gauge size={20} /> : <Bluetooth size={20} />}</span>
              <span className="obd-device-text">
                <span className="tsl-field-text">{demo ? t('Demo') : d.name || d.address}</span>
                <small className="tsl-hint">{demo ? t('Simulated values, not your car') : d.address}</small>
              </span>
              {d.likelyObd && <span className="obd-badge">OBD</span>}
              {demo && <span className="obd-badge is-muted">DEMO</span>}
            </button>
          );
        })}
        <label className="tsl-switch-row">
          <span className="tsl-field-text" style={{ flex: 1 }}>{t('Automatically connect')}</span>
          <input type="checkbox" className="tsl-toggle" disabled={!available} checked={!!settings?.autoConnect}
            onChange={(e) => toggleAuto(e.target.checked)} />
        </label>
        <small className="tsl-hint">{t('Connects to the last adapter when PandaOS starts.')}</small>
      </div>
      <div className="obd-col">
        <span className="tsl-field-text">{t('How to connect')}</span>
        <ol className="obd-steps">
          <li>{t('Plug the ELM327 adapter into the OBD port. In a Golf 6 it is under the steering wheel, left of the steering column.')}</li>
          <li>{t('Switch the ignition on and pair the adapter in Settings > Bluetooth (PIN is usually 1234 or 0000).')}</li>
          <li>{t('Choose the adapter here. PandaOS remembers it for next time.')}</li>
        </ol>
        <button className="tsl-btn is-small" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => openSettingsTab('Bluetooth')}><Settings size={16} />{t('Settings > Bluetooth')}</button>
      </div>
    </div>
  );

  // --- Live ---
  const coolantHot = v?.coolant != null && v.coolant > 105;
  const voltageBad = v?.voltage != null && (v.voltage < 12.0 || v.voltage > 15.0);
  const cards: { label: string; value: string | null; unit: string; warn?: boolean }[] = v ? [
    { label: 'Speed', value: u.speed(v.speed), unit: u.speedUnit },
    { label: 'Coolant', value: u.temp(v.coolant), unit: u.tempUnit, warn: coolantHot },
    { label: 'Battery', value: u.num(v.voltage, 1), unit: 'V', warn: voltageBad },
    { label: 'Engine load', value: u.num(v.load), unit: '%' },
    { label: 'Throttle', value: u.num(v.throttle), unit: '%' },
    { label: 'Intake air', value: u.temp(v.intakeTemp), unit: u.tempUnit },
    { label: 'Fuel tank', value: u.num(v.fuel), unit: '%' },
    { label: 'Outside', value: u.temp(v.ambient), unit: u.tempUnit },
    { label: 'Consumption', value: u.num(v.fuelRate, 1), unit: 'L/h' },
  ] : [];
  const live = (
    <div className="obd-live">
      <div className="obd-gauge"><RpmGauge rpm={v?.rpm ?? null} label={t('Engine speed')} locale={u.locale} /></div>
      <div className="obd-grid">
        {cards.map((c) => (
          <div key={c.label} className={`obd-card ${c.warn ? 'is-warn' : ''}`}>
            <span className="obd-card-label">{t(c.label)}</span>
            <span className="obd-card-value">{c.value ?? '—'}{c.value != null && <small>{c.unit}</small>}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // --- Foutcodes ---
  const describe = (code: string) => {
    const text = DTC_TEXT[code.toUpperCase()];
    if (text) return text[u.language === 'nl' ? 1 : 0];
    return t(/^P[13]/i.test(code) ? 'Manufacturer-specific code' : 'Unknown code');
  };
  const codeList = (title: string, codes: string[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="tsl-field-text">{t(title)} ({codes.length})</span>
      {codes.length === 0 ? <small className="tsl-hint">{t('No fault codes')}</small> : codes.map((code) => (
        <div key={code} className="obd-code">
          <span className="obd-code-id">{code}</span>
          <span className="tsl-hint" style={{ flex: 1 }}>{describe(code)}</span>
        </div>
      ))}
    </div>
  );
  const dtc = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button className="tsl-btn is-primary" disabled={reading} onClick={() => { setReading(true); obdReadDtc(); }}>
          {reading ? t('Reading…') : t('Read fault codes')}
        </button>
        <small className="tsl-hint">
          {s?.dtc?.readAt ? `${t('Read at')} ${u.time(s.dtc.readAt)}` : t('Not read yet')}
        </small>
      </div>
      {s?.dtc && codeList('Stored', s.dtc.stored)}
      {s?.dtc && codeList('Pending', s.dtc.pending)}
      <small className="tsl-hint">{t('Clearing fault codes is deliberately not possible in PandaOS. Use a garage tool for that, so the garage can still see what happened.')}</small>
    </>
  );

  // --- Info ---
  const profiles = Object.entries(btInfo?.connectedProfiles ?? {}).map(([name, value]) => {
    const list = Array.isArray(value) ? value.map((x: any) => (typeof x === 'string' ? x : x?.name ?? x?.address ?? '')).filter(Boolean) : null;
    if (list) return list.length ? `${name}: ${list.join(', ')}` : null;
    if (value === true) return name;
    if (typeof value === 'string' || typeof value === 'number') return value ? `${name}: ${value}` : null;
    return null;
  }).filter(Boolean) as string[];
  const bondedRaw = btInfo?.bonded;
  const bonded = Array.isArray(bondedRaw) ? bondedRaw.length : typeof bondedRaw === 'number' ? bondedRaw : null;
  const row = (label: string, value: React.ReactNode) => (
    <div key={label} className="obd-row"><span className="tsl-field-text">{t(label)}</span><span className="tsl-hint">{value}</span></div>
  );
  const info = (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {row('Adapter', s?.device ? `${s.device.address === 'demo' ? t('Demo') : s.device.name} · ${s.device.address}` : '—')}
        {row('Protocol', s?.protocol || '—')}
        {row('Supported PIDs', s?.supported.length ?? 0)}
        {row('Last update', u.time(s?.updatedAt ?? null) ?? '—')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="tsl-field-text">{t('Bluetooth')}</span>
        {btInfo ? (
          <>
            {row('Bluetooth', t(btInfo.adapterEnabled ? 'On' : 'Off'))}
            {bonded != null && row('Paired devices', bonded)}
            {row('Connected profiles', profiles.length ? profiles.join(' · ') : t('None'))}
            {row('Phone and OBD2 at the same time', t(btInfo.obdConnected && profiles.length ? 'Yes' : 'No'))}
          </>
        ) : <small className="tsl-hint">{t('Only on the radio')}</small>}
      </div>
      <label className="tsl-switch-row">
        <span className="tsl-field-text" style={{ flex: 1 }}>{t('Automatically connect')}</span>
        <input type="checkbox" className="tsl-toggle" checked={!!settings?.autoConnect} onChange={(e) => toggleAuto(e.target.checked)} />
      </label>
      <label className="tsl-switch-row">
        <span className="tsl-field-text" style={{ flex: 1 }}>{t('Use demo values in the car')}</span>
        <input type="checkbox" className="tsl-toggle" checked={demoFeed} onChange={(e) => setObdDemoFeed(e.target.checked)} />
      </label>
      <small className="tsl-hint">{t('Off: demo values only appear in this app, not in the outside temperature or fuel level of the car.')}</small>
    </>
  );

  return (
    <div className={`theater-app tsl-ui obd-app ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
      <style>{CSS}</style>
      <div className="theater-head">
        <div className="theater-title" style={{ gap: 18 }}>
          <Gauge size={24} /><span>OBD2</span>
          {connected && (
            <div className="tsl-segmented" style={{ marginLeft: 8 }}>
              <button className={tab === 'live' ? 'is-active' : ''} onClick={() => setTab('live')}>{t('Live')}</button>
              <button className={tab === 'dtc' ? 'is-active' : ''} onClick={() => setTab('dtc')}>{t('Fault codes')}</button>
              <button className={tab === 'info' ? 'is-active' : ''} onClick={() => setTab('info')}>{t('Info')}</button>
            </div>
          )}
        </div>
        <button className="theater-close" onClick={closePanelApp} aria-label={t('Close')}><X size={22} /></button>
      </div>
      {statusBar}
      <div className="obd-body">
        {!connected ? setup : tab === 'live' ? live : tab === 'dtc' ? dtc : info}
      </div>
    </div>
  );
};

// Instellingen > Onderhoud: live waarden als OBD2 verbonden is, anders de uitleg; knop naar de OBD2-app
export const ObdMaintenanceSummary: React.FC = () => {
  const t = useT();
  const u = useUnits();
  const { state: s } = useObd();
  const open = () => useUIStore.getState().openPanelApp('obd');
  const button = <button className="tsl-btn is-small" style={{ alignSelf: 'flex-start' }} onClick={open}>{t('Open OBD2')}</button>;
  if (s?.state !== 'connected') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <small className="tsl-hint">{t('OBD2 adapter not connected. The values below appear once the adapter is plugged in.')}</small>
        {button}
      </div>
    );
  }
  const v = s.values;
  const codes = s.dtc ? s.dtc.stored.length + s.dtc.pending.length : null;
  const rows: [string, string, boolean?][] = [
    ['Coolant temperature', v.coolant != null ? `${u.temp(v.coolant)} ${u.tempUnit}` : '—', v.coolant != null && v.coolant > 105],
    ['Battery voltage', v.voltage != null ? `${u.num(v.voltage, 1)} V` : '—', v.voltage != null && (v.voltage < 12 || v.voltage > 15)],
    ['Distance since codes cleared', v.distanceSinceClear != null ? `${u.dist(v.distanceSinceClear)} ${u.distUnit}` : '—'],
    ['Fault codes (check engine)', codes == null ? t('Not read yet') : String(codes)],
  ];
  return (
    <div className="tsl-section">
      <span className="tsl-title">OBD2 · {s.demo ? t('Demo') : s.device?.name || t('Connected')}</span>
      <div className="tsl-list">
        {rows.map(([label, value, warn]) => (
          <div key={label} className="tsl-list-row">
            <span className="tsl-field-text" style={{ flex: 1 }}>{t(label)}</span>
            <span className="tsl-hint" style={warn ? { color: 'var(--tsl-red)' } : undefined}>{value}</span>
          </div>
        ))}
      </div>
      {button}
    </div>
  );
};

export default ObdApp;
