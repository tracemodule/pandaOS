// Rechten (Instellingen > Rechten): alle rechten van PandaOS met hun status en hoe je ze geeft (PermissionsCenter.kt).
// Kan PandaOS het zelf vragen, dan staat er een knop; anders de opdracht voor de laptop (adb).
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { useT } from '../../i18n';

type Item = { id: string; group: 'car' | 'phone' | 'system'; kind: 'runtime' | 'adb' | 'special'; granted: boolean; canRequest: boolean; adb: string | null };

const bridge = () => (window as any).PandaAndroid;

// Naam en waarvoor PandaOS het gebruikt
const INFO: Record<string, { name: string; use: string }> = {
  camera: { name: 'Camera', use: 'Rear camera' },
  microphone: { name: 'Microphone', use: 'Voice input on the keyboard' },
  location: { name: 'Location', use: 'Map, speed and trips' },
  contacts: { name: 'Contacts', use: 'Phone: contacts from your phone' },
  calllog: { name: 'Call history', use: 'Phone: recent calls' },
  calllog_edit: { name: 'Edit call history', use: 'Phone: swipe to delete a recent call' },
  contacts_edit: { name: 'Edit contacts', use: 'Phone: add a contact' },
  call: { name: 'Make calls', use: 'Phone: call directly' },
  calendar: { name: 'Calendar', use: 'Calendar: your appointments' },
  sms: { name: 'Messages', use: 'Messages: your text messages' },
  notifications: { name: 'Notifications and media', use: 'What is playing, notifications in the panel' },
  overlay: { name: 'Show over other apps', use: 'PandaOS menu, volume and buttons over other apps' },
  logs: { name: 'Radio log', use: 'Volume of the radio, CAN monitor' },
  secure: { name: 'System settings', use: 'Radio settings, time, half-screen apps' },
  config: { name: 'Android language', use: 'Language of Android' },
  windows: { name: 'Half-screen apps', use: 'Apps next to the car (restart needed)' },
};

const GROUPS: { id: Item['group']; title: string }[] = [
  { id: 'car', title: 'Car' },
  { id: 'phone', title: 'Phone' },
  { id: 'system', title: 'System' },
];

const PermissionsPanel: React.FC = () => {
  const t = useT();
  const [items, setItems] = useState<Item[]>([]);

  const read = useCallback(() => {
    try { setItems(JSON.parse(bridge()?.getPermissions?.() ?? '{"items":[]}').items ?? []); } catch { setItems([]); }
  }, []);

  // Opnieuw lezen na een venster van Android of terugkomen uit een instellingenscherm
  useEffect(() => {
    read();
    window.addEventListener('pandaos-permissions', read);
    document.addEventListener('visibilitychange', read);
    return () => { window.removeEventListener('pandaos-permissions', read); document.removeEventListener('visibilitychange', read); };
  }, [read]);

  if (!bridge()?.getPermissions) return null; // alleen op de radio

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {GROUPS.map((group) => (
        <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="tsl-title">{t(group.title)}</label>
          <div className="tsl-list">
            {items.filter((i) => i.group === group.id).map((item) => (
              <div key={item.id} className="tsl-list-row" style={{ alignItems: 'center' }}>
                {item.granted ? <CheckCircle2 size={20} color="#3ba55d" /> : <Circle size={20} style={{ opacity: 0.5 }} />}
                <div className="tsl-list-text" style={{ flex: 1 }}>
                  <span className="tsl-field-text">{t(INFO[item.id]?.name ?? item.id)}</span>
                  <small className="tsl-hint">
                    {!item.granted && !item.canRequest && item.adb ? item.adb : t(INFO[item.id]?.use ?? '')}
                  </small>
                </div>
                {!item.granted && item.canRequest && (
                  <button className="tsl-btn is-small" onClick={() => { bridge()?.requestPermission?.(item.id); setTimeout(read, 800); }}>
                    {t('Allow')}
                  </button>
                )}
                {!item.granted && !item.canRequest && <small className="tsl-hint">{t('Via laptop')}</small>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default PermissionsPanel;
