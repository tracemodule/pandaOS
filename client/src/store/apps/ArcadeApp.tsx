// Arcade: half scherm naast de auto (zoals Theater) met alle games die op de radio staan.
// Bovenaan het gekozen spel groot met een knop Spelen; eronder een rij met alle games en "Meer games" (Play Store).
// Games = apps die Android als spel kent (PandaBridge.getInstalledGames). Openen schuift van onder naar boven.
import React, { useEffect, useState } from 'react';
import { X, Gamepad2, Play, Plus } from 'lucide-react';
import { useUIStore } from '../uiStore';
import { getAndroidAppIcon, isAndroidLauncher } from '../appLinks';
import { useT } from '../../i18n';
import { getEffectiveTheme } from '../../settings';
import './_theater.scss';

type Game = { package: string; name: string };

const bridge = () => (window as any).PandaAndroid;
const STORAGE_KEY = 'pandaos-arcade-last'; // laatst gespeelde spel staat bovenaan

const readGames = (): Game[] => {
  try { return JSON.parse(bridge()?.getInstalledGames?.() ?? '[]'); } catch { return []; }
};

const ArcadeApp: React.FC = () => {
  const t = useT();
  const { isArcadeOpen, closeArcade, screenMode, vehicleLightsOn } = useUIStore();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const [games, setGames] = useState<Game[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  // Lijst bij openen en na terugkomen (nieuw spel geïnstalleerd)
  useEffect(() => {
    if (!isArcadeOpen) return;
    const update = () => {
      if (document.visibilityState !== 'visible') return;
      const list = readGames();
      setGames(list);
      setSelected((current) => {
        if (current && list.some((g) => g.package === current)) return current;
        const last = localStorage.getItem(STORAGE_KEY);
        return list.find((g) => g.package === last)?.package ?? list[0]?.package ?? null;
      });
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [isArcadeOpen]);

  if (!isArcadeOpen) return null;

  const game = games.find((g) => g.package === selected) ?? null;
  const play = (g: Game) => {
    localStorage.setItem(STORAGE_KEY, g.package);
    const ok = bridge()?.launchAppSlideUp?.(g.package) ?? bridge()?.launchApp?.(g.package);
    if (ok === false) bridge()?.openPlayStore?.(g.package);
  };
  const moreGames = () => bridge()?.openPlayStoreSearch?.('games');

  return (
    <div className={`theater-app arcade-app tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="theater-head">
        <div className="theater-title"><Gamepad2 size={22} /><span>{t('Arcade')}</span></div>
        <button className="theater-close" onClick={closeArcade} aria-label={t('Close')}><X size={22} /></button>
      </div>

      {game ? (
        <div className="arcade-hero">
          <img src={getAndroidAppIcon(game.package)} alt="" />
          <div className="arcade-hero-text">
            <span className="arcade-hero-name">{game.name}</span>
            <button className="arcade-play" onClick={() => play(game)}><Play size={18} fill="currentColor" /> {t('Play')}</button>
          </div>
        </div>
      ) : (
        <div className="arcade-empty">
          <Gamepad2 size={40} />
          <span>{isAndroidLauncher() ? t('No games on the radio yet.') : t('Arcade only works on the radio.')}</span>
          {isAndroidLauncher() && <button className="arcade-play" onClick={moreGames}><Plus size={18} /> {t('Find games in the Play Store')}</button>}
        </div>
      )}

      {games.length > 0 && (
        <div className="arcade-row">
          {games.map((g) => (
            <button key={g.package} className={`arcade-tile ${g.package === selected ? 'is-selected' : ''}`}
              onClick={() => (g.package === selected ? play(g) : setSelected(g.package))}>
              <img src={getAndroidAppIcon(g.package)} alt="" />
              <span>{g.name}</span>
            </button>
          ))}
          <button className="arcade-tile is-more" onClick={moreGames}>
            <Plus size={30} />
            <span>{t('More games')}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ArcadeApp;
