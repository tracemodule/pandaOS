// Ritten (Instellingen > Ritten): opgenomen ritten per dag (services/driveLog.ts). Filter op dag/periode, per rit een
// kaartje met tijd, afstand en rijtijd; tik = pop-up met de route op de kaart en alle cijfers (gemiddelde en
// topsnelheid, hard optrekken en hard remmen). Onderaan de tellers A en B.
import React, { useMemo, useState } from 'react';
import { X, Gauge, Clock, Route, Zap, OctagonAlert, Trash2 } from 'lucide-react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useUIStore, type DriveRecord } from '../../store/uiStore';
import { getEffectiveTheme } from '../../settings';
import { useT } from '../../i18n';

const PDOK_TILES = 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png';
type Filter = 'today' | 'yesterday' | 'week' | 'month' | 'all';

const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const DAY = 86_400_000;

const inFilter = (drive: DriveRecord, filter: Filter) => {
  const today = startOfDay(Date.now());
  switch (filter) {
    case 'today': return drive.start >= today;
    case 'yesterday': return drive.start >= today - DAY && drive.start < today;
    case 'week': return drive.start >= today - 6 * DAY;
    case 'month': return drive.start >= today - 29 * DAY;
    default: return true;
  }
};

// Kaart past zich aan op de route
const FitRoute: React.FC<{ points: [number, number][] }> = ({ points }) => {
  const map = useMap();
  React.useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [24, 24] });
    else if (points.length === 1) map.setView(points[0], 15);
  }, [map, points]);
  return null;
};

const TripsPanel: React.FC = () => {
  const t = useT();
  const { drives, removeDrive, displaySettings, screenMode, vehicleLightsOn, navigationSettings } = useUIStore();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const [filter, setFilter] = useState<Filter>('week');
  const [open, setOpen] = useState<DriveRecord | null>(null);
  const useMiles = displaySettings?.distance === 'Miles';
  const locale = displaySettings.language === 'nl' ? 'nl-NL' : 'en-GB';
  const dist = (m: number) => useMiles ? `${(m / 1609.344).toFixed(1)} mi` : `${(m / 1000).toFixed(1)} km`;
  const speed = (kmh: number) => useMiles ? `${Math.round(kmh / 1.609344)} mph` : `${Math.round(kmh)} km/h`;
  const duration = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)} u ${Math.round((s % 3600) / 60)} min` : `${Math.max(1, Math.round(s / 60))} min`;
  const clock = (ms: number) => new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const avg = (d: DriveRecord) => (d.driveTime > 0 ? (d.distance / 1000) / (d.driveTime / 3600) : 0);

  const visible = useMemo(() => drives.filter((d) => inFilter(d, filter)), [drives, filter]);
  const byDay = useMemo(() => {
    const map = new Map<number, DriveRecord[]>();
    for (const d of visible) map.set(startOfDay(d.start), [...(map.get(startOfDay(d.start)) ?? []), d]);
    return [...map.entries()];
  }, [visible]);
  const total = visible.reduce((acc, d) => ({ distance: acc.distance + d.distance, time: acc.time + d.driveTime }), { distance: 0, time: 0 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Periode */}
      <div className="tsl-segmented is-wide">
        {([['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['all', 'All']] as const).map(([id, label]) => (
          <button key={id} className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>{t(label)}</button>
        ))}
      </div>

      {/* Totalen van de periode */}
      <div className="trips-summary">
        <div><span className="trips-big">{visible.length}</span><small className="tsl-hint">{t('Drives')}</small></div>
        <div><span className="trips-big">{dist(total.distance)}</span><small className="tsl-hint">{t('Distance')}</small></div>
        <div><span className="trips-big">{duration(total.time)}</span><small className="tsl-hint">{t('Drive Time')}</small></div>
      </div>

      {navigationSettings.recordDrives === false && (
        <small className="tsl-hint">{t('Recording drives is off (Settings > Navigation).')}</small>
      )}
      {visible.length === 0 && (
        <small className="tsl-hint">{t('No drives in this period. A drive is saved after you have stood still for 2 minutes.')}</small>
      )}

      {/* Ritten per dag */}
      {byDay.map(([day, list]) => (
        <div key={day} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="tsl-title" style={{ textTransform: 'capitalize' }}>
            {new Date(day).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          </label>
          {list.map((d) => (
            <button key={d.id} className="trip-card" onClick={() => setOpen(d)}>
              <div className="trip-card-time">{clock(d.start)} – {clock(d.end)}</div>
              <div className="trip-card-stats">
                <span><Route size={14} /> {dist(d.distance)}</span>
                <span><Clock size={14} /> {duration(d.driveTime)}</span>
                <span><Gauge size={14} /> {speed(d.maxSpeed)}</span>
              </div>
              {d.events.length > 0 && (
                <div className="trip-card-events">
                  {d.events.some((e) => e.type === 'accel') && <span className="is-accel"><Zap size={13} /> {d.events.filter((e) => e.type === 'accel').length}</span>}
                  {d.events.some((e) => e.type === 'brake') && <span className="is-brake"><OctagonAlert size={13} /> {d.events.filter((e) => e.type === 'brake').length}</span>}
                </div>
              )}
            </button>
          ))}
        </div>
      ))}

      {/* Pop-up: route en cijfers van één rit */}
      {open && (
        <div className="tsl-modal-backdrop" onClick={() => setOpen(null)}>
          <div className={`tsl-modal tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} style={{ width: 760, maxWidth: '94vw', gap: 14 }}
            onClick={(e) => e.stopPropagation()}>
            <button className="tsl-modal-close" aria-label={t('Close')} onClick={() => setOpen(null)}><X size={20} /></button>
            <span className="tsl-modal-title">
              {new Date(open.start).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })} · {clock(open.start)} – {clock(open.end)}
            </span>
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ flex: 1, height: 300, borderRadius: 10, overflow: 'hidden' }}>
                <MapContainer center={open.points[0] ?? [52.37, 4.9]} zoom={13} zoomControl={false} attributionControl={false}
                  style={{ width: '100%', height: '100%' }}>
                  <TileLayer url={PDOK_TILES} maxZoom={19} />
                  <Polyline positions={open.points} color="#3e6ae1" weight={6} opacity={0.9} />
                  {open.points[0] && <CircleMarker center={open.points[0]} radius={7} pathOptions={{ color: '#ffffff', fillColor: '#3ba55d', fillOpacity: 1, weight: 2 }} />}
                  {open.points.length > 1 && <CircleMarker center={open.points[open.points.length - 1]} radius={7} pathOptions={{ color: '#ffffff', fillColor: '#171a20', fillOpacity: 1, weight: 2 }} />}
                  {open.events.map((e, i) => (
                    <CircleMarker key={i} center={[e.lat, e.lon]} radius={6}
                      pathOptions={{ color: '#ffffff', fillColor: e.type === 'accel' ? '#f5a623' : '#e04e3b', fillOpacity: 1, weight: 2 }} />
                  ))}
                  <FitRoute points={open.points} />
                </MapContainer>
              </div>
              <div className="trip-stats-grid">
                {[
                  [t('Distance'), dist(open.distance)],
                  [t('Drive Time'), duration(open.driveTime)],
                  [t('Average Speed'), speed(avg(open))],
                  [t('Top Speed'), speed(open.maxSpeed)],
                  [t('Hard acceleration'), String(open.events.filter((e) => e.type === 'accel').length)],
                  [t('Hard braking'), String(open.events.filter((e) => e.type === 'brake').length)],
                ].map(([label, value]) => (
                  <div key={label}><span className="trips-big">{value}</span><small className="tsl-hint">{label}</small></div>
                ))}
              </div>
            </div>
            <small className="tsl-hint">{t('Green = start, black = end, orange = hard acceleration, red = hard braking.')}</small>
            <button className="tsl-btn" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => { removeDrive(open.id); setOpen(null); }}><Trash2 size={16} /> {t('Delete drive')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TripsPanel;
