// Updatepagina (Instellingen > Software > Bekijken en installeren): wat er nieuw is, downloaden met voortgang, en
// daarna apart "Nu installeren" (alleen stilstaand in P). Vooraf staat uitgelegd wat er gebeurt: PandaOS stopt even,
// Android vraagt mogelijk "Installeren?", en PandaOS start daarna vanzelf opnieuw (UpdateInstaller.kt).
// UpdatedNotice: na die herstart één keer "Bijgewerkt naar X".
import React, { useEffect, useState } from 'react';
import { X, Download, CheckCircle2, RotateCw, Info, PackageCheck } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { currentVersion, type ReleaseInfo } from '../../services/updates';
import { getEffectiveTheme } from '../../settings';
import { useT } from '../../i18n';

const bridge = () => (window as any).PandaAndroid;

type Phase = 'idle' | 'downloading' | 'ready' | 'installing' | 'error';

const UpdatePage: React.FC<{ release: ReleaseInfo; onClose: () => void }> = ({ release, onClose }) => {
  const t = useT();
  const gear = useUIStore((s) => s.gear);
  const speed = useUIStore((s) => s.speed);
  const parked = gear === 'P' && (speed ?? 0) < 3;
  // Al eerder gedownload (en nog niet geïnstalleerd)? Dan meteen klaar om te installeren
  const [phase, setPhase] = useState<Phase>(() => bridge()?.getDownloadedUpdateVersion?.() === release.version ? 'ready' : 'idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const newApi = typeof bridge()?.downloadUpdate === 'function';

  useEffect(() => {
    const onStatus = (e: Event) => {
      const d = (e as CustomEvent).detail as { state: string; progress: number; message: string };
      if (d.state === 'downloading') { setPhase('downloading'); setProgress(d.progress); }
      else if (d.state === 'ready') setPhase('ready');
      else if (d.state === 'installing') setPhase('installing');
      else if (d.state === 'error') { setPhase('error'); setMessage(d.message); }
    };
    window.addEventListener('pandaos-update-status', onStatus);
    // Terug van het Android-venster "Installeren?" zonder te installeren (of geweigerd): fout tonen
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const error = bridge()?.getUpdateError?.();
      if (error) { setPhase('error'); setMessage(error); }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('pandaos-update-status', onStatus); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const download = () => {
    if (!release.apkUrl) return;
    setPhase('downloading'); setProgress(0); setMessage('');
    if (newApi) bridge().downloadUpdate(release.apkUrl);
    else bridge()?.installUpdate?.(release.apkUrl); // oude launcher: downloaden en meteen installeren
  };
  const install = () => {
    if (!parked) return;
    if (bridge()?.installDownloadedUpdate?.()) setPhase('installing');
    else { setPhase('error'); setMessage(t('The download is gone. Download the update again.')); }
  };

  const step = (n: number, label: string, done: boolean, active: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: done || active ? 1 : 0.45 }}>
      <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 'calc(13px * var(--text-scale, 1))',
        background: done ? '#3ba55d' : active ? '#3e6ae1' : 'var(--tsl-gray-200, rgba(128,128,128,0.25))', color: done || active ? '#fff' : 'inherit' }}>
        {done ? <CheckCircle2 size={16} /> : n}
      </span>
      <span className="tsl-field-text">{label}</span>
    </div>
  );
  const downloaded = phase === 'ready' || phase === 'installing';

  return (
    <div className="tsl-modal-backdrop" onClick={phase === 'installing' ? undefined : onClose}>
      <div className="tsl-modal" style={{ width: 720, maxHeight: '92%', overflowY: 'auto', gap: 18, alignItems: 'stretch' }} onClick={(e) => e.stopPropagation()}>
        {phase !== 'installing' && <button className="tsl-modal-close" aria-label={t('Close')} onClick={onClose}><X size={20} /></button>}
        {/* Ruimte links voor het sluitkruisje (tsl-modal-close staat linksboven) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingLeft: 36 }}>
          <PackageCheck size={34} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="tsl-modal-title" style={{ textAlign: 'left' }}>PandaOS {release.version}</span>
            <small className="tsl-hint">{t('Installed')}: {currentVersion()}</small>
          </div>
        </div>

        {/* Stappen */}
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          {step(1, t('Download'), downloaded, phase === 'downloading')}
          {step(2, t('Install'), false, phase === 'installing')}
          {step(3, t('PandaOS restarts'), false, false)}
        </div>

        {/* Wat er nieuw is (tekst van de GitHub Release) */}
        {release.notes && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="tsl-title">{t("What's new")}</span>
            <div className="tsl-hint" style={{ whiteSpace: 'pre-wrap', maxHeight: 150, overflowY: 'auto', lineHeight: 1.45 }}>{release.notes}</div>
          </div>
        )}

        {/* Wat er gebeurt bij installeren */}
        <div style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'rgba(62,106,225,0.10)' }}>
          <Info size={20} style={{ flexShrink: 0, marginTop: 2 }} />
          <small className="tsl-hint" style={{ color: 'inherit' }}>
            {t('While installing, PandaOS stops for about 10 seconds and the screen may go black. If Android asks "Install?", tap Install. PandaOS then starts again by itself.')}
          </small>
        </div>

        {phase === 'downloading' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 8, borderRadius: 4, background: 'rgba(128,128,128,0.25)', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#3e6ae1', transition: 'width 0.3s ease' }} />
            </div>
            <small className="tsl-hint">{t('Downloading…')} {progress}%</small>
          </div>
        )}
        {phase === 'installing' && <small className="tsl-hint">{t('Installing… PandaOS restarts by itself.')}</small>}
        {phase === 'error' && <small className="tsl-hint" style={{ color: 'var(--tsl-red)' }}>{message}</small>}
        {phase === 'ready' && !parked && <small className="tsl-hint" style={{ color: 'var(--tsl-red)' }}>{t('Install only while parked: put the car in P.')}</small>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          {(phase === 'idle' || phase === 'error') && !downloaded && (
            <button className="tsl-btn is-primary" disabled={!release.apkUrl || !bridge()} onClick={download}>
              {phase === 'error' ? <RotateCw size={18} /> : <Download size={18} />} {t(phase === 'error' ? 'Try again' : 'Download')}
            </button>
          )}
          {phase === 'ready' && (
            <button className="tsl-btn is-primary" disabled={!parked} onClick={install}>
              <PackageCheck size={18} /> {t('Install now')}
            </button>
          )}
        </div>
        {!bridge() && <small className="tsl-hint">{t('Updates can be installed on the radio.')}</small>}
      </div>
    </div>
  );
};

// Na de herstart door een update: één keer "Bijgewerkt naar X" met een knop naar wat er nieuw is
export const UpdatedNotice: React.FC = () => {
  const t = useT();
  const dark = useUIStore((s) => getEffectiveTheme(s.screenMode, s.vehicleLightsOn) === 'dark');
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    // Even wachten tot het opstartscherm weg is
    const timer = window.setTimeout(() => {
      try { setVersion(JSON.parse(bridge()?.takeUpdateResult?.() ?? '{}').updatedTo ?? null); } catch { /* oude launcher */ }
    }, 4000);
    return () => window.clearTimeout(timer);
  }, []);
  if (!version) return null;
  const close = () => setVersion(null);
  // Eigen tsl-ui-laag: de vensterstijl van PandaOS geldt alleen daarbinnen (dit staat buiten Instellingen)
  return (
    <div className={`tsl-ui ${dark ? 'dark-mode' : ''}`} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'transparent' }}>
    <div className="tsl-modal-backdrop" onClick={close}>
      <div className="tsl-modal" style={{ width: 460, alignItems: 'center', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <CheckCircle2 size={44} color="#3ba55d" />
        <span className="tsl-modal-title">{t('Updated to')} {version}</span>
        <small className="tsl-hint" style={{ textAlign: 'center' }}>{t('PandaOS has been updated and restarted.')}</small>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="tsl-btn" onClick={close}>{t('OK')}</button>
          <button className="tsl-btn is-primary" onClick={() => {
            close();
            useUIStore.getState().openSettingsTab('Software');
            window.setTimeout(() => window.dispatchEvent(new Event('pandaos-release-notes')), 400);
          }}>{t("What's new")}</button>
        </div>
      </div>
    </div>
    </div>
  );
};

export default UpdatePage;
