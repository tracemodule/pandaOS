// Weer-popup zoals bij Tesla: tik op de temperatuur in de bovenbalk. Plaats, huidige temperatuur, verwachting per uur
// en details (regenkans, luchtvochtigheid, wind, UV, luchtkwaliteit). Gegevens: services/weather.ts (Open-Meteo).
import type { ComponentType } from 'react';
import {
  Sun, Moon, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning,
  Droplets, Wind, Umbrella, Leaf,
} from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { getEffectiveTheme } from '../../settings';
import { useT } from '../../i18n';
import { useWeatherDetails, weatherKind, weatherText, type WeatherKind } from '../../services/weather';
import './_weather-popup.scss';

type IconType = ComponentType<{ size?: number }>;

const ICONS: Record<WeatherKind, IconType> = {
  clear: Sun, partly: CloudSun, cloudy: Cloud, fog: CloudFog,
  drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning,
};

const iconFor = (code: number, isDay: boolean): IconType => {
  const kind = weatherKind(code);
  return kind === 'clear' && !isDay ? Moon : ICONS[kind];
};

const COMPASS = {
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  nl: ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'],
};

// UV-index → omschrijving (WHO-indeling)
const uvLabel = (uv: number) => uv < 3 ? 'Low' : uv < 6 ? 'Moderate' : uv < 8 ? 'High' : uv < 11 ? 'Very high' : 'Extreme';
// Europese AQI → omschrijving (Goed/Redelijk/Matig/Slecht/Zeer slecht)
const aqiLabel = (aqi: number) => aqi <= 20 ? 'Good' : aqi <= 40 ? 'Fair' : aqi <= 60 ? 'Moderate' : aqi <= 80 ? 'Poor' : 'Very poor';

export default function WeatherPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const screenMode = useUIStore((s) => s.screenMode);
  const vehicleLightsOn = useUIStore((s) => s.vehicleLightsOn);
  const displaySettings = useUIStore((s) => s.displaySettings);
  const { details, place, loading, offline } = useWeatherDetails(open);
  if (!open) return null;

  const dark = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const fahrenheit = displaySettings?.temperature === 'F';
  const deg = (c: number) => `${Math.round(fahrenheit ? c * 9 / 5 + 32 : c)}°`;
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour12: displaySettings?.timeFormat === '12h',
    ...(displaySettings?.timeZone ? { timeZone: displaySettings.timeZone } : {}),
  };
  const locale = displaySettings?.language === 'en' ? 'en-US' : 'nl-NL';
  const clock = (ms: number) => new Date(ms).toLocaleTimeString(locale, { ...timeOpts, hour: '2-digit', minute: '2-digit' });
  const hourOnly = (ms: number) => displaySettings?.timeFormat === '12h'
    ? new Date(ms).toLocaleTimeString('en-US', { ...timeOpts, hour: 'numeric' })
    : clock(ms);

  const now = Date.now();
  // Huidig uur ("Nu") plus de 5 uren daarna
  const hours = (details?.hourly ?? []).filter((h) => h.time > now - 3600_000).slice(0, 6);
  const compass = COMPASS[displaySettings?.language === 'en' ? 'en' : 'nl'];
  const stale = !!details && now - details.at > 15 * 60_000;

  const CurrentIcon = details ? iconFor(details.code, details.isDay) : Cloud;

  return (
    <div className={`tsl-ui ${dark ? 'dark-mode' : ''}`}>
      <div className="weather-popup-backdrop" onClick={onClose} />
      <div className="weather-popup tsl-scroll" role="dialog" aria-label={place ?? 'Weather'}>
        {!details ? (
          <div className="weather-popup__empty">{loading ? t('Loading weather…') : t('No internet')}</div>
        ) : (
          <>
            <div className="weather-popup__place">{place ?? ''}</div>
            <div className="weather-popup__now">
              <CurrentIcon size={44} />
              <span className="weather-popup__temp">{deg(details.temp)}</span>
              <div className="weather-popup__cond">
                <span>{t(weatherText(details.code))}</span>
                {details.high !== null && details.low !== null && (
                  <span className="weather-popup__hilo">{t('High')} {deg(details.high)} · {t('Low')} {deg(details.low)}</span>
                )}
              </div>
            </div>

            {hours.length > 0 && (
              <div className="weather-popup__hours">
                {hours.map((h, i) => {
                  const Icon = iconFor(h.code, h.isDay);
                  return (
                    <div key={h.time} className="weather-popup__hour">
                      <span>{i === 0 && h.time <= now ? t('Now') : hourOnly(h.time)}</span>
                      <Icon size={20} />
                      <span>{deg(h.temp)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {details.rainChance !== null && (
              <div className="weather-popup__row">
                <Umbrella size={18} /><span className="weather-popup__label">{t('Chance of rain')}</span>
                <span className="weather-popup__value">{Math.round(details.rainChance)}%</span>
              </div>
            )}
            {details.humidity !== null && (
              <div className="weather-popup__row">
                <Droplets size={18} /><span className="weather-popup__label">{t('Humidity')}</span>
                <span className="weather-popup__value">{Math.round(details.humidity)}%</span>
              </div>
            )}
            {details.windSpeed !== null && (
              <div className="weather-popup__row">
                <Wind size={18} /><span className="weather-popup__label">{t('Wind')}</span>
                <span className="weather-popup__value">
                  {Math.round(details.windSpeed)} km/h
                  {details.windDir !== null ? ` ${compass[Math.round(details.windDir / 45) % 8]}` : ''}
                </span>
              </div>
            )}
            {details.uv !== null && (
              <div className="weather-popup__row">
                <Sun size={18} /><span className="weather-popup__label">{t('UV index')}</span>
                <span className="weather-popup__value">{Math.round(details.uv)} · {t(uvLabel(details.uv))}</span>
              </div>
            )}
            {details.aqi !== null && (
              <div className="weather-popup__row">
                <Leaf size={18} /><span className="weather-popup__label">{t('Air quality')}</span>
                <span className="weather-popup__value">{t(aqiLabel(details.aqi))}</span>
              </div>
            )}

            {(offline || stale) && (
              <div className="weather-popup__status">
                {offline ? `${t('No internet')} · ` : ''}{t('Updated at')} {clock(details.at)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
