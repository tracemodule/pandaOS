// Software-update (Settings > Software): huidige versie, controleren op GitHub, downloaden en installeren.
// Bij het opstarten kijkt PandaOS zelf ook (zie checkForUpdatesAtStartup), met een melding als er iets nieuws is.
import React, { useEffect, useState } from 'react';
import { RotateCw, Download, CheckCircle2, Timer, X, Check } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { currentVersion, fetchLatestRelease, isNewer, canInstallUpdates, installUpdate, type ReleaseInfo } from '../../services/updates';
import { useT } from '../../i18n';

type Status = { state: 'idle' | 'checking' | 'downloading' | 'installing' | 'error'; progress?: number; message?: string };

const SoftwareUpdatePanel: React.FC = () => {
  const t = useT();
  const { appSettings, updateAppSetting } = useUIStore();
  const [release, setRelease] = useState<ReleaseInfo | null | undefined>(undefined); // undefined = nog niet gekeken
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [autoOpen, setAutoOpen] = useState(false); // venster: automatisch controleren aan/uit
  const version = currentVersion();
  const hasUpdate = !!release && isNewer(release.version, version);

  const check = async () => {
    setStatus({ state: 'checking' });
    try {
      setRelease(await fetchLatestRelease());
      setStatus({ state: 'idle' });
    } catch {
      setStatus({ state: 'error', message: t('Could not reach GitHub. Check the internet connection.') });
    }
  };

  // Voortgang van de launcher (window.PandaOS.updateStatus -> event)
  useEffect(() => {
    const onStatus = (e: Event) => {
      const detail = (e as CustomEvent).detail as { state: Status['state']; progress: number; message: string };
      setStatus({ state: detail.state, progress: detail.progress, message: detail.message });
    };
    window.addEventListener('pandaos-update-status', onStatus);
    return () => window.removeEventListener('pandaos-update-status', onStatus);
  }, []);

  // Installatie geweigerd door Android (bijv. andere ondertekening): na terugkomen tonen
  useEffect(() => {
    const onVisible = () => {
      const error = (window as any).PandaAndroid?.getUpdateError?.();
      if (error) setStatus({ state: 'error', message: error });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const autoCheck = appSettings.autoUpdateCheck ?? true;
  const busy = status.state === 'checking' || status.state === 'downloading' || status.state === 'installing';

  return (
    <div className="tsl-section">
      <div className="tsl-title-row">
        <span className="tsl-title">{t('Software Update')}</span>
        {/* Release notes en handleiding (ReleaseNotes.tsx), over de hele Instellingen-pagina */}
        <button className="tsl-link" onClick={() => window.dispatchEvent(new Event('pandaos-release-notes'))}>{t('Release notes')}</button>
      </div>
      <div className="tsl-list">
        <div className={`tsl-list-row ${release !== undefined && !hasUpdate ? 'is-active' : ''}`}>
          {release !== undefined && !hasUpdate ? <CheckCircle2 size={22} /> : <Download size={22} />}
          <div className="tsl-list-text">
            <span className="tsl-field-text">
              {hasUpdate ? `${t('New version available')}: ${release!.version}` : `${t('Version')} ${version}`}
            </span>
            <small className="tsl-hint">
              {release === undefined ? t('Not checked yet.')
                : release === null ? t('No releases published yet.')
                : hasUpdate ? `${t('Installed')}: ${version}`
                : t('PandaOS is up to date.')}
            </small>
          </div>
          <button className="tsl-btn is-small" disabled={busy} onClick={check}>
            <RotateCw size={16} className={status.state === 'checking' ? 'spin-animation' : ''} /> {t('Check')}
          </button>
          {/* Automatisch controleren: knop naast Controleren, keuze in een venster */}
          <button className="tsl-btn is-small" onClick={() => setAutoOpen(true)}>
            <Timer size={16} /> {t('Automatically')}: {t(autoCheck ? 'On' : 'Off')}
          </button>
        </div>
      </div>

      {/* Wat er nieuw is (tekst van de GitHub Release) */}
      {hasUpdate && release!.notes && (
        <small className="tsl-hint" style={{ whiteSpace: 'pre-wrap' }}>{release!.notes}</small>
      )}

      {hasUpdate && (
        canInstallUpdates() && release!.apkUrl ? (
          <button className="tsl-btn is-primary" style={{ alignSelf: 'flex-start' }} disabled={busy}
            onClick={() => { setStatus({ state: 'downloading', progress: 0 }); installUpdate(release!.apkUrl!); }}>
            <Download size={18} /> {t('Download and install')}
          </button>
        ) : (
          <small className="tsl-hint">{t('Updates can be installed on the radio.')}</small>
        )
      )}

      {status.state === 'downloading' && <small className="tsl-hint">{t('Downloading…')} {status.progress ?? 0}%</small>}
      {status.state === 'installing' && <small className="tsl-hint">{t('Installing… PandaOS restarts by itself.')}</small>}
      {status.state === 'error' && <small className="tsl-hint" style={{ color: 'var(--tsl-red)' }}>{status.message}</small>}

      {autoOpen && (
        <div className="tsl-modal-backdrop" onClick={() => setAutoOpen(false)}>
          <div className="tsl-modal" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
            <button className="tsl-modal-close" aria-label={t('Close')} onClick={() => setAutoOpen(false)}><X size={20} /></button>
            <span className="tsl-modal-title">{t('Check automatically')}</span>
            <small className="tsl-hint" style={{ textAlign: 'center' }}>{t('Shows a notification at startup when a new version is available.')}</small>
            <div className="tsl-list">
              {([true, false] as const).map((on) => (
                <div key={String(on)} className={`tsl-list-row ${autoCheck === on ? 'is-active' : ''}`} style={{ cursor: 'pointer' }}
                  onClick={() => { updateAppSetting('autoUpdateCheck', on); setAutoOpen(false); }}>
                  <span className="tsl-field-text" style={{ flex: 1 }}>{t(on ? 'On' : 'Off')}</span>
                  {autoCheck === on && <Check size={20} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SoftwareUpdatePanel;
