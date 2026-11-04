import React, { useEffect, useState } from 'react';
import VolkswagenIcon from '../../settings/control-bar/VolkswagenIcon';
import { startPreload, useBootStatus } from '../../../services/preload';
import './_boot-screen.scss';

// Opstartscherm: zwart met het Volkswagen-logo dat in-fadet, even blijft staan en daarna wegfadet naar PandaOS.
// Alleen bij het starten van PandaOS (op de radio: direct na de Android-bootanimatie, als launcher).
// Ondertussen worden de app-pictogrammen en het 3D-model alvast geladen (services/preload.ts); het logo gaat pas
// weg als dat klaar is: minstens MIN_SHOW_MS, hooguit MAX_SHOW_MS (als er iets hapert, start PandaOS toch).
const MIN_SHOW_MS = 2000;
const MAX_SHOW_MS = 8000;
const FADE_MS = 700;

// Zo vroeg mogelijk beginnen: al bij het laden van dit bestand, vóór de eerste render
startPreload();

const BootScreen: React.FC = () => {
  const [phase, setPhase] = useState<'in' | 'out' | 'done'>('in');
  const [minTimePassed, setMinTimePassed] = useState(false);
  const [maxTimePassed, setMaxTimePassed] = useState(false);
  const { iconsReady, carReady } = useBootStatus();

  useEffect(() => {
    const min = window.setTimeout(() => setMinTimePassed(true), MIN_SHOW_MS);
    const max = window.setTimeout(() => setMaxTimePassed(true), MAX_SHOW_MS);
    return () => {
      window.clearTimeout(min);
      window.clearTimeout(max);
    };
  }, []);

  const ready = (minTimePassed && iconsReady && carReady) || maxTimePassed;
  useEffect(() => {
    if (ready && phase === 'in') setPhase('out');
  }, [ready, phase]);
  // Na het wegfaden helemaal weg
  useEffect(() => {
    if (phase !== 'out') return;
    const remove = window.setTimeout(() => setPhase('done'), FADE_MS);
    return () => window.clearTimeout(remove);
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div className={`boot-screen ${phase === 'out' ? 'is-leaving' : ''}`}>
      <div className="boot-logo">
        <VolkswagenIcon size={160} strokeWidth={1.1} />
      </div>
    </div>
  );
};

export default BootScreen;
