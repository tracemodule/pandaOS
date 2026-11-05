// Settings > Advanced > Radio-instellingen: wat eerder alleen via de laptop (adb) kon, nu als schakelaars.
// De Android-kant staat in RadioSystem.kt. Schrijven vraagt één keer een toestemming via de laptop
// (WRITE_SECURE_SETTINGS); zonder die toestemming tonen we alleen de huidige stand en het commando.
import React, { useCallback, useEffect, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { useT } from '../../i18n';

type State = {
  canWrite: boolean;
  deviceOwner: boolean;
  systemBarHidden: boolean;
  volumeBarHidden: boolean | null;
  panelLockTable: string | null;
  panelLocked: boolean | null;
  radioCamera: 'on' | 'off' | 'missing';
};
type Result = { ok: boolean; error: string | null };

const bridge = () => (window as any).PandaAndroid;
const GRANT_COMMAND = 'adb shell pm grant nl.pandaos.launcher android.permission.WRITE_SECURE_SETTINGS';

const RadioSystemPanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const t = useT();
  const setOpen = (v: boolean) => { if (!v) onClose(); };
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const read = useCallback(() => {
    try { setState(JSON.parse(bridge()?.getRadioSystemState?.() ?? 'null')); } catch { setState(null); }
  }, []);

  useEffect(() => { if (open) { read(); setMessage(null); } }, [open, read]);

  // Bridge-aanroep met uitkomst; daarna de stand opnieuw lezen
  const run = (call: () => string | undefined) => {
    let result: Result = { ok: false, error: 'missing' };
    try { result = JSON.parse(call() ?? 'null') ?? result; } catch { /* oude launcher */ }
    setMessage(result.ok ? null
      : result.error === 'no-permission' ? t('PandaOS has no permission yet. Run the command below once from the laptop.')
      : result.error === 'not-owner' ? t('Only possible when PandaOS is device owner. Use App info instead.')
      : result.error === 'missing' ? t('This radio does not have this setting.')
      : `${t('Did not work')}: ${result.error}`);
    setTimeout(read, 300);
  };

  if (!bridge()?.getRadioSystemState) return null; // laptop/Pi of oude launcher

  const Switch: React.FC<{ title: string; hint: string; checked: boolean | null; disabled?: boolean; onChange: (v: boolean) => void }> =
    ({ title, hint, checked, disabled, onChange }) => (
      <label className="tsl-switch-row" style={{ opacity: disabled ? 0.5 : 1 }}>
        <div className="tsl-switch-text">
          <span className="tsl-field-text">{title}</span>
          <small className="tsl-hint">{hint}{checked === null ? ` ${t('(current state unknown)')}` : ''}</small>
        </div>
        <input type="checkbox" className="tsl-toggle" checked={!!checked} disabled={disabled}
          onChange={(e) => onChange(e.target.checked)} />
      </label>
    );

  return (
    <>
      {open && (
        <div className="tsl-modal-backdrop" onClick={() => setOpen(false)}>
          <div className="tsl-modal" style={{ width: 640, maxHeight: '90%', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <button className="tsl-modal-close" aria-label={t('Close')} onClick={() => setOpen(false)}><X size={20} /></button>
            <span className="tsl-modal-title">{t('Radio settings')}</span>

            {state && !state.canWrite && (
              <div className="tsl-card">
                <span className="tsl-field-text">{t('One-time permission needed')}</span>
                <small className="tsl-hint">{t('Connect the laptop (adb) and run this command once. After that these switches work.')}</small>
                <code style={{ userSelect: 'all', fontSize: 'calc(13px * var(--text-scale, 1))', wordBreak: 'break-all' }}>{GRANT_COMMAND}</code>
              </div>
            )}

            {state && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <Switch title={t('Hide system bar of the radio')}
                  hint={t('The bar at the top of the radio stays hidden, also in other apps (Waze, CarPlay). Swipe down for the PandaOS menu.')}
                  checked={state.systemBarHidden} disabled={!state.canWrite}
                  onChange={(v) => run(() => bridge().setRadioSystemBarHidden(v))} />
                <Switch title={t('Hide volume bar of the radio')}
                  hint={t('Moves the screen 110 px up so the volume bar of the radio falls outside the screen. In other apps the top strip disappears.')}
                  checked={state.volumeBarHidden} disabled={!state.canWrite}
                  onChange={(v) => run(() => bridge().setRadioVolumeBarHidden(v))} />
                {state.panelLockTable && (
                  <Switch title={t('Lock panel of the radio')}
                    hint={t('Test: the pull-down panel of the radio no longer reacts to touch.')}
                    checked={state.panelLocked} disabled={!state.canWrite}
                    onChange={(v) => run(() => bridge().setRadioPanelLocked(v))} />
                )}

                {state.radioCamera !== 'missing' && (
                  <div className="tsl-switch-row">
                    <div className="tsl-switch-text">
                      <span className="tsl-field-text">{t('Camera app of the radio')} · {t(state.radioCamera === 'on' ? 'On' : 'Off')}</span>
                      <small className="tsl-hint">{t('When on, the radio shows its own camera screen in R and PandaOS cannot use the camera. Switch it off under App info.')}</small>
                    </div>
                    {state.deviceOwner ? (
                      <input type="checkbox" className="tsl-toggle" checked={state.radioCamera === 'on'}
                        onChange={(e) => run(() => bridge().setRadioCameraEnabled(e.target.checked))} />
                    ) : (
                      <button className="tsl-btn is-small" onClick={() => bridge().openAppDetails?.('com.jancar.hd2cam')}>{t('App info')}</button>
                    )}
                  </div>
                )}

                {message && <small className="tsl-hint" style={{ color: 'var(--tsl-red)' }}>{message}</small>}

                <button className="tsl-btn" disabled={!state.canWrite}
                  style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8 }}
                  onClick={() => run(() => bridge().resetRadioSystem())}>
                  <RotateCcw size={16} /> {t('Restore radio defaults')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default RadioSystemPanel;
