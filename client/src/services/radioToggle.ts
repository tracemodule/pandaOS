// Wifi en Bluetooth aan/uit via de launcher (RadioConnectivity.kt). Op de Jancar-radio kan dat stil mislukken:
// de Bluetooth-dienst van Jancar zet Bluetooth terug, en MediaTek-ROM's kunnen wifi-schakelen door apps blokkeren
// (gemeld 6-11-2026). Daarom na het schakelen nakijken; lukte het niet, dan een melding en de Android-instellingen.
import { useUIStore } from '../store/uiStore';
import { translate } from '../i18n';
import { diag } from './diagnostics';

const bridge = () => (window as any).PandaAndroid;

export const toggleRadio = (kind: 'wifi' | 'bluetooth', on: boolean, onDone?: () => void) => {
  const b = bridge();
  if (!b) return;
  const accepted = kind === 'wifi' ? b.setWifiEnabled?.(on) : b.setBluetoothEnabled?.(on);
  setTimeout(() => {
    let enabled: boolean | undefined;
    try { enabled = JSON.parse((kind === 'wifi' ? b.getWifiState?.() : b.getBluetoothState?.()) ?? 'null')?.enabled; } catch { /* geen status */ }
    onDone?.();
    if (enabled === on) return;
    const { showNotification, displaySettings } = useUIStore.getState();
    const t = (text: string) => translate(text, displaySettings.language);
    diag('error', kind, `${kind} ${on ? 'aan' : 'uit'} lukte niet (launcher: ${accepted}, nu: ${enabled})`);
    showNotification(t(kind === 'wifi' ? 'The radio did not switch Wi-Fi. Opening the Android settings.' : 'The radio did not switch Bluetooth. Opening the Android settings.'), 'alert', kind === 'wifi' ? 'WI-FI' : 'BLUETOOTH');
    if (kind === 'wifi') b.openWifiSettings?.(); else b.openBluetoothSettings?.();
  }, accepted === false ? 300 : 2500);
};
