// Profielvak in de bovenbalk (zoals Tesla "Easy Entry"):
//  - toont de naam van het actieve bestuurdersprofiel;
//  - bij een wijziging in de instellingen kort "Opslaan…" (draaiend icoon) en daarna "Opgeslagen" (vinkje);
//  - een tik opent het profielmenu: profielen wisselen, bestuurder toevoegen, profielinstellingen.
// Profielen zelf staan in uiStore (driverProfiles, switchProfile ...).
import React, { useEffect, useRef, useState } from 'react';
import { User, Loader2, CheckCircle2, Check, UserPlus, Settings2, X, Trash2 } from 'lucide-react';
import { useUIStore, PROFILE_KEYS, type DriverProfile } from '../../../store/uiStore';
import { getEffectiveTheme } from '../../../settings';
import { useT } from '../../../i18n';

// Instellingen waarvan een wijziging "Opslaan… / Opgeslagen" geeft (niet volume of wat er speelt)
const WATCHED = [...PROFILE_KEYS, 'vehicleSettings', 'lightsSettings'] as const;

const ProfileStatus: React.FC = () => {
  const t = useT();
  const profiles = useUIStore((s) => s.driverProfiles);
  const activeId = useUIStore((s) => s.activeProfileId);
  const savedFlashAt = useUIStore((s) => s.savedFlashAt);
  const list: DriverProfile[] = profiles.length ? profiles : [{ id: activeId, name: t('Driver') }];
  const active = list.find((p) => p.id === activeId) ?? list[0];

  const [phase, setPhase] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timers = useRef<number[]>([]);
  const flash = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    setPhase('saving');
    timers.current = [
      window.setTimeout(() => setPhase('saved'), 700),
      window.setTimeout(() => setPhase('idle'), 2300),
    ];
  };

  // Wijzigingen volgen; de eerste seconden na de start niet (dan worden de opgeslagen instellingen geladen)
  useEffect(() => {
    const startedAt = Date.now();
    const pick = (st: any) => WATCHED.map((k) => st[k]);
    let prev = pick(useUIStore.getState());
    let lastProfile = useUIStore.getState().activeProfileId;
    const unsubscribe = useUIStore.subscribe((st) => {
      const next = pick(st);
      const changed = next.some((v, i) => v !== prev[i]);
      const switched = st.activeProfileId !== lastProfile; // wisselen van profiel is geen "opslaan"
      prev = next;
      lastProfile = st.activeProfileId;
      if (changed && !switched && Date.now() - startedAt > 4000) flash();
    });
    return () => { unsubscribe(); timers.current.forEach((id) => window.clearTimeout(id)); };
  }, []);
  // Na Klaar in het app-menu (bestaande melding)
  useEffect(() => { if (savedFlashAt) flash(); }, [savedFlashAt]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState<false | 'edit' | 'add'>(false);
  const dark = useUIStore((s) => getEffectiveTheme(s.screenMode, s.vehicleLightsOn) === 'dark');

  return (
    <>
      <button onClick={() => setMenuOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'inherit',
          font: 'inherit', padding: '4px 6px', cursor: 'pointer', minWidth: 96 }}>
        <span key={phase} className="profile-status-icon" style={{ display: 'flex' }}>
          {phase === 'saving' ? <Loader2 size={16} className="spin-animation" />
            : phase === 'saved' ? <CheckCircle2 size={16} color="#3ba55d" /> : <User size={16} />}
        </span>
        <span key={`t-${phase}`} className="profile-status-text">
          {phase === 'saving' ? t('Saving…') : phase === 'saved' ? t('Saved') : active.name}
        </span>
      </button>

      {menuOpen && (
        <div className={`tsl-ui ${dark ? 'dark-mode' : ''}`} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'transparent' }}
          onClick={() => setMenuOpen(false)}>
          <div className="profile-menu" onClick={(e) => e.stopPropagation()}>
            {list.map((p) => (
              <button key={p.id} className={`profile-menu-row ${p.id === active.id ? 'is-active' : ''}`}
                onClick={() => { useUIStore.getState().switchProfile(p.id); setMenuOpen(false); }}>
                <User size={18} /> <span style={{ flex: 1 }}>{p.name}</span>
                {p.id === active.id && <Check size={18} />}
              </button>
            ))}
            <div className="profile-menu-divider" />
            <button className="profile-menu-row" onClick={() => { setMenuOpen(false); setSettingsOpen('add'); }}>
              <UserPlus size={18} /> <span style={{ flex: 1 }}>{t('Add driver')}</span>
            </button>
            <button className="profile-menu-row" onClick={() => { setMenuOpen(false); setSettingsOpen('edit'); }}>
              <Settings2 size={18} /> <span style={{ flex: 1 }}>{t('Driver profile settings')}</span>
            </button>
          </div>
        </div>
      )}

      {settingsOpen && <ProfileSettings mode={settingsOpen} dark={dark} onClose={() => setSettingsOpen(false)} />}
    </>
  );
};

// Venster "Profielinstellingen": bestuurders links, het gekozen profiel rechts (naam, gebruiken, verwijderen), of een
// nieuwe bestuurder. Typen gaat met het PandaOS-toetsenbord (zoals het kenteken in Instellingen); zolang dat open is
// schuift het venster naar boven, zodat het toetsenbord het naamveld niet bedekt.
const ProfileSettings: React.FC<{ mode: 'edit' | 'add'; dark: boolean; onClose: () => void }> = ({ mode, dark, onClose }) => {
  const t = useT();
  const { driverProfiles, activeProfileId, renameProfile, deleteProfile, addProfile, switchProfile,
    keyboardValue, isKeyboardOpen, openKeyboard, closeKeyboard } = useUIStore();
  const list: DriverProfile[] = driverProfiles.length ? driverProfiles : [{ id: activeProfileId, name: t('Driver') }];
  const [selected, setSelected] = useState(activeProfileId);
  const current = list.find((p) => p.id === selected) ?? list[0];
  const [adding, setAdding] = useState(mode === 'add');
  const [editing, setEditing] = useState(mode === 'add'); // naamveld open
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { if (mode === 'add') openKeyboard(''); return () => closeKeyboard(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const typed = keyboardValue.slice(0, 20);
  const startEdit = (value: string) => { setEditing(true); openKeyboard(value); };
  const cancelEdit = () => { closeKeyboard(); setEditing(false); if (adding) setAdding(false); };
  const save = () => {
    const name = typed.trim();
    if (!name) return;
    closeKeyboard();
    setEditing(false);
    if (adding) { addProfile(name); onClose(); return; }
    renameProfile(current.id, name);
  };
  const pick = (id: string) => { closeKeyboard(); setEditing(false); setAdding(false); setConfirmDelete(false); setSelected(id); };
  const keyboardUp = isKeyboardOpen && editing;

  return (
    <div className={`tsl-ui ${dark ? 'dark-mode' : ''}`} style={{ position: 'fixed', inset: 0, zIndex: 310, background: 'transparent' }}>
      <div className="tsl-modal-backdrop" onClick={onClose}
        style={keyboardUp ? { alignItems: 'flex-start', paddingTop: 56 } : undefined}>
        <div className="tsl-modal" style={{ width: 700, alignItems: 'stretch', gap: 18 }} onClick={(e) => e.stopPropagation()}>
          <button className="tsl-modal-close" aria-label={t('Close')} onClick={onClose}><X size={20} /></button>
          <span className="tsl-modal-title">{t('Driver profile settings')}</span>
          <div style={{ display: 'flex', gap: 22 }}>
            {/* Bestuurders */}
            <div style={{ width: 230, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {list.map((p) => (
                <button key={p.id} className={`profile-menu-row ${!adding && p.id === selected ? 'is-active' : ''}`} onClick={() => pick(p.id)}>
                  <User size={18} /> <span style={{ flex: 1, textAlign: 'left' }}>{p.name}</span>
                  {p.id === activeProfileId && <small className="profile-badge">{t('Active')}</small>}
                </button>
              ))}
              <button className={`profile-menu-row ${adding ? 'is-active' : ''}`}
                onClick={() => { setConfirmDelete(false); setAdding(true); startEdit(''); }}>
                <UserPlus size={18} /> <span style={{ flex: 1, textAlign: 'left' }}>{t('Add driver')}</span>
              </button>
            </div>

            {/* Gekozen profiel of nieuwe bestuurder */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              <span className="tsl-hint">{adding ? t('New driver') : t('Profile name')}</span>
              {editing ? (
                <>
                  {/* Naamveld: toont wat op het PandaOS-toetsenbord getypt wordt, met een knipperende cursor */}
                  <div className="profile-name-input" onClick={() => openKeyboard(typed)}>
                    {typed ? <span>{typed}</span> : <span className="profile-name-placeholder">{t('Name')}</span>}
                    <span className="profile-name-caret" />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="tsl-btn" onClick={cancelEdit}>{t('Cancel')}</button>
                    <button className="tsl-btn is-primary" disabled={!typed.trim()} onClick={save}>{t(adding ? 'Add' : 'Save')}</button>
                  </div>
                  <small className="tsl-hint">
                    {adding ? t('The new driver starts with the current settings. Adjust them afterwards.') : t('Maximum 20 characters.')}
                  </small>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="profile-name-big">{current.name}</span>
                    <button className="tsl-btn is-small" onClick={() => startEdit(current.name)}>{t('Change name')}</button>
                  </div>
                  <small className="tsl-hint">
                    {t('Each driver has their own display, navigation, sound, safety and app settings and dock. The car itself is shared.')}
                  </small>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {current.id !== activeProfileId && (
                      <button className="tsl-btn is-primary" onClick={() => { switchProfile(current.id); onClose(); }}>{t('Use this profile')}</button>
                    )}
                    {list.length > 1 && (confirmDelete ? (
                      <>
                        <button className="tsl-btn" onClick={() => setConfirmDelete(false)}>{t('Cancel')}</button>
                        <button className="tsl-btn" style={{ color: 'var(--tsl-red)' }}
                          onClick={() => { deleteProfile(current.id); setConfirmDelete(false); setSelected(useUIStore.getState().activeProfileId); }}>
                          <Trash2 size={16} /> {t('Really delete?')}
                        </button>
                      </>
                    ) : (
                      <button className="tsl-btn" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> {t('Delete profile')}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileStatus;
