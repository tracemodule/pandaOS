// Onderdelen voor Telefoon en Contacten: veeg-om-te-verwijderen, avatar, alfabet-index, "geen telefoon"-scherm,
// contactgegevens en contact toevoegen. Stijl in _phone-app.scss (ook gebruikt door Contacten in PhoneDataApps.tsx).
// Privacy: nummers en contacten worden hier alleen getoond, nooit gelogd of ergens heen gestuurd.
import React, { useEffect, useRef, useState } from 'react';
import { Phone, ChevronLeft, Trash2, Bluetooth, BluetoothOff, Settings } from 'lucide-react';
import { useUIStore, type PhoneContact } from '../uiStore';
import { useT } from '../../i18n';

const bridge = () => (window as any).PandaAndroid;

// Regel die je naar links kunt vegen; ver genoeg = verwijderen (rode achtergrond met prullenbak).
// De rode laag staat er alleen tijdens het vegen, en de regel zelf heeft een eigen dichte achtergrond
// (.phone-swipe-front, _phone-app.scss). Eerder was die doorzichtig ("inherit" van een ouder zonder achtergrond),
// waardoor elke regel rood was.
export const SwipeToDelete: React.FC<{ onDelete: () => void; onClick?: () => void; children: React.ReactNode }> = ({ onDelete, onClick, children }) => {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const LIMIT = 90;
  return (
    <div className="phone-swipe">
      {dx < 0 && (
        <div className="phone-swipe-delete">
          <Trash2 size={22} />
        </div>
      )}
      <div
        className="phone-swipe-front"
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? 'none' : 'transform 0.2s ease' }}
        onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY }; moved.current = false; }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const ddx = e.clientX - start.current.x;
          if (Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(e.clientY - start.current.y)) { moved.current = true; setDx(Math.min(0, ddx)); }
        }}
        onPointerUp={() => {
          const remove = dx < -LIMIT;
          start.current = null;
          setDx(remove ? -400 : 0);
          if (remove) window.setTimeout(onDelete, 180);
        }}
        onPointerCancel={() => { start.current = null; setDx(0); }}
        onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); e.preventDefault(); } }}
        onClick={onClick}
      >
        {children}
      </div>
    </div>
  );
};

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '#';

// Beginletter voor de alfabet-index: accenten weg (É -> E), alles wat geen letter is onder '#'
export const indexLetter = (name: string) => {
  const first = (name.trim()[0] ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
};

export const Avatar: React.FC<{ name: string; size?: 'normal' | 'large' }> = ({ name, size = 'normal' }) => (
  <div className={`call-avatar ${size === 'large' ? 'is-large' : ''}`}>{initials(name)}</div>
);

// Ronde groene belknop in een lijstregel (groot genoeg voor de vinger: 48 px)
export const CallButton: React.FC<{ onCall: () => void }> = ({ onCall }) => {
  const t = useT();
  return (
    <button className="phone-row-call" aria-label={t('Call')} onClick={(e) => { e.stopPropagation(); onCall(); }}>
      <Phone size={20} />
    </button>
  );
};

// --- Is er een telefoon verbonden? ---
// Op de radio: de Bluetooth-status van Android. Heeft Android geen Bluetooth (de radio regelt dat dan zelf in een
// eigen module), dan weten we het niet: 'unknown', en dan tonen we geen waarschuwing.
// Op laptop/Pi: het apparaat dat de PandaOS-server als verbonden meldt.
export type PhoneLink = { state: 'connected' | 'disconnected' | 'unknown'; name?: string; bluetoothOff?: boolean };
type BtDevice = { name: string; address: string; connected: boolean; phone?: boolean };
const NOT_A_PHONE = /obd|elm ?327|vlink|vgate|obdii/i;

export const usePhoneLink = (active: boolean): PhoneLink => {
  const { btDevices, btKnownDevices, btConnectedAddress } = useUIStore();
  const [android, setAndroid] = useState<PhoneLink | null>(null);

  useEffect(() => {
    const b = bridge();
    if (!active || !b?.getBluetoothState) return;
    const read = () => {
      try {
        const state = JSON.parse(b.getBluetoothState());
        if (!state?.available) { setAndroid({ state: 'unknown' }); return; }
        if (!state.enabled) { setAndroid({ state: 'disconnected', bluetoothOff: true }); return; }
        const connected: BtDevice[] = (state.devices ?? []).filter((d: BtDevice) => d.connected);
        const phone = connected.find((d) => d.phone) ?? connected.find((d) => !NOT_A_PHONE.test(d.name || ''));
        setAndroid(phone ? { state: 'connected', name: phone.name } : { state: 'disconnected' });
      } catch { setAndroid({ state: 'unknown' }); }
    };
    read();
    const timer = window.setInterval(read, 3000);
    return () => window.clearInterval(timer);
  }, [active]);

  if (android) return android;
  if (bridge()) return { state: 'unknown' };
  if (!btConnectedAddress) return { state: 'disconnected' };
  const device = [...btKnownDevices, ...btDevices].find((d) => d.address === btConnectedAddress);
  return { state: 'connected', name: device?.name };
};

// "Geen telefoon verbonden": groot in een leeg vak, of als smalle balk boven de lijsten (compact)
export const NoPhoneState: React.FC<{ link: PhoneLink; compact?: boolean }> = ({ link, compact }) => {
  const t = useT();
  const { openSettingsTab, openPanelApp } = useUIStore();
  const title = link.bluetoothOff ? t('Bluetooth is off') : t('No phone connected');

  if (compact) {
    return (
      <div className="phone-nolink-bar">
        <BluetoothOff size={20} />
        <span className="tsl-field-text">{title}</span>
        <button className="tsl-btn is-small is-primary" onClick={() => openSettingsTab('Bluetooth')}>{t('Connect')}</button>
      </div>
    );
  }

  return (
    <div className="phone-nolink">
      <div className="phone-nolink-icon">{link.bluetoothOff ? <BluetoothOff size={32} /> : <Bluetooth size={32} />}</div>
      <span className="phone-nolink-title">{title}</span>
      <p className="tsl-hint">{t('Connect your phone via Bluetooth to make calls and to see your contacts and recent calls here.')}</p>
      <div className="phone-nolink-actions">
        <button className="tsl-btn is-primary" onClick={() => openSettingsTab('Bluetooth')}>
          <Settings size={18} /> {t('Bluetooth settings')}
        </button>
        <button className="tsl-btn" onClick={() => openPanelApp('bluetooth')}>
          <Bluetooth size={18} /> {t('Bluetooth app')}
        </button>
      </div>
    </div>
  );
};

// Alfabet-index rechts naast de contactenlijst: tikken of met de vinger erlangs schuiven springt naar die letter
export const AlphaIndex: React.FC<{ letters: string[]; onPick: (letter: string) => void }> = ({ letters, onPick }) => {
  const [active, setActive] = useState<string | null>(null);
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const index = Math.floor(((e.clientY - rect.top) / rect.height) * letters.length);
    const letter = letters[Math.max(0, Math.min(letters.length - 1, index))];
    if (letter && letter !== active) { setActive(letter); onPick(letter); }
  };
  if (letters.length < 2) return null;
  return (
    <div
      className="phone-alpha"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); pick(e); }}
      onPointerMove={(e) => { if (active) pick(e); }}
      onPointerUp={() => setActive(null)}
      onPointerCancel={() => setActive(null)}
    >
      {letters.map((letter) => (
        <span key={letter} className={letter === active ? 'is-active' : ''}>{letter}</span>
      ))}
    </div>
  );
};

// Contactgegevens: naam, en per nummer een regel met belknop. Tik op het nummer = in het toetsenblok (onPickNumber).
export const ContactDetail: React.FC<{ contact: PhoneContact; onBack: () => void; onPickNumber?: (number: string) => void }> = ({ contact, onBack, onPickNumber }) => {
  const t = useT();
  const { dial } = useUIStore();
  return (
    <div className="phone-contact-detail">
      <button className="phone-back" onClick={onBack}>
        <ChevronLeft size={22} /> {t('Back')}
      </button>
      <div className="phone-contact-head">
        <Avatar name={contact.name} size="large" />
        <span className="phone-contact-name">{contact.name}</span>
      </div>
      <div className="phone-contact-numbers">
        {contact.numbers.map((n) => (
          <div key={n.number} className="phone-row" onClick={() => onPickNumber?.(n.number)}>
            <div className="phone-row-text">
              <span className="phone-row-title">{n.number}</span>
              <small className="phone-row-sub">{t(n.label)}</small>
            </div>
            <CallButton onCall={() => dial(n.number, contact.name)} />
          </div>
        ))}
      </div>
    </div>
  );
};

// Contact toevoegen: naam en nummer via het PandaOS-toetsenbord; opgeslagen in Android (op de radio)
export const AddContactForm: React.FC<{ onDone: (saved: boolean) => void }> = ({ onDone }) => {
  const t = useT();
  const { keyboardValue, openKeyboard, closeKeyboard } = useUIStore();
  const [values, setValues] = useState({ name: '', number: '' });
  const [active, setActive] = useState<'name' | 'number' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Wat je typt komt in het actieve veld
  useEffect(() => { if (active) setValues((v) => ({ ...v, [active]: keyboardValue })); }, [keyboardValue, active]);

  const focus = (field: 'name' | 'number') => { setActive(field); openKeyboard(values[field]); };
  const save = () => {
    closeKeyboard();
    if (!values.name.trim() || !values.number.trim()) { setError(t('Fill in a name and a number.')); return; }
    const ok = bridge()?.addContact?.(values.name, values.number) === true;
    if (!ok) { setError(t('Could not save. Allow PandaOS to edit contacts in Settings > Permissions.')); return; }
    onDone(true);
  };

  const field = (key: 'name' | 'number', label: string) => (
    <label className="phone-form-field">
      <span className="tsl-hint">{label}</span>
      <input className={`tsl-input ${active === key ? 'is-focused' : ''}`} readOnly value={values[key]} onFocus={() => focus(key)} />
    </label>
  );

  return (
    <div className="phone-contact-form">
      <button className="phone-back" onClick={() => { closeKeyboard(); onDone(false); }}>
        <ChevronLeft size={22} /> {t('Back')}
      </button>
      <span className="phone-contact-name">{t('New contact')}</span>
      {field('name', t('Name'))}
      {field('number', t('Phone number'))}
      {error && <small className="tsl-hint phone-form-error">{error}</small>}
      <button className="tsl-btn is-primary" style={{ alignSelf: 'flex-start' }} onClick={save}>{t('Save')}</button>
    </div>
  );
};
