// Release notes, handleiding en "Leer PandaOS kennen" (zoals Tesla, video 36:12): over de hele Instellingen-pagina.
// Bovenaan de tabbladen, links de onderwerpen (bij release notes per versie), rechts de uitleg van het gekozen onderwerp.
import React, { useState } from 'react';
import { X, BookOpen, Route, Home, Columns2, Volume2, PanelTop, Phone, LayoutGrid, Cctv, ShieldCheck, SlidersHorizontal,
  Camera, Radio, Clapperboard, Car, Clock, Download } from 'lucide-react';
import { RELEASE_NOTES, MANUAL, GET_TO_KNOW, type NoteItem } from '../../data/releaseNotes';
import { useT } from '../../i18n';

const ICONS: Record<string, React.ReactNode> = {
  route: <Route size={20} />, home: <Home size={20} />, half: <Columns2 size={20} />, volume: <Volume2 size={20} />,
  menu: <PanelTop size={20} />, phone: <Phone size={20} />, dock: <LayoutGrid size={20} />, camera: <Cctv size={20} />,
  shield: <ShieldCheck size={20} />, view: <SlidersHorizontal size={20} />, radio: <Radio size={20} />,
  theater: <Clapperboard size={20} />, car: <Car size={20} />, clock: <Clock size={20} />, update: <Download size={20} />,
};
const bigIcon = (icon: string) => React.cloneElement(ICONS[icon] as React.ReactElement<{ size?: number }>, { size: 44 });
void Camera;

type Tab = 'know' | 'manual' | 'notes';

const ReleaseNotes: React.FC<{ onClose: () => void; startTab?: Tab }> = ({ onClose, startTab = 'notes' }) => {
  const t = useT();
  const [tab, setTab] = useState<Tab>(startTab);
  const [selected, setSelected] = useState(0);

  // Onderwerpen van het gekozen tabblad (release notes: alle versies onder elkaar, met de versie als kopje)
  const groups: { heading?: string; items: NoteItem[] }[] = tab === 'notes'
    ? RELEASE_NOTES.map((v) => ({ heading: `PandaOS ${v.version}`, items: v.items }))
    : [{ items: tab === 'manual' ? MANUAL : GET_TO_KNOW }];
  const flat = groups.flatMap((g) => g.items);
  const item = flat[Math.min(selected, flat.length - 1)];

  let index = -1;
  return (
    <div className="release-notes" onClick={(e) => e.stopPropagation()}>
      <header className="release-notes-head">
        <div className="release-notes-title"><BookOpen size={20} /> {t('Manual (guide)')}</div>
        <nav>
          {([['know', 'Get to know PandaOS'], ['manual', 'Manual (guide)'], ['notes', 'Release notes']] as const).map(([id, label]) => (
            <button key={id} className={tab === id ? 'is-active' : ''} onClick={() => { setTab(id); setSelected(0); }}>{t(label)}</button>
          ))}
        </nav>
        <button className="release-notes-close" aria-label={t('Close')} onClick={onClose}><X size={22} /></button>
      </header>
      <div className="release-notes-body">
        <aside>
          {groups.map((group, gi) => (
            <React.Fragment key={gi}>
              {group.heading && <div className="release-notes-version">{group.heading}</div>}
              {group.items.map((it) => {
                index += 1;
                const i = index;
                return (
                  <button key={`${gi}-${it.title}`} className={i === selected ? 'is-active' : ''} onClick={() => setSelected(i)}>
                    {ICONS[it.icon]} <span>{it.title}</span>
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </aside>
        {item && (
          <article>
            <div className="release-notes-art">{bigIcon(item.icon)}</div>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        )}
      </div>
    </div>
  );
};

export default ReleaseNotes;
