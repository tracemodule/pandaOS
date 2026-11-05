import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Smartphone, Music2, Radio, Bluetooth, Usb, Cable, ExternalLink } from 'lucide-react';
import { getAudioFxState, getAudioSources, openRadioSoundSettings, type AudioSource } from '../../services/audioFx';
import { useUIStore, type AudioSettingsState } from '../../store/uiStore';
import { getEffectiveTheme } from '../../settings';
import TeslaSlider from './TeslaSlider';
import { useT } from '../../i18n';
import './_audio-settings.scss';

// Audio Settings zoals in de Tesla-auto: geopend vanuit Music (schuifregelaarknop), niet vanuit Settings.
// Tabs: Tone (equalizer), Balance (balans/fade), Options (snelheidsvolume), Sources (muziekbron).
// Op de Pi past PipeWire dit toe. Op de radio: de equalizer via Android (services/audioFx.ts, AudioFx.kt);
// balans/fader kan Android 9 niet, daarvoor opent PandaOS de geluidsapp van de radio. Bronnen = apps van de radio.
// De Audio-app (app-menu) opent dit scherm op Bronnen (gebeurtenis 'pandaos-audio-tab').

type AudioTab = 'Tone' | 'Balance' | 'Options' | 'Sources';
const TABS: AudioTab[] = ['Tone', 'Balance', 'Options', 'Sources'];

// Zes banden zoals in de Tesla; de drie middelste delen samen het label MID
const EQ_BANDS: { key: 'sub' | 'bass' | 'lowMid' | 'mid' | 'highMid' | 'treble'; label: string }[] = [
  { key: 'sub', label: 'SUB' },
  { key: 'bass', label: 'BASS' },
  { key: 'lowMid', label: '' },
  { key: 'mid', label: 'MID' },
  { key: 'highMid', label: '' },
  { key: 'treble', label: 'TREBLE' },
];
const IMMERSIVE_LABELS = ['Off', 'Standard', 'High'];
const EQ_MIN = -6;
const EQ_MAX = 6;

// Staande schuif: dunne lijn met een stip, middenstreepje op 0 dB. Slepen of tikken zet de waarde.
const VerticalSlider: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fromPointer = (clientY: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const ratio = 1 - Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return Math.round((EQ_MIN + ratio * (EQ_MAX - EQ_MIN)) * 2) / 2; // stappen van 0,5 dB
  };

  const ratio = (value - EQ_MIN) / (EQ_MAX - EQ_MIN);
  return (
    <div
      ref={trackRef}
      className="eq-track"
      onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); onChange(fromPointer(e.clientY)); }}
      onPointerMove={(e) => { if (dragging.current) onChange(fromPointer(e.clientY)); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
    >
      <span className="eq-line" />
      <span className="eq-zero" />
      <span className="eq-thumb" style={{ bottom: `${ratio * 100}%` }} />
    </div>
  );
};

// Balans/fade als vlak: links-rechts = balans, boven-onder = voor-achter
const BalancePad: React.FC<{ balance: number; fade: number; onChange: (balance: number, fade: number) => void }> = ({ balance, fade, onChange }) => {
  const padRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fromPointer = (e: React.PointerEvent) => {
    const rect = padRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    onChange(Math.round(x * 20 - 10), Math.round((1 - y) * 20 - 10));
  };

  return (
    <div
      ref={padRef}
      className="balance-pad"
      onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); }}
      onPointerMove={(e) => { if (dragging.current) fromPointer(e); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
    >
      <span className="pad-axis is-x" />
      <span className="pad-axis is-y" />
      <span className="pad-label is-front">Front</span>
      <span className="pad-label is-rear">Rear</span>
      <span className="pad-label is-left">L</span>
      <span className="pad-label is-right">R</span>
      <span className="pad-dot" style={{ left: `${(balance + 10) * 5}%`, top: `${(10 - fade) * 5}%` }} />
    </div>
  );
};

const formatDb = (v: number) => v.toFixed(1);

const AudioSettings: React.FC = () => {
  const {
    isAudioSettingsOpen, toggleAudioSettings, screenMode, vehicleLightsOn,
    audioSettings, updateAudioSetting, mediaSource, setMediaSource, btConnectedAddress
  } = useUIStore();
  const [tab, setTab] = useState<AudioTab>('Tone');
  const t = useT();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const onRadio = !!(window as any).PandaAndroid;
  // Wat de radio kan (equalizer, geluidsapp) en welke bron-apps erop staan; opnieuw bij elk openen
  const fx = useMemo(() => (isAudioSettingsOpen ? getAudioFxState() : null), [isAudioSettingsOpen]);
  const radioSources = useMemo<AudioSource[]>(() => (isAudioSettingsOpen ? getAudioSources() : []), [isAudioSettingsOpen]);
  useEffect(() => {
    const onTab = (e: Event) => setTab(((e as CustomEvent).detail as AudioTab) ?? 'Tone');
    window.addEventListener('pandaos-audio-tab', onTab);
    return () => window.removeEventListener('pandaos-audio-tab', onTab);
  }, []);

  if (!isAudioSettingsOpen) return null;
  const radioSoundButton = fx?.radioSoundApp && (
    <button className="tsl-btn is-small" style={{ alignSelf: 'flex-start' }} onClick={() => openRadioSoundSettings()}>
      <ExternalLink size={16} /> {t('Radio sound settings')}
    </button>
  );
  const SOURCE_ICONS: Record<AudioSource['kind'], React.ReactNode> = {
    radio: <Radio size={22} />, bluetooth: <Bluetooth size={22} />, usb: <Usb size={22} />, avin: <Cable size={22} />, spotify: <Music2 size={22} />,
  };
  const SOURCE_LABELS: Record<AudioSource['kind'], string> = {
    radio: 'FM / DAB radio', bluetooth: 'Bluetooth music', usb: 'USB', avin: 'AV-in', spotify: 'Spotify',
  };

  return (
    <div className="audio-settings-backdrop" onClick={toggleAudioSettings}>
      <div className={`audio-settings tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
        <header className="audio-settings-header">
          <button className="audio-close" onClick={toggleAudioSettings} aria-label="Sluiten"><X size={24} /></button>
          <span className="tsl-title">{t('Audio Settings')}</span>
          <span style={{ width: 24 }} />
        </header>

        <div className="audio-settings-body">
          <aside className="audio-tabs">
            {TABS.map((name) => (
              <button key={name} className={tab === name ? 'is-active' : ''} onClick={() => setTab(name)}>{t(name)}</button>
            ))}
          </aside>

          <main className="audio-panel">
            {/* --- TONE: equalizer met staande schuiven --- */}
            {tab === 'Tone' && (
              <div className="tone-panel">
                <div className="eq-grid">
                  {EQ_BANDS.map(({ key, label }) => (
                    <div key={key} className="eq-band">
                      <span className="eq-value">{formatDb(audioSettings[key])}</span>
                      <VerticalSlider value={audioSettings[key]} onChange={(v) => updateAudioSetting(key, v)} />
                      <span className="eq-label">{label || ' '}</span>
                    </div>
                  ))}
                  <span className="eq-unit">dB</span>
                </div>

                {/* Immersive Sound: Off / Standard / High, of Auto */}
                <div className="immersive-row">
                  <div className="immersive-slider">
                    <span className="tsl-hint">{t('Immersive Sound')}</span>
                    <TeslaSlider value={audioSettings.immersive} min={0} max={2} step={1}
                      disabled={audioSettings.immersiveAuto}
                      format={(v) => t(IMMERSIVE_LABELS[v])}
                      onChange={(v) => updateAudioSetting('immersive', v as AudioSettingsState['immersive'])} />
                    <div className="immersive-scale">
                      {IMMERSIVE_LABELS.map((l) => <span key={l}>{t(l)}</span>)}
                    </div>
                  </div>
                  <button className={`tsl-btn is-small ${audioSettings.immersiveAuto ? 'is-primary' : ''}`}
                    onClick={() => updateAudioSetting('immersiveAuto', !audioSettings.immersiveAuto)}>{t('Auto')}</button>
                </div>

                <button className="tsl-link" style={{ alignSelf: 'flex-start' }}
                  onClick={() => EQ_BANDS.forEach(({ key }) => updateAudioSetting(key, 0))}>{t('Reset')}</button>
                {onRadio && fx && !fx.eq && (
                  <small className="tsl-hint">{t('This radio does not allow a system equalizer. Use the sound settings of the radio.')}</small>
                )}
                {onRadio && radioSoundButton}
              </div>
            )}

            {/* --- BALANCE: balans en fade in één vlak --- */}
            {tab === 'Balance' && (
              <div className="balance-panel">
                <BalancePad balance={audioSettings.balance} fade={audioSettings.fade}
                  onChange={(b, f) => { updateAudioSetting('balance', b); updateAudioSetting('fade', f); }} />
                <div className="balance-info">
                  <span className="tsl-hint">{t('Balance')}: {audioSettings.balance === 0 ? t('Center') : audioSettings.balance < 0 ? `L ${-audioSettings.balance}` : `R ${audioSettings.balance}`}</span>
                  <span className="tsl-hint">Fade: {audioSettings.fade === 0 ? t('Center') : audioSettings.fade < 0 ? `${t('Rear')} ${-audioSettings.fade}` : `${t('Front')} ${audioSettings.fade}`}</span>
                  <button className="tsl-btn is-small" onClick={() => { updateAudioSetting('balance', 0); updateAudioSetting('fade', 0); }}>{t('Center')}</button>
                  {onRadio && <small className="tsl-hint">{t('Android cannot set balance and fader itself. Set them in the sound settings of the radio.')}</small>}
                  {onRadio && radioSoundButton}
                </div>
              </div>
            )}

            {/* --- OPTIONS: volume dat meestijgt met de snelheid --- */}
            {tab === 'Options' && (
              <div className="tsl-section">
                <span className="tsl-title">{t('Speed-Dependent Volume')}</span>
                <div className="tsl-segmented">
                  {(['Off', 'Low', 'Medium', 'High'] as AudioSettingsState['speedVolume'][]).map((opt) => (
                    <button key={opt} className={audioSettings.speedVolume === opt ? 'is-active' : ''}
                      onClick={() => updateAudioSetting('speedVolume', opt)}>{t(opt)}</button>
                  ))}
                </div>
                <small className="tsl-hint">{t('Raises the volume as you drive faster.')}</small>
              </div>
            )}

            {/* --- SOURCES: waar de muziek vandaan komt --- */}
            {tab === 'Sources' && (
              <div className="tsl-list">
                {/* Bronnen van de radio: tik = de app van die bron openen */}
                {radioSources.map((source) => (
                  <div key={source.package} className="tsl-list-row">
                    {SOURCE_ICONS[source.kind]}
                    <div className="tsl-list-text">
                      <span className="tsl-field-text">{t(SOURCE_LABELS[source.kind])}</span>
                      <small className="tsl-hint">{source.name}</small>
                    </div>
                    <button className="tsl-btn is-small" onClick={() => { (window as any).PandaAndroid?.launchApp?.(source.package); toggleAudioSettings(); }}>{t('Open')}</button>
                  </div>
                ))}
                {onRadio && radioSources.length === 0 && <small className="tsl-hint">{t('No radio source apps found.')}</small>}
                {[
                  { id: 'local' as const, icon: <Smartphone size={22} />, name: 'Bluetooth', hint: btConnectedAddress ? 'Phone connected' : 'No phone connected' },
                  { id: 'spotify' as const, icon: <Music2 size={22} />, name: 'Spotify', hint: 'Spotify Web' },
                ].map((source) => (
                  <div key={source.id} className={`tsl-list-row ${mediaSource === source.id ? 'is-active' : ''}`}>
                    {source.icon}
                    <div className="tsl-list-text">
                      <span className="tsl-field-text">{source.name}</span>
                      <small className="tsl-hint">{t(source.hint)}</small>
                    </div>
                    <button className={`tsl-btn is-small ${mediaSource === source.id ? 'is-primary' : ''}`}
                      onClick={() => setMediaSource(source.id)}>{mediaSource === source.id ? t('Active') : t('Select')}</button>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

// DIT IS DE REGEL DIE JE MISTE (Verhelpt Error 1192)
export default AudioSettings;
