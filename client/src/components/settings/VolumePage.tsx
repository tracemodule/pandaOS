// Volumepagina (instellingen-icoon in de volumebalk): de volumes die de radio heeft. Alleen wat er is: Bluetooth
// alleen met een verbonden telefoon, en elk ander volume dat de radio meldt (bijv. AUX) komt er vanzelf bij.
// De radio (Jancar AudioService) schrijft ze in zijn logboek; de launcher leest ze daar (CarSignals.kt) en PandaOS
// onthoudt de laatste waarde. Het meestervolume (0-40) zet PandaOS zelf; de andere drie via de volumepagina van de
// radio (knop Aanpassen), want hoe je die rechtstreeks zet weten we (nog) niet.
import React, { useEffect, useState } from 'react';
import { X, Volume1, Volume2 } from 'lucide-react';
import { useUIStore, VOLUME_MAX } from '../../store/uiStore';
import { getEffectiveTheme } from '../../settings';
import TeslaSlider from './TeslaSlider';
import { useT } from '../../i18n';
import './_audio-settings.scss';

const bridge = () => (window as any).PandaAndroid;
const STORAGE_KEY = 'pandaos-radio-volumes';

type RadioVolumes = Record<string, number>;

// Bekende volumes van de radio; andere (bijv. AUX) komen er vanzelf bij zodra de radio ze meldt
const KNOWN: Record<string, { title: string; max: number; unit: string; order: number }> = {
  BLUETOOTH: { title: 'Bluetooth volume', max: 40, unit: '', order: 1 },
  MEDIA_CCD: { title: 'Media volume with camera', max: 100, unit: '%', order: 2 },
  NAVIGATION: { title: 'Navigation volume', max: 100, unit: '', order: 3 },
};

// Onbekende naam leesbaar maken: AUX_IN -> "Aux in-volume"
const titleOf = (key: string) => KNOWN[key]?.title
  ?? `${key.charAt(0)}${key.slice(1).toLowerCase().replace(/_/g, ' ')}`;

// Bluetooth-volume alleen als er een telefoon verbonden is
const bluetoothConnected = (): boolean => {
  try {
    const state = JSON.parse(bridge()?.getBluetoothState?.() ?? 'null');
    if (state?.devices) return state.devices.some((d: { connected?: boolean }) => d.connected);
  } catch { /* geen Bluetooth-status */ }
  return !!useUIStore.getState().btConnectedAddress;
};

// Laatste waarden: eerst wat PandaOS onthouden heeft, dan wat de launcher nu weet
const readVolumes = (): RadioVolumes => {
  let saved: RadioVolumes = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { /* leeg */ }
  let live: RadioVolumes = {};
  try { live = JSON.parse(bridge()?.getRadioVolumes?.() ?? '{}'); } catch { /* geen launcher */ }
  return { ...saved, ...live };
};

const VolumePage: React.FC = () => {
  const { isVolumePageOpen, closeVolumePage, volume, setVolume, screenMode, vehicleLightsOn } = useUIStore();
  const t = useT();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const [volumes, setVolumes] = useState<RadioVolumes>(readVolumes);
  const canAdjust = bridge()?.hasRadioVolumeSettings?.() === true;
  const [btConnected, setBtConnected] = useState(bluetoothConnected);

  // Live bijwerken als de radio een volume verandert (androidBridge -> pandaos-radio-volumes)
  useEffect(() => {
    if (!isVolumePageOpen) return;
    setVolumes(readVolumes());
    setBtConnected(bluetoothConnected());
    const onChange = () => { setVolumes(readVolumes()); setBtConnected(bluetoothConnected()); };
    window.addEventListener('pandaos-radio-volumes', onChange);
    return () => window.removeEventListener('pandaos-radio-volumes', onChange);
  }, [isVolumePageOpen]);

  if (!isVolumePageOpen) return null;

  return (
    <div className="audio-settings-backdrop" onClick={closeVolumePage}>
      <div className={`audio-settings tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
        <header className="audio-settings-header">
          <button className="audio-close" onClick={closeVolumePage} aria-label={t('Close')}><X size={24} /></button>
          <span className="tsl-title">{t('Volume')}</span>
          <span style={{ width: 24 }} />
        </header>

        {/* Elke regel zoals "Hoogte van de dock" (Instellingen > Scherm): titel, schuif met speaker links en rechts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 28px 16px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="tsl-title">{t('Main volume')}</label>
            <div className="tsl-slider-row">
              <TeslaSlider value={volume} min={0} max={VOLUME_MAX} step={1} format={(v) => `${v}`}
                iconLeft={<Volume1 size={18} />} iconRight={<Volume2 size={22} />}
                onChange={(v) => setVolume(v)} />
            </div>
          </div>

          {Object.keys(volumes)
            .filter((key) => key !== 'MASTER' && (key !== 'BLUETOOTH' || btConnected))
            .sort((a, b) => (KNOWN[a]?.order ?? 99) - (KNOWN[b]?.order ?? 99) || a.localeCompare(b))
            .map((key) => {
            const value = volumes[key];
            const row = KNOWN[key] ?? { max: value > 40 ? 100 : 40, unit: '' };
            const title = KNOWN[key] ? t(KNOWN[key].title) : `${titleOf(key)}-${t('volume')}`;
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="tsl-title">{title}</label>
                <div className="tsl-slider-row">
                  {/* Waarde van de radio; zetten gaat (nog) via de volumepagina van de radio zelf */}
                  <TeslaSlider value={value ?? 0} min={0} max={row.max} step={1} disabled
                    format={(v) => (value === undefined ? '–' : `${v}${row.unit}`)}
                    iconLeft={<Volume1 size={18} />} iconRight={<Volume2 size={22} />}
                    onChange={() => undefined} />
                  {canAdjust && (
                    <button className="tsl-btn" onClick={() => { bridge()?.openRadioVolumeSettings?.(); closeVolumePage(); }}>{t('Adjust')}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VolumePage;
