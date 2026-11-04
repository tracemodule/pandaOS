// WebView (Settings > Software): PandaOS draait in de Android System WebView van de radio. Is die te oud, dan blijft
// het scherm zwart (op de Golf-radio stond eerst versie 66). Hier zie je de versie en werk je hem bij.
import React, { useEffect, useState } from 'react';
import { Globe, ExternalLink, Wrench, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useT } from '../../i18n';

type Info = { package: string; version: string; major: number; minimum: number };

const WebViewPanel: React.FC = () => {
  const t = useT();
  const bridge = (window as any).PandaAndroid;
  const [info, setInfo] = useState<Info | null>(null);

  // Opnieuw lezen na terugkomen uit de Play Store of de ontwikkelaarsopties
  useEffect(() => {
    const read = () => { try { setInfo(JSON.parse(bridge?.getWebViewInfo?.() ?? 'null')); } catch { setInfo(null); } };
    read();
    document.addEventListener('visibilitychange', read);
    return () => document.removeEventListener('visibilitychange', read);
  }, [bridge]);

  if (!bridge?.getWebViewInfo) return null; // alleen op de radio
  const ok = !!info && info.major >= info.minimum;
  const recommended = 120; // ruim boven het minimum: sneller en minder fouten

  return (
    <div className="tsl-section">
      <span className="tsl-title">WebView</span>
      <div className="tsl-list">
        <div className={`tsl-list-row ${ok ? 'is-active' : ''}`}>
          {ok ? <CheckCircle2 size={22} /> : info ? <AlertTriangle size={22} /> : <Globe size={22} />}
          <div className="tsl-list-text">
            <span className="tsl-field-text">{t('Android System WebView')} {info?.version || '—'}</span>
            <small className="tsl-hint">
              {!info ? t('Version unknown.')
                : !ok ? `${t('Too old: PandaOS needs version')} ${info.minimum} ${t('or newer.')}`
                : info.major < recommended ? t('Works. A newer version can make PandaOS faster.')
                : t('Up to date enough for PandaOS.')}
              {info?.package ? ` (${info.package})` : ''}
            </small>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className="tsl-btn is-primary" onClick={() => bridge.openWebViewUpdate()}>
          <ExternalLink size={18} /> {t('Update WebView')}
        </button>
        <button className="tsl-btn" onClick={() => bridge.openDeveloperSettings()}>
          <Wrench size={18} /> {t('Choose WebView implementation')}
        </button>
      </div>
      <small className="tsl-hint">
        {t('Without Play Store: install a newer Android System WebView APK, then choose it under Developer options → WebView implementation.')}
      </small>
    </div>
  );
};

export default WebViewPanel;
