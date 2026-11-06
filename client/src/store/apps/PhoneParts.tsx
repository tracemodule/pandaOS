// Onderdelen voor Telefoon en Contacten: veeg-om-te-verwijderen, contactgegevens en contact toevoegen.
import React, { useEffect, useRef, useState } from 'react';
import { Phone, ChevronLeft, Trash2 } from 'lucide-react';
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
          <Trash2 size={20} />
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

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

// Contactgegevens: naam, en per nummer een belknop
export const ContactDetail: React.FC<{ contact: PhoneContact; onBack: () => void }> = ({ contact, onBack }) => {
  const t = useT();
  const { dial } = useUIStore();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button className="tsl-btn is-small" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4 }} onClick={onBack}>
        <ChevronLeft size={16} /> {t('Back')}
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div className="call-avatar" style={{ width: 72, height: 72, fontSize: 26 }}>{initials(contact.name)}</div>
        <span className="tsl-field-text" style={{ fontSize: 'calc(20px * var(--text-scale, 1))' }}>{contact.name}</span>
      </div>
      <div className="tsl-list">
        {contact.numbers.map((n) => (
          <div key={n.number} className="tsl-list-row" style={{ alignItems: 'center' }}>
            <div className="tsl-list-text" style={{ flex: 1 }}>
              <span className="tsl-field-text">{n.number}</span>
              <small className="tsl-hint">{t(n.label)}</small>
            </div>
            <button className="tsl-btn is-small is-success" aria-label={t('Call')} onClick={() => dial(n.number, contact.name)}>
              <Phone size={18} color="#ffffff" />
            </button>
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
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="tsl-title">{label}</span>
      <input className="tsl-input" readOnly value={values[key]} onFocus={() => focus(key)}
        style={{ outline: active === key ? '2px solid #3e6ae1' : undefined }} />
    </label>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <button className="tsl-btn is-small" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4 }}
        onClick={() => { closeKeyboard(); onDone(false); }}>
        <ChevronLeft size={16} /> {t('Back')}
      </button>
      <span className="tsl-field-text">{t('New contact')}</span>
      {field('name', t('Name'))}
      {field('number', t('Phone number'))}
      {error && <small className="tsl-hint" style={{ color: '#e04e3b' }}>{error}</small>}
      <button className="tsl-btn is-primary" style={{ alignSelf: 'flex-start' }} onClick={save}>{t('Save')}</button>
    </div>
  );
};
