// src/store/apps/PhoneApp.tsx
// Telefoon: links de tabbladen Recent en Contacten, rechts altijd het toetsenblok met de groene belknop.
// Tijdens een gesprek vult de gespreksweergave het hele vak. Geen telefoon verbonden: duidelijke melding met
// een knop naar Bluetooth. Bellen gaat via de Android-bridge (radio) of de PandaOS-server (Pi: oFono), zie uiStore.dial.
// Privacy: nummers en contacten worden alleen getoond; niets loggen of opslaan buiten wat de store al doet.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff, Mic, MicOff, Grid3x3, Delete, X, Search, UserPlus
} from 'lucide-react';
import { useUIStore, type PhoneTab, type PhoneContact, type PhoneRecent } from '../uiStore';
import { getEffectiveTheme } from '../../settings';
import {
  SwipeToDelete, ContactDetail, AddContactForm, Avatar, CallButton, AlphaIndex, NoPhoneState, usePhoneLink, indexLetter
} from './PhoneParts';
import { useT } from '../../i18n';
import './_phone-app.scss';

const KEYPAD_KEYS = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];
const MAX_DIGITS = 20;

// Soort gesprek (Android-gesprekslijst via PhoneData.recentsJson: inkomend, uitgaand, gemist/geweigerd)
const RECENT_TYPE_LABEL: Record<PhoneRecent['type'], string> = { incoming: 'Incoming', outgoing: 'Outgoing', missed: 'Missed' };

const digitsOf = (number: string) => number.replace(/[^\d+*#]/g, '');

const formatDuration = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

const useLocale = () => useUIStore((s) => (s.displaySettings.language === 'nl' ? 'nl-NL' : 'en-GB'));

// Kop boven elke dag in Recent: Vandaag, Gisteren, de weekdag (deze week) of de datum
const dayLabel = (time: number, locale: string, t: (s: string) => string) => {
  const date = new Date(time);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(date); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diff === 0) return t('Today');
  if (diff === 1) return t('Yesterday');
  if (diff > 1 && diff < 7) return date.toLocaleDateString(locale, { weekday: 'long' });
  return date.toLocaleDateString(locale, {
    weekday: 'short', day: 'numeric', month: 'long', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {})
  });
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

// --- Toetsenblok (ook tijdens een gesprek voor DTMF-tonen). 0 lang ingedrukt = '+' ---
const Keypad: React.FC<{ onKey: (digit: string) => void; allowPlus?: boolean }> = ({ onKey, allowPlus }) => {
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const startHold = (digit: string) => {
    held.current = false;
    if (!allowPlus || digit !== '0') return;
    holdTimer.current = window.setTimeout(() => { held.current = true; onKey('+'); }, 600);
  };
  const stopHold = () => { if (holdTimer.current) window.clearTimeout(holdTimer.current); holdTimer.current = null; };
  return (
    <div className="phone-keypad">
      {KEYPAD_KEYS.map(([digit, letters]) => (
        <button key={digit} className="keypad-key"
          onPointerDown={() => startHold(digit)} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}
          onClick={() => { if (held.current) { held.current = false; return; } onKey(digit); }}>
          <span className="keypad-digit">{digit}</span>
          <span className="keypad-letters">{letters}</span>
        </button>
      ))}
    </div>
  );
};

// --- Lopend gesprek (bellen / verbonden): links wie, rechts de bediening of het toetsenblok ---
const ActiveCall: React.FC = () => {
  const { call, hangUp, toggleMute, sendDtmf } = useUIStore();
  const duration = useCallDuration(call.state === 'active' ? call.startedAt : null);
  const [showKeypad, setShowKeypad] = useState(false);
  const [dtmf, setDtmf] = useState('');
  const t = useT();
  const showNumber = !!call.number && call.name !== call.number;

  return (
    <div className="phone-call-view">
      <div className="phone-call-who">
        <Avatar name={call.name || call.number} size="large" />
        <span className="call-name">{call.name || call.number}</span>
        {showNumber && <span className="call-number">{call.number}</span>}
        <span className={`call-status ${call.state === 'active' ? 'is-active' : ''}`}>
          {call.state === 'dialing' ? t('Calling...') : duration}
        </span>
      </div>

      <div className="phone-call-controls">
        {showKeypad ? (
          <>
            <div className="call-dtmf">{dtmf}</div>
            <Keypad onKey={(digit) => { sendDtmf(digit); setDtmf((d) => (d + digit).slice(-MAX_DIGITS)); }} />
          </>
        ) : (
          <div className="call-buttons">
            <button className={`call-round ${call.muted ? 'is-on' : ''}`} onClick={toggleMute}>
              <span className="call-round-icon">{call.muted ? <MicOff size={28} /> : <Mic size={28} />}</span>
              <span>{call.muted ? t('Muted') : t('Mute')}</span>
            </button>
            <button className="call-round" onClick={() => setShowKeypad(true)}>
              <span className="call-round-icon"><Grid3x3 size={28} /></span>
              <span>{t('Keypad')}</span>
            </button>
          </div>
        )}
        <div className="call-end-row">
          {showKeypad && (
            <button className="tsl-btn" onClick={() => setShowKeypad(false)}>{t('Hide keypad')}</button>
          )}
          <button className="call-end" onClick={hangUp} aria-label={t('End')}>
            <PhoneOff size={26} /> {t('End')}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Toetsenblok met nummer en groene belknop (rechts) ---
const Dialer: React.FC<{ number: string; setNumber: (fn: (n: string) => string) => void; contacts: PhoneContact[]; recents: PhoneRecent[] }> = ({ number, setNumber, contacts, recents }) => {
  const { dial } = useUIStore();
  const t = useT();
  const clearTimer = useRef<number | null>(null);
  const cleared = useRef(false);

  // Naam bij het getypte nummer (precies hetzelfde nummer, of gelijk aan het eind zoals +31 6.. / 06..)
  const match = useMemo(() => {
    const typed = digitsOf(number).replace(/^\+/, '');
    if (typed.length < 6) return null;
    const tail = typed.slice(-9);
    return contacts.find((c) => c.numbers.some((n) => digitsOf(n.number).endsWith(tail))) ?? null;
  }, [number, contacts]);

  const call = () => {
    if (!number) {
      // Leeg + bellen: laatst gekozen nummer terugzetten (zoals op een telefoon), niet meteen bellen
      const last = recents.find((r) => r.type === 'outgoing');
      if (last) setNumber(() => last.number.slice(0, MAX_DIGITS));
      return;
    }
    dial(number, match?.name);
    setNumber(() => '');
  };

  return (
    <div className="phone-dialer">
      {/* Vaste hoogte en een vaste plek voor de wisknop: de toetsen verschuiven niet bij het typen */}
      <div className="dialer-display">
        <div className="dialer-number">
          <span className="dialer-digits">{number}</span>
          <button className="dialer-backspace" style={{ visibility: number ? 'visible' : 'hidden' }} aria-label={t('Delete')}
            onPointerDown={() => { cleared.current = false; clearTimer.current = window.setTimeout(() => { cleared.current = true; setNumber(() => ''); }, 600); }}
            onPointerUp={() => { if (clearTimer.current) window.clearTimeout(clearTimer.current); }}
            onPointerLeave={() => { if (clearTimer.current) window.clearTimeout(clearTimer.current); }}
            onClick={() => { if (cleared.current) { cleared.current = false; return; } setNumber((n) => n.slice(0, -1)); }}>
            <Delete size={26} />
          </button>
        </div>
        <span className="dialer-match">{match?.name ?? ''}</span>
      </div>
      <Keypad allowPlus onKey={(digit) => setNumber((n) => (n + digit).slice(0, MAX_DIGITS))} />
      <button className="dialer-call" disabled={!number && !recents.some((r) => r.type === 'outgoing')} onClick={call} aria-label={t('Call')}>
        <Phone size={26} /> <span>{t('Call')}</span>
      </button>
    </div>
  );
};

const PhoneApp: React.FC = () => {
  const {
    isPhoneOpen, closePhone, phoneTab, setPhoneTab, call, dial,
    phoneContacts, phoneRecents, phoneStatus,
    keyboardValue, openKeyboard, closeKeyboard, phoneDialPrefill
  } = useUIStore();
  const isDarkMode = useDarkMode();
  const locale = useLocale();
  const link = usePhoneLink(isPhoneOpen);
  const [typedNumber, setTypedNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  // Contacten: gegevens van een contact, of het formulier voor een nieuw contact
  const [selectedContact, setSelectedContact] = useState<PhoneContact | null>(null);
  const [addingContact, setAddingContact] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const t = useT();

  // Zoeken en contactgegevens stoppen bij het wisselen van tab; lijst weer bovenaan
  useEffect(() => {
    setIsSearching(false);
    setSelectedContact(null);
    setAddingContact(false);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [phoneTab]);

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

  // Nummer van buitenaf (services/dialer.ts, bijv. SOS -> 112): in het toetsenblok zetten, NIET bellen
  useEffect(() => {
    if (!isPhoneOpen || phoneDialPrefill === null) return;
    setTypedNumber(phoneDialPrefill.slice(0, MAX_DIGITS));
    useUIStore.setState({ phoneDialPrefill: null });
  }, [isPhoneOpen, phoneDialPrefill]);

  const query = isSearching ? keyboardValue.trim().toLowerCase() : '';
  const queryDigits = query.replace(/[^\d+]/g, '');

  // Contacten op naam, gegroepeerd per beginletter ('#' achteraan)
  const contactGroups = useMemo(() => {
    const list = phoneContacts
      .filter((c) => !query || c.name.toLowerCase().includes(query)
        || (queryDigits.length > 0 && c.numbers.some((n) => digitsOf(n.number).includes(queryDigits))))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    const groups = new Map<string, PhoneContact[]>();
    for (const contact of list) {
      const letter = indexLetter(contact.name);
      groups.set(letter, [...(groups.get(letter) ?? []), contact]);
    }
    return [...groups.entries()].sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)));
  }, [phoneContacts, query, queryDigits]);

  // Recente gesprekken per dag, nieuwste eerst
  const recentGroups = useMemo(() => {
    const groups: { label: string; items: PhoneRecent[] }[] = [];
    for (const recent of [...phoneRecents].sort((a, b) => b.time - a.time)) {
      const label = dayLabel(recent.time, locale, t);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(recent);
      else groups.push({ label, items: [recent] });
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneRecents, locale]);

  if (!isPhoneOpen) return null;

  // Het toetsenblok staat altijd rechts; links alleen Recent en Contacten
  const listTab: PhoneTab = phoneTab === 'Contacts' ? 'Contacts' : 'Recents';
  const inCall = call.state === 'dialing' || call.state === 'active';
  const noPhone = link.state === 'disconnected';
  const hasData = phoneRecents.length > 0 || phoneContacts.length > 0;
  const canAddContact = !!(window as any).PandaAndroid?.addContact;

  const jumpTo = (letter: string) => {
    const container = listRef.current;
    // De groep (niet de plakkende kop zelf): offsetTop ten opzichte van de lijst (position: relative)
    const group = container?.querySelector<HTMLElement>(`[data-letter="${letter}"]`)?.parentElement;
    if (container && group) container.scrollTop = group.offsetTop;
  };

  const stopSearch = () => { setIsSearching(false); closeKeyboard(); };

  const deleteRecent = (recent: PhoneRecent) => {
    (window as any).PandaAndroid?.deleteCall?.(recent.number, recent.time);
    useUIStore.setState((st) => ({ phoneRecents: st.phoneRecents.filter((r) => !(r.number === recent.number && r.time === recent.time)) }));
  };

  const renderRecents = () => (
    recentGroups.length === 0 ? (
      <div className="phone-empty">
        <PhoneIncoming size={28} />
        <span>{t('No recent calls yet.')}</span>
      </div>
    ) : recentGroups.map((group) => (
      <div key={group.label} className="phone-group">
        <div className="phone-group-head">{group.label}</div>
        {group.items.map((recent) => {
          const hasName = !!recent.name && recent.name !== recent.number;
          return (
            // Tik op de regel = nummer in het toetsenblok; groene knop = meteen bellen; naar links vegen = verwijderen
            <SwipeToDelete key={`${recent.number}-${recent.time}`} onClick={() => setTypedNumber(recent.number.slice(0, MAX_DIGITS))}
              onDelete={() => deleteRecent(recent)}>
              {/* Alleen het pictogram heeft de kleur van het soort gesprek; rood (naam) alleen bij gemist */}
              <div className={`phone-row phone-recent is-call-${recent.type}`}>
                <span className="phone-recent-icon" aria-label={t(RECENT_TYPE_LABEL[recent.type])}>
                  {recent.type === 'missed' ? <PhoneMissed size={20} />
                    : recent.type === 'outgoing' ? <PhoneOutgoing size={20} /> : <PhoneIncoming size={20} />}
                </span>
                <div className="phone-row-text">
                  <span className="phone-row-title phone-recent-name">{hasName ? recent.name : recent.number}</span>
                  <small className="phone-row-sub">
                    {[t(RECENT_TYPE_LABEL[recent.type]), hasName ? recent.number : null].filter(Boolean).join(' · ')}
                  </small>
                </div>
                <span className="phone-row-time">
                  {new Date(recent.time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                </span>
                <CallButton onCall={() => dial(recent.number, hasName ? recent.name : undefined)} />
              </div>
            </SwipeToDelete>
          );
        })}
      </div>
    ))
  );

  const renderContacts = () => {
    if (addingContact) {
      return <AddContactForm onDone={(saved) => {
        setAddingContact(false);
        if (saved) window.dispatchEvent(new Event('pandaos-permissions')); // lijst opnieuw inlezen
      }} />;
    }
    if (selectedContact) {
      return <ContactDetail contact={selectedContact} onBack={() => setSelectedContact(null)}
        onPickNumber={(number) => setTypedNumber(number.slice(0, MAX_DIGITS))} />;
    }
    if (phoneContacts.length === 0) {
      return (
        <div className="phone-empty">
          <Search size={28} />
          <span>{t('No contacts yet. They appear when your phone shares them.')}</span>
        </div>
      );
    }
    if (contactGroups.length === 0) {
      return <div className="phone-empty"><Search size={28} /><span>{t('No contacts found')}</span></div>;
    }
    return contactGroups.map(([letter, list]) => (
      <div key={letter} className="phone-group">
        <div className="phone-group-head" data-letter={letter}>{letter}</div>
        {list.map((contact, i) => {
          const first = contact.numbers[0];
          const more = contact.numbers.length - 1;
          return (
            <div key={`${contact.name}-${i}`} className="phone-row" onClick={() => setSelectedContact(contact)}>
              <Avatar name={contact.name} />
              <div className="phone-row-text">
                <span className="phone-row-title">{contact.name}</span>
                {first && (
                  <small className="phone-row-sub">
                    {`${t(first.label)} ${first.number}`}{more > 0 ? ` · +${more}` : ''}
                  </small>
                )}
              </div>
              {first && <CallButton onCall={() => dial(first.number, contact.name)} />}
            </div>
          );
        })}
      </div>
    ));
  };

  const showContactTools = listTab === 'Contacts' && !addingContact && !selectedContact && phoneContacts.length > 0;
  const showIndex = showContactTools && !query;

  return (
    <div className={`phone-app tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
      {/* Kop: verbonden telefoon + sluiten */}
      <header className="phone-header">
        <div className="phone-device">
          <span className={`phone-device-dot is-${link.state}`} />
          <div className="phone-device-text">
            <span className="tsl-field-text">
              {link.state === 'connected' ? (link.name || t('Phone connected'))
                : link.state === 'disconnected' ? (link.bluetoothOff ? t('Bluetooth is off') : t('No phone connected'))
                  : t('Phone')}
            </span>
            {phoneStatus && <small className="tsl-hint">{phoneStatus}</small>}
          </div>
        </div>
        <button className="phone-close" onClick={closePhone} aria-label={t('Close')}><X size={26} /></button>
      </header>

      {inCall ? (
        <section className="phone-panel phone-call-panel"><ActiveCall /></section>
      ) : (
        <div className="phone-columns">
          {/* --- LINKS: Recent en Contacten --- */}
          <section className="phone-panel phone-list-panel">
            <div className="phone-tabs" role="tablist">
              {(['Recents', 'Contacts'] as PhoneTab[]).map((tab) => (
                <button key={tab} role="tab" aria-selected={listTab === tab} className={listTab === tab ? 'is-active' : ''}
                  onClick={() => setPhoneTab(tab)}>{t(tab)}</button>
              ))}
            </div>

            {noPhone && !hasData ? (
              <NoPhoneState link={link} />
            ) : (
              <>
                {noPhone && <NoPhoneState link={link} compact />}

                {showContactTools && (
                  <div className="phone-search-row">
                    <div className={`phone-search ${isSearching ? 'is-active' : ''}`}>
                      <Search size={20} />
                      <input
                        type="text" placeholder={t('Search contacts')} readOnly
                        value={isSearching ? keyboardValue : ''}
                        onFocus={() => { setIsSearching(true); openKeyboard(''); }}
                      />
                      {isSearching && (
                        <button className="phone-search-clear" onClick={stopSearch} aria-label={t('Clear search')}><X size={20} /></button>
                      )}
                    </div>
                    {canAddContact && (
                      <button className="phone-icon-btn" onClick={() => { stopSearch(); setAddingContact(true); }} aria-label={t('Add contact')}>
                        <UserPlus size={22} />
                      </button>
                    )}
                  </div>
                )}

                <div className="phone-list-body">
                  <div className="phone-list-scroll tsl-scroll" ref={listRef}>
                    {listTab === 'Recents' ? renderRecents() : renderContacts()}
                  </div>
                  {showIndex && <AlphaIndex letters={contactGroups.map(([letter]) => letter)} onPick={jumpTo} />}
                </div>
              </>
            )}
          </section>

          {/* --- RECHTS: toetsenblok --- */}
          <section className="phone-panel phone-dial-panel">
            <Dialer number={typedNumber} setNumber={setTypedNumber} contacts={phoneContacts} recents={phoneRecents} />
          </section>
        </div>
      )}
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
        <Avatar name={call.name || call.number} />
        <div className="call-overlay-text">
          <span className="tsl-field-text">{call.name || call.number}</span>
          <small className="tsl-hint">{t('Incoming call')}{call.number && call.number !== call.name ? ` · ${call.number}` : ''}</small>
        </div>
        <button className="call-overlay-btn is-decline" onClick={hangUp} aria-label={t('Decline')}><PhoneOff size={24} /></button>
        <button className="call-overlay-btn is-answer" onClick={() => { answerCall(); openPhone(); }} aria-label={t('Answer')}><Phone size={24} /></button>
      </div>
    );
  }

  if ((call.state === 'active' || call.state === 'dialing') && !isPhoneOpen) {
    return (
      <button className={`call-pill tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => { e.stopPropagation(); openPhone(); }}>
        <Phone size={16} /> {call.name || call.number} · {call.state === 'dialing' ? t('Calling...') : duration}
      </button>
    );
  }

  return null;
};

export default PhoneApp;
