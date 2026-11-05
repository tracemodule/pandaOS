// Contacten, Agenda en Berichten: PandaOS-apps naast de auto (zoals Theater), met de gegevens van je telefoon.
// De launcher leest wat Android op de radio bewaart (PhoneData.kt): contacten en gesprekken die de telefoon via
// Bluetooth deelt, de agenda (alleen via een account op de radio, niet via Bluetooth) en berichten als de radio die
// bewaart. Geen gegevens: uitleg in plaats van een lege lijst.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Users, CalendarDays, MessageSquare, Phone } from 'lucide-react';
import { useUIStore } from '../uiStore';
import { useT } from '../../i18n';
import { getEffectiveTheme } from '../../settings';
import './_theater.scss';
import { ContactDetail } from './PhoneParts';

const bridge = () => (window as any).PandaAndroid;

type Contact = { name: string; numbers: { label: string; number: string }[]; source?: string };
type CalendarEvent = { title: string; start: number; end: number; allDay: boolean; location: string; calendar: string; color: string };
type Message = { name: string; number: string; text: string; time: number; incoming: boolean; read: boolean };

// Gegevens laden bij openen, na een nieuw recht en elke 30 s; vraagt de rechten van de groep Telefoon
function usePhoneData<T>(open: boolean, read: () => string | undefined): [T[], boolean] {
  const [items, setItems] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(() => {
    try { setItems(JSON.parse(read() ?? '[]')); } catch { setItems([]); }
    setLoaded(true);
  }, [read]);
  useEffect(() => {
    if (!open || !bridge()) return;
    bridge().requestPhonePermissions?.();
    load();
    const timer = window.setInterval(load, 30000);
    window.addEventListener('pandaos-permissions', load);
    return () => { window.clearInterval(timer); window.removeEventListener('pandaos-permissions', load); };
  }, [open, load]);
  return [items, loaded];
}

const Shell: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => {
  const t = useT();
  const { closePanelApp, screenMode, vehicleLightsOn } = useUIStore();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  return (
    <div className={`theater-app tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="theater-head">
        <div className="theater-title">{icon}<span>{title}</span></div>
        <button className="theater-close" onClick={closePanelApp} aria-label={t('Close')}><X size={22} /></button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</div>
    </div>
  );
};

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <p className="tsl-hint" style={{ padding: '24px 4px' }}>{text}</p>
);

const time = (ms: number) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
const day = (ms: number) => new Date(ms).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

// --- Contacten ---
const ContactsView: React.FC = () => {
  const t = useT();
  const { dial, appSettings } = useUIStore();
  const includeGoogle = !!appSettings.contactsFromGoogle;
  const read = useCallback(() => (bridge()?.getPhoneContactsWithGoogle
    ? bridge().getPhoneContactsWithGoogle(includeGoogle) : bridge()?.getPhoneContacts?.()), [includeGoogle]);
  const [contacts, loaded] = usePhoneData<Contact>(true, read);
  const [selected, setSelected] = useState<Contact | null>(null);
  const groups = useMemo(() => {
    const map = new Map<string, Contact[]>();
    for (const c of contacts) {
      const letter = (c.name[0] ?? '#').toUpperCase().replace(/[^A-Z]/, '#');
      map.set(letter, [...(map.get(letter) ?? []), c]);
    }
    return [...map.entries()];
  }, [contacts]);
  return (
    <Shell icon={<Users size={22} />} title={t('Contacts')}>
      {selected && <ContactDetail contact={selected} onBack={() => setSelected(null)} />}
      {!selected && loaded && contacts.length === 0 && <Empty text={t('No contacts yet. Connect your phone via Bluetooth and allow it to share contacts.')} />}
      {!selected && groups.map(([letter, list]) => (
        <div key={letter} style={{ marginBottom: 12 }}>
          <div className="tsl-title" style={{ padding: '6px 4px' }}>{letter}</div>
          <div className="tsl-list">
            {list.map((c) => (
              <div key={c.name} className="tsl-list-row" style={{ alignItems: 'center', cursor: 'pointer' }} onClick={() => setSelected(c)}>
                <div className="tsl-list-text" style={{ flex: 1 }}>
                  <span className="tsl-field-text">{c.name}</span>
                  <small className="tsl-hint">{c.numbers.map((n) => n.label).join(' · ')}</small>
                </div>
                {c.numbers[0] && (
                  <button className="tsl-btn is-small is-success" aria-label={t('Call')}
                    onClick={(e) => { e.stopPropagation(); dial(c.numbers[0].number, c.name); }}><Phone size={18} color="#ffffff" /></button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </Shell>
  );
};

// --- Agenda ---
const CalendarView: React.FC = () => {
  const t = useT();
  const read = useCallback(() => bridge()?.getCalendarEvents?.(14), []);
  const [events, loaded] = usePhoneData<CalendarEvent>(true, read);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) map.set(day(e.start), [...(map.get(day(e.start)) ?? []), e]);
    return [...map.entries()];
  }, [events]);
  return (
    <Shell icon={<CalendarDays size={22} />} title={t('Calendar')}>
      {loaded && events.length === 0 && <Empty text={t('No appointments in the next two weeks. Your phone does not share its calendar via Bluetooth; add your account on the radio to see it here.')} />}
      {byDay.map(([label, list]) => (
        <div key={label} style={{ marginBottom: 14 }}>
          <div className="tsl-title" style={{ padding: '6px 4px', textTransform: 'capitalize' }}>{label}</div>
          <div className="tsl-list">
            {list.map((e, i) => (
              <div key={i} className="tsl-list-row" style={{ alignItems: 'center', gap: 12 }}>
                <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: e.color || '#2e78ff' }} />
                <div className="tsl-list-text" style={{ flex: 1 }}>
                  <span className="tsl-field-text">{e.title || t('(No title)')}</span>
                  <small className="tsl-hint">{e.allDay ? t('All day') : `${time(e.start)} – ${time(e.end)}`}{e.location ? ` · ${e.location}` : ''}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Shell>
  );
};

// --- Berichten: per gesprek het laatste bericht ---
const MessagesView: React.FC = () => {
  const t = useT();
  const read = useCallback(() => bridge()?.getPhoneMessages?.(), []);
  const [messages, loaded] = usePhoneData<Message>(true, read);
  const [openNumber, setOpenNumber] = useState<string | null>(null);
  const threads = useMemo(() => {
    const map = new Map<string, Message[]>();
    for (const m of messages) map.set(m.number, [...(map.get(m.number) ?? []), m]);
    return [...map.values()];
  }, [messages]);
  const thread = openNumber ? threads.find((list) => list[0].number === openNumber) : undefined;
  return (
    <Shell icon={<MessageSquare size={22} />} title={thread ? thread[0].name : t('Messages')}>
      {loaded && messages.length === 0 && <Empty text={t('No messages. They appear here when your phone shares them via Bluetooth.')} />}
      {thread ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="tsl-btn is-small" style={{ alignSelf: 'flex-start' }} onClick={() => setOpenNumber(null)}>{t('Back')}</button>
          {[...thread].reverse().map((m, i) => (
            <div key={i} style={{ alignSelf: m.incoming ? 'flex-start' : 'flex-end', maxWidth: '80%', padding: '8px 12px', borderRadius: 14,
              background: m.incoming ? 'var(--th-tile)' : '#2e78ff', color: m.incoming ? 'inherit' : '#fff' }}>
              <div>{m.text}</div>
              <small style={{ opacity: 0.7 }}>{time(m.time)}</small>
            </div>
          ))}
        </div>
      ) : (
        <div className="tsl-list">
          {threads.map((list) => (
            <div key={list[0].number} className="tsl-list-row" style={{ cursor: 'pointer' }} onClick={() => setOpenNumber(list[0].number)}>
              <div className="tsl-list-text" style={{ flex: 1 }}>
                <span className="tsl-field-text" style={{ fontWeight: list[0].read ? 500 : 700 }}>{list[0].name}</span>
                <small className="tsl-hint" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{list[0].text}</small>
              </div>
              <small className="tsl-hint">{time(list[0].time)}</small>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
};

const PhoneDataApps: React.FC = () => {
  const panelApp = useUIStore((s) => s.panelApp);
  if (panelApp === 'contacts') return <ContactsView />;
  if (panelApp === 'calendar') return <CalendarView />;
  if (panelApp === 'messages') return <MessagesView />;
  return null;
};

export default PhoneDataApps;
