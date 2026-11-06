// src/store/apps/PhoneApp.tsx
// Telefoon via Bluetooth: links recente oproepen en contacten, rechts het toetsenblok en het gesprek zelf.
// Het echte bellen gebeurt op de server (Raspberry Pi: oFono/obexd, zie server/scripts/phone.js).
// Stijl: Tesla UI Kit-onderdelen uit _tesla-ui.scss (tsl-segmented, tsl-list, tsl-btn).
import React, { useEffect, useState } from 'react';
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff, Mic, MicOff, Grid3x3, Delete, X, Search
} from 'lucide-react';
import { useUIStore, type PhoneTab, type PhoneContact, type PhoneRecent } from '../uiStore';
import { getEffectiveTheme } from '../../settings';
import { SwipeToDelete, ContactDetail, AddContactForm } from './PhoneParts';
import { useT } from '../../i18n';
import './_phone-app.scss';

const KEYPAD_KEYS = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];

// Soort gesprek (Android-gesprekslijst via PhoneData.recentsJson: inkomend, uitgaand, gemist/geweigerd)
const RECENT_TYPE_LABEL: Record<PhoneRecent['type'], string> = { incoming: 'Incoming', outgoing: 'Outgoing', missed: 'Missed' };

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '#';

const formatDuration = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const formatRecentTime = (time: number) => {
  const date = new Date(time);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
};

// Gespreksduur die elke seconde bijwerkt
const useCallDuration = (startedAt: number | null) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt ? formatDuration(now - startedAt) : null;
};

const useDarkMode = () => {
  const { screenMode, vehicleLightsOn } = useUIStore();
  return getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
};

// --- Toetsenblok (ook gebruikt tijdens een gesprek voor DTMF-tonen) ---
const Keypad: React.FC<{ onKey: (digit: string) => void }> = ({ onKey }) => (
  <div className="phone-keypad">
    {KEYPAD_KEYS.map(([digit, letters]) => (
      <button key={digit} className="keypad-key" onClick={() => onKey(digit)}>
        <span className="keypad-digit">{digit}</span>
        <span className="keypad-letters">{letters}</span>
      </button>
    ))}
  </div>
);

// --- Lopend gesprek (bellen / verbonden) ---
const ActiveCall: React.FC = () => {
  const { call, hangUp, toggleMute, sendDtmf } = useUIStore();
  const duration = useCallDuration(call.state === 'active' ? call.startedAt : null);
  const [showKeypad, setShowKeypad] = useState(false);
  const t = useT();

  return (
    <div className="phone-active-call">
      <div className="call-avatar is-large">{initials(call.name)}</div>
      <span className="call-name">{call.name}</span>
      <span className="tsl-hint">
        {call.state === 'dialing' ? t('Calling...') : duration}
        {call.name !== call.number && call.number ? ` · ${call.number}` : ''}
      </span>

      {showKeypad && <Keypad onKey={sendDtmf} />}

      <div className="call-actions">
        <button className={`tsl-btn ${call.muted ? 'is-primary' : ''}`} onClick={toggleMute}>
          {call.muted ? <MicOff size={20} /> : <Mic size={20} />} {call.muted ? t('Muted') : t('Mute')}
        </button>
        <button className={`tsl-btn ${showKeypad ? 'is-primary' : ''}`} onClick={() => setShowKeypad(!showKeypad)}>
          <Grid3x3 size={20} /> {t('Keypad')}
        </button>
        <button className="tsl-btn is-danger" onClick={hangUp}>
          <PhoneOff size={20} /> {t('End')}
        </button>
      </div>
    </div>
  );
};

// Indeling zoals de Android-telefoonapp, in de PandaOS-stijl:
// links recente oproepen / contacten, rechts het toetsenblok (of het lopende gesprek)
const PhoneApp: React.FC = () => {
  const {
    isPhoneOpen, closePhone, phoneTab, setPhoneTab, call, dial,
    phoneContacts, phoneRecents, phoneStatus, btDevices, btKnownDevices, btConnectedAddress,
    keyboardValue, openKeyboard, phoneDialPrefill
  } = useUIStore();
  const isDarkMode = useDarkMode();
  const [typedNumber, setTypedNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  // Contacten: gegevens van een contact, of het formulier voor een nieuw contact
  const [selectedContact, setSelectedContact] = useState<PhoneContact | null>(null);
  const [addingContact, setAddingContact] = useState(false);
  const t = useT();

  // Zoeken stopt bij het wisselen van tab
  useEffect(() => setIsSearching(false), [phoneTab]);

  // Op de radio: contacten en recente gesprekken uit Android (de telefoon deelt ze via Bluetooth). Bij het openen,
  // na een nieuw recht en elke 30 s zolang Telefoon open is.
  useEffect(() => {
    const android = (window as any).PandaAndroid;
    if (!isPhoneOpen || !android?.getPhoneContacts) return;
    android.requestPhonePermissions?.();
    const load = () => {
      try {
        const includeGoogle = !!useUIStore.getState().appSettings.contactsFromGoogle;
        const contacts = JSON.parse((android.getPhoneContactsWithGoogle ? android.getPhoneContactsWithGoogle(includeGoogle) : android.getPhoneContacts()) || '[]');
        const recents = JSON.parse(android.getPhoneRecents() || '[]');
        useUIStore.setState({ phoneContacts: contacts, phoneRecents: recents });
      } catch { /* geen gegevens */ }
    };
    load();
    const timer = window.setInterval(load, 30000);
    window.addEventListener('pandaos-permissions', load);
    return () => { window.clearInterval(timer); window.removeEventListener('pandaos-permissions', load); };
  }, [isPhoneOpen]);

  // Nummer van buitenaf (services/dialer.ts, bijv. SOS): in het toetsenblok zetten, niet bellen
  useEffect(() => {
    if (!isPhoneOpen || phoneDialPrefill === null) return;
    setTypedNumber(phoneDialPrefill.slice(0, 20));
    useUIStore.setState({ phoneDialPrefill: null });
  }, [isPhoneOpen, phoneDialPrefill]);

  if (!isPhoneOpen) return null;

  // Het toetsenblok staat altijd rechts; links alleen Recent en Contacten
  const listTab: PhoneTab = phoneTab === 'Contacts' ? 'Contacts' : 'Recents';
  const inCall = call.state === 'dialing' || call.state === 'active';
  const connectedPhone = [...btKnownDevices, ...btDevices].find((d) => d.address === btConnectedAddress);
  const query = isSearching ? keyboardValue.trim().toLowerCase() : '';
  const visibleContacts = phoneContacts
    .filter((c) => !query || c.name.toLowerCase().includes(query) || c.numbers.some((n) => n.number.replace(/\s/g, '').includes(query)))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className={`phone-app tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
      {/* Kop: verbonden telefoon + sluiten */}
      <header className="phone-header">
        <div className="phone-device">
          <Phone size={20} />
          <div className="phone-device-text">
            <span className="tsl-field-text">{connectedPhone?.name || t('No phone connected')}</span>
            {phoneStatus && <small className="tsl-hint">{phoneStatus}</small>}
          </div>
        </div>
        <button className="phone-close" onClick={closePhone} aria-label={t('Close')}><X size={24} /></button>
      </header>

      <div className="phone-columns">
        {/* --- LINKS: recente oproepen en contacten --- */}
        <section className="phone-panel phone-list-panel">
          <div className="tsl-segmented">
            {(['Recents', 'Contacts'] as PhoneTab[]).map((tab) => (
              <button key={tab} className={listTab === tab ? 'is-active' : ''} onClick={() => setPhoneTab(tab)}>{t(tab)}</button>
            ))}
          </div>

          <div className="phone-list-scroll">
            {listTab === 'Recents' && (
              phoneRecents.length === 0 ? (
                <p className="tsl-hint phone-empty">{t('No recent calls yet.')}</p>
              ) : (
                <div className="phone-recents">
                  {phoneRecents.map((recent) => {
                    const hasName = !!recent.name && recent.name !== recent.number;
                    return (
                      // Tik op de regel = nummer in het toetsenblok; groene knop = meteen bellen; naar links vegen = verwijderen
                      <SwipeToDelete key={`${recent.number}-${recent.time}`} onClick={() => setTypedNumber(recent.number)}
                        onDelete={() => {
                          (window as any).PandaAndroid?.deleteCall?.(recent.number, recent.time);
                          useUIStore.setState((st) => ({ phoneRecents: st.phoneRecents.filter((r) => !(r.number === recent.number && r.time === recent.time)) }));
                        }}>
                        {/* Kaartje; alleen het pictogram heeft de kleur van het soort gesprek, rood alleen bij gemist */}
                        <div className={`phone-recent is-call-${recent.type}`}>
                          <span className="phone-recent-icon" aria-label={t(RECENT_TYPE_LABEL[recent.type])}>
                            {recent.type === 'missed' ? <PhoneMissed size={20} />
                              : recent.type === 'outgoing' ? <PhoneOutgoing size={20} /> : <PhoneIncoming size={20} />}
                          </span>
                          <div className="phone-recent-text">
                            <span className="tsl-field-text phone-recent-name">{hasName ? recent.name : recent.number}</span>
                            <small className="tsl-hint">
                              {[t(RECENT_TYPE_LABEL[recent.type]), hasName ? recent.number : null, formatRecentTime(recent.time)].filter(Boolean).join(' · ')}
                            </small>
                          </div>
                          <button className="tsl-btn is-small is-success" onClick={(e) => { e.stopPropagation(); dial(recent.number, recent.name); }} aria-label={t('Call')}>
                            <Phone size={18} color="#ffffff" />
                          </button>
                        </div>
                      </SwipeToDelete>
                    );
                  })}
                </div>
              )
            )}

            {listTab === 'Contacts' && addingContact && (
              <AddContactForm onDone={(saved) => {
                setAddingContact(false);
                if (saved) window.dispatchEvent(new Event('pandaos-permissions')); // lijst opnieuw inlezen
              }} />
            )}
            {listTab === 'Contacts' && !addingContact && selectedContact && (
              <ContactDetail contact={selectedContact} onBack={() => setSelectedContact(null)} />
            )}
            {listTab === 'Contacts' && !addingContact && !selectedContact && (
              <>
                {(window as any).PandaAndroid?.addContact && (
                  <button className="tsl-btn is-small" style={{ alignSelf: 'flex-start', marginBottom: 8 }}
                    onClick={() => setAddingContact(true)}>+ {t('Add contact')}</button>
                )}
                <div className="phone-search">
                  <Search size={18} />
                  <input
                    type="text" placeholder={t('Search contacts')} readOnly
                    value={isSearching ? keyboardValue : ''}
                    onFocus={() => { setIsSearching(true); openKeyboard(''); }}
                  />
                </div>
                {phoneContacts.length === 0 ? (
                  <p className="tsl-hint phone-empty">{t('No contacts yet. They appear when your phone shares them.')}</p>
                ) : (
                  <div className="tsl-list">
                    {visibleContacts.map((contact) => (
                      <div key={contact.name} className="tsl-list-row phone-row" onClick={() => setSelectedContact(contact)}>
                        <div className="call-avatar">{initials(contact.name)}</div>
                        <div className="tsl-list-text">
                          <span className="tsl-field-text">{contact.name}</span>
                          <small className="tsl-hint">{contact.numbers.map((n) => `${t(n.label)} ${n.number}`).join(' · ')}</small>
                        </div>
                        <button className="tsl-btn is-small is-success" onClick={(e) => { e.stopPropagation(); dial(contact.numbers[0]?.number, contact.name); }} aria-label={t('Call')}>
                          <Phone size={18} color="#ffffff" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* --- RECHTS: toetsenblok, of het lopende gesprek --- */}
        <section className="phone-panel phone-dial-panel">
          {inCall ? (
            <ActiveCall />
          ) : (
            <div className="phone-dialer">
              {/* Vaste hoogte en een vaste plek voor de wisknop: de toetsen verschuiven niet bij het typen */}
              <div className="dialer-number">
                <span className="dialer-digits">{typedNumber}</span>
                <button className="dialer-backspace" style={{ visibility: typedNumber ? 'visible' : 'hidden' }}
                  onClick={() => setTypedNumber(typedNumber.slice(0, -1))} aria-label={t('Delete')}>
                  <Delete size={24} />
                </button>
              </div>
              <Keypad onKey={(digit) => setTypedNumber((n) => (n + digit).slice(0, 20))} />
              <button className="dialer-call" disabled={!typedNumber} onClick={() => { dial(typedNumber); setTypedNumber(''); }} aria-label={t('Call')}>
                <Phone size={28} />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

// --- Inkomende oproep (boven alles) en gesprek-balkje als de Phone-app dicht is ---
export const CallOverlay: React.FC = () => {
  const { call, answerCall, hangUp, isPhoneOpen, openPhone } = useUIStore();
  const t = useT();
  const isDarkMode = useDarkMode();
  const duration = useCallDuration(call.state === 'active' ? call.startedAt : null);

  if (call.state === 'incoming') {
    return (
      <div className={`call-overlay tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="call-avatar">{initials(call.name)}</div>
        <div className="call-overlay-text">
          <span className="tsl-field-text">{call.name}</span>
          <small className="tsl-hint">{t('Incoming call')}{call.number && call.number !== call.name ? ` · ${call.number}` : ''}</small>
        </div>
        <button className="tsl-btn is-danger is-round" onClick={hangUp} aria-label={t('Decline')}><PhoneOff size={22} /></button>
        <button className="tsl-btn is-success is-round" onClick={() => { answerCall(); openPhone(); }} aria-label={t('Answer')}><Phone size={22} /></button>
      </div>
    );
  }

  if ((call.state === 'active' || call.state === 'dialing') && !isPhoneOpen) {
    return (
      <button className={`call-pill tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => { e.stopPropagation(); openPhone(); }}>
        <Phone size={16} /> {call.name} · {call.state === 'dialing' ? t('Calling...') : duration}
      </button>
    );
  }

  return null;
};

export default PhoneApp;
