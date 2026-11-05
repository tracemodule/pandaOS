// Klank op de radio: de equalizer uit Muziek > Audio-instellingen > Toon naar Android sturen (AudioFx.kt).
// Werkt voor al het geluid van de radio als het apparaat de algemene Android-equalizer toestaat.
// Balans/fader en de bronnen-apps: zie AudioSettings.tsx (geluidsapp van de radio, getAudioSources).
import { useUIStore, type AudioSettingsState } from '../store/uiStore';
import { diag } from './diagnostics';

const EQ_KEYS: (keyof AudioSettingsState)[] = ['sub', 'bass', 'lowMid', 'mid', 'highMid', 'treble'];

export interface AudioFxState { eq: boolean; bands?: number; freqs?: number[]; balance: boolean; radioSoundApp: boolean }
export interface AudioSource { kind: 'radio' | 'bluetooth' | 'usb' | 'avin' | 'spotify'; package: string; name: string }

const android = () => (window as any).PandaAndroid;

export const getAudioFxState = (): AudioFxState | null => {
  try { return android()?.getAudioFxState ? JSON.parse(android().getAudioFxState()) : null; } catch { return null; }
};

export const getAudioSources = (): AudioSource[] => {
  try { return android()?.getAudioSources ? JSON.parse(android().getAudioSources()) : []; } catch { return []; }
};

export const openRadioSoundSettings = (): boolean => !!android()?.openRadioSoundSettings?.();

const levels = (s: AudioSettingsState) => EQ_KEYS.map((k) => Number(s[k]) || 0);

export const initAudioFx = () => {
  if (!android()?.setAudioEq) return;
  let timer: number | undefined;
  let last = '';
  const send = () => {
    const json = JSON.stringify(levels(useUIStore.getState().audioSettings));
    if (json === last) return;
    last = json;
    const ok = android().setAudioEq(json);
    if (!ok) diag('warn', 'audio', 'Equalizer kon niet worden ingesteld (apparaat staat geen algemene equalizer toe)');
  };
  send(); // bewaarde klank na het opstarten
  useUIStore.subscribe((state, prev) => {
    if (state.audioSettings === prev.audioSettings) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(send, 150); // tijdens slepen niet elke stap
  });
};
