// Toybox: half scherm naast de auto (zoals Theater en Arcade) met speeltjes die echt op de radio werken.
// Bovenaan het gekozen speeltje (uitleg, opties, voorbeeld); onderaan de rij met alle speeltjes.
// Geluid komt uit de speakers van de radio (Web Audio, zelf opgewekt: geen geluidsbestanden).
// Alles wat de auto zelf zou moeten doen (lampen, toeter) kan niet: PandaOS stuurt niets naar de auto.
// Voertuig en Neon veranderen alleen het 3D-model; de echte autostatus (CAN, radio) blijft ongemoeid.
import React, { useEffect, useRef, useState } from 'react';
import { X, Blocks, Rainbow, Wind, Pencil, Flame, Palette, Trash2, Play, Car, Lightbulb, DoorOpen, DoorClosed, LightbulbOff,
  Sun, SunDim, Zap, OctagonAlert, Undo2, ArrowBigLeft, ArrowBigRight, TriangleAlert, Power, Waves, Circle, Sparkles,
  PanelLeft, PanelRight, PanelTop, PanelBottom, Crosshair } from 'lucide-react';
import { useUIStore, DEFAULT_NEON, type ToyCar, type DoorId, type NeonSettings } from '../uiStore';
import { getEffectiveTheme } from '../../settings';
import Colouriser from '../../components/settings/Colouriser';
import IconTiles from '../../components/settings/IconTiles';
import { useT } from '../../i18n';
import './_theater.scss';

type ToyId = 'rainbow' | 'whoopee' | 'sketch' | 'fireplace' | 'paint' | 'vehicle' | 'neon' | 'minigun';

const TOYS: { id: ToyId; name: string; text: string; icon: React.ReactNode; color: string }[] = [
  { id: 'rainbow', name: 'Rainbow Floor', text: 'A rainbow glows under your car in the car view.', icon: <Rainbow size={30} />, color: '#e84393' },
  { id: 'whoopee', name: 'Whoopee Cushion', text: 'Plays a whoopee cushion sound through the speakers of the radio.', icon: <Wind size={30} />, color: '#8e6b3e' },
  { id: 'sketch', name: 'Sketchpad', text: 'Draw with your finger. Tap the bin to start over.', icon: <Pencil size={30} />, color: '#2d9cdb' },
  { id: 'fireplace', name: 'Fireplace', text: 'A crackling fire for when you are parked. Tap the fire to stop the sound.', icon: <Flame size={30} />, color: '#e67e22' },
  { id: 'paint', name: 'Paint Shop', text: 'Give your car a different colour and finish.', icon: <Palette size={30} />, color: '#6c3ce0' },
  { id: 'vehicle', name: 'Vehicle Play', text: 'Open the doors and test the lights of the 3D car. Only the picture changes, not your real car.', icon: <Car size={30} />, color: '#27ae60' },
  { id: 'neon', name: 'Neon', text: 'Neon lights under the 3D car. Choose the colour, the effect and the sides.', icon: <Lightbulb size={30} />, color: '#00b8d4' },
  { id: 'minigun', name: 'Minigun', text: 'A minigun on the roof of the 3D car. Just for fun, only in the picture.', icon: <Crosshair size={30} />, color: '#5d6d7e' },
];

// --- Voertuig: deuren en lampen van het 3D-model (alleen het plaatje) ---
// Vakken zoals in Instellingen > Voertuig (IconTiles): icoon boven de tekst
const VehiclePlay: React.FC = () => {
  const t = useT();
  const { toyCar, setToyCar, carState } = useUIStore();
  // Bij het openen: beginnen bij de stand van de auto
  useEffect(() => {
    if (!useUIStore.getState().toyCar) {
      setToyCar({ lights: carState.lights, highBeam: carState.highBeam, blinker: carState.blinker, brake: false, reverse: false,
        doors: { ...carState.doors } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!toyCar) return null;
  const set = (patch: Partial<ToyCar>) => setToyCar({ ...toyCar, ...patch });
  const door = (id: DoorId, label: string) => ({
    id, label: t(label), active: toyCar.doors[id], icon: toyCar.doors[id] ? <DoorOpen size={22} /> : <DoorClosed size={22} />,
    onClick: () => set({ doors: { ...toyCar.doors, [id]: !toyCar.doors[id] } }),
  });
  const blinker = (id: ToyCar['blinker'], label: string, icon: React.ReactNode) => ({
    id, label: t(label), icon, active: toyCar.blinker === id, onClick: () => set({ blinker: toyCar.blinker === id ? 'off' : id }),
  });
  return (
    <div className="toy-controls">
      <IconTiles columns={4} tiles={[door('fl', 'Front left'), door('fr', 'Front right'), door('rl', 'Rear left'), door('rr', 'Rear right')]} />
      <IconTiles columns={4} tiles={[
        { id: 'off', label: t('Off'), icon: <LightbulbOff size={22} />, active: toyCar.lights === 'off', onClick: () => set({ lights: 'off' }) },
        { id: 'parking', label: t('Parking lights'), icon: <SunDim size={22} />, active: toyCar.lights === 'parking', onClick: () => set({ lights: 'parking' }) },
        { id: 'low', label: t('Dipped beam'), icon: <Sun size={22} />, active: toyCar.lights === 'low', onClick: () => set({ lights: 'low' }) },
        { id: 'high', label: t('High beam'), icon: <Zap size={22} />, active: toyCar.highBeam, onClick: () => set({ highBeam: !toyCar.highBeam }) },
      ]} />
      <IconTiles columns={5} tiles={[
        blinker('left', 'Indicator left', <ArrowBigLeft size={22} />),
        blinker('right', 'Indicator right', <ArrowBigRight size={22} />),
        blinker('hazard', 'Hazard lights', <TriangleAlert size={22} />),
        { id: 'brake', label: t('Brake light'), icon: <OctagonAlert size={22} />, active: toyCar.brake, onClick: () => set({ brake: !toyCar.brake }) },
        { id: 'reverse', label: t('Reverse light'), icon: <Undo2 size={22} />, active: toyCar.reverse, onClick: () => set({ reverse: !toyCar.reverse }) },
      ]} />
    </div>
  );
};

// --- Neon onder de auto ---
const NEON_COLORS = ['#00e5ff', '#2d6bff', '#a020f0', '#ff2d95', '#ff1f1f', '#ff8c00', '#ffe600', '#25ff6a', '#ffffff'];
const NeonToy: React.FC = () => {
  const t = useT();
  const { vehicleSettings, updateVehicleSetting } = useUIStore();
  const neon: NeonSettings = { ...DEFAULT_NEON, ...(vehicleSettings.neon ?? {}) };
  const set = (patch: Partial<NeonSettings>) => updateVehicleSetting('neon', { ...neon, ...patch });
  const side = (id: keyof NeonSettings['sides'], label: string, icon: React.ReactNode) => ({
    id, label: t(label), icon, active: neon.sides[id], onClick: () => set({ sides: { ...neon.sides, [id]: !neon.sides[id] } }),
  });
  return (
    <div className="toy-controls">
      <div className="toy-sketch-tools" style={{ flexWrap: 'wrap' }}>
        {NEON_COLORS.map((c) => (
          <button key={c} className={`toy-swatch ${c === neon.color ? 'is-active' : ''}`} style={{ background: c }} onClick={() => set({ color: c, on: true })} aria-label={c} />
        ))}
      </div>
      <IconTiles columns={3} value={neon.effect} onChange={(id) => set({ effect: id as NeonSettings['effect'] })} tiles={[
        { id: 'steady', label: t('Steady'), icon: <Circle size={24} /> },
        { id: 'pulse', label: t('Pulse'), icon: <Waves size={24} /> },
        { id: 'rainbow', label: t('Rainbow'), icon: <Sparkles size={24} /> },
      ]} />
      <IconTiles columns={4} tiles={[
        side('left', 'Left', <PanelLeft size={24} />), side('right', 'Right', <PanelRight size={24} />),
        side('front', 'Front', <PanelTop size={24} />), side('rear', 'Rear', <PanelBottom size={24} />),
      ]} />
    </div>
  );
};

// --- Geluid: één AudioContext voor alle speeltjes ---
let audio: AudioContext | null = null;
const ctx = () => (audio ??= new (window.AudioContext || (window as any).webkitAudioContext)());

const noiseBuffer = (ac: AudioContext, seconds: number) => {
  const buffer = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; data[i] = last * 3.5; } // bruine ruis
  return buffer;
};

// Scheetkussen: lage zaagtand met trillende toonhoogte plus ruis, door een laagdoorlaatfilter
const playWhoopee = (kind: 'short' | 'long' | 'rumble') => {
  const ac = ctx();
  const now = ac.currentTime;
  const length = kind === 'short' ? 0.45 : kind === 'long' ? 1.4 : 2.2;
  const base = kind === 'rumble' ? 55 : 95;
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.exponentialRampToValueAtTime(0.9, now + 0.04);
  out.gain.setValueAtTime(0.9, now + length * 0.7);
  out.gain.exponentialRampToValueAtTime(0.0001, now + length);
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = kind === 'rumble' ? 500 : 900;
  filter.Q.value = 6;
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(base * 1.3, now);
  osc.frequency.exponentialRampToValueAtTime(base * 0.7, now + length);
  const wobble = ac.createOscillator();
  const wobbleDepth = ac.createGain();
  wobble.frequency.value = kind === 'rumble' ? 9 : 22;
  wobbleDepth.gain.value = base * 0.35;
  wobble.connect(wobbleDepth).connect(osc.frequency);
  const noise = ac.createBufferSource();
  noise.buffer = noiseBuffer(ac, length);
  const noiseGain = ac.createGain();
  noiseGain.gain.value = 0.5;
  osc.connect(filter);
  noise.connect(noiseGain).connect(filter);
  filter.connect(out).connect(ac.destination);
  [osc, wobble, noise].forEach((n) => { n.start(now); n.stop(now + length + 0.05); });
};

// Knetterend vuur: zachte ruis met af en toe een knapje; geeft een stopfunctie terug
const startCrackle = () => {
  const ac = ctx();
  const bed = ac.createBufferSource();
  bed.buffer = noiseBuffer(ac, 4);
  bed.loop = true;
  const bedFilter = ac.createBiquadFilter();
  bedFilter.type = 'lowpass';
  bedFilter.frequency.value = 600;
  const bedGain = ac.createGain();
  bedGain.gain.value = 0.25;
  bed.connect(bedFilter).connect(bedGain).connect(ac.destination);
  bed.start();
  const timer = setInterval(() => {
    if (Math.random() > 0.55) return;
    const t = ac.currentTime;
    const pop = ac.createBufferSource();
    pop.buffer = noiseBuffer(ac, 0.05);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1500 + Math.random() * 3000;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.4 + Math.random() * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    pop.connect(hp).connect(g).connect(ac.destination);
    pop.start(t);
  }, 140);
  return () => { clearInterval(timer); try { bed.stop(); } catch { /* al gestopt */ } };
};

// --- Tekenblok ---
const Sketchpad: React.FC = () => {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState('#ed4e3b');
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const draw = (e: React.PointerEvent) => {
    if (!last.current) return;
    const c = canvasRef.current!.getContext('2d')!;
    const p = point(e);
    c.strokeStyle = color;
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(last.current.x, last.current.y);
    c.lineTo(p.x, p.y);
    c.stroke();
    last.current = p;
  };

  return (
    <div className="toy-sketch">
      <canvas ref={canvasRef} style={{ touchAction: 'none' }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); last.current = point(e); }}
        onPointerMove={draw} onPointerUp={() => { last.current = null; }} onPointerCancel={() => { last.current = null; }} />
      <div className="toy-sketch-tools">
        {['#ed4e3b', '#f5a623', '#25cb55', '#2d9cdb', '#6c3ce0', '#171717', '#ffffff'].map((c) => (
          <button key={c} className={`toy-swatch ${c === color ? 'is-active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
        ))}
        <button className="theater-close" onClick={() => {
          const canvas = canvasRef.current!;
          canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
        }} aria-label={t('Clear')}><Trash2 size={18} /></button>
      </div>
    </div>
  );
};

// --- Haardvuur: vlammen op een canvas, met knetterend geluid ---
const Fireplace: React.FC = () => {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sound, setSound] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const c = canvas.getContext('2d')!;
    type Flame = { x: number; y: number; r: number; life: number; speed: number };
    let flames: Flame[] = [];
    let frame = 0;
    const tick = () => {
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = 'rgba(20, 8, 2, 0.35)';
      c.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 6; i++) {
        flames.push({ x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.5, y: canvas.height - 10,
          r: 14 + Math.random() * 18, life: 1, speed: 2 + Math.random() * 2.5 });
      }
      c.globalCompositeOperation = 'lighter';
      flames = flames.filter((f) => f.life > 0);
      for (const f of flames) {
        f.y -= f.speed;
        f.x += (canvas.width / 2 - f.x) * 0.012 + (Math.random() - 0.5) * 1.2;
        f.life -= 0.014;
        f.r *= 0.985;
        const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, `rgba(255, ${180 + Math.round(60 * f.life)}, 80, ${0.5 * f.life})`);
        g.addColorStop(1, 'rgba(255, 60, 0, 0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        c.fill();
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => (sound ? startCrackle() : undefined), [sound]);

  return (
    <div className="toy-fire" onClick={() => setSound(!sound)}>
      <canvas ref={canvasRef} />
      <small>{sound ? t('Tap to mute') : t('Tap for sound')}</small>
    </div>
  );
};

const ToyboxApp: React.FC = () => {
  const t = useT();
  const { isToyboxOpen, closeToybox, screenMode, vehicleLightsOn, vehicleSettings, updateVehicleSetting } = useUIStore();
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const [toyId, setToyId] = useState<ToyId>('rainbow');
  const [whoopee, setWhoopee] = useState<'short' | 'long' | 'rumble'>('short');
  const [paintOpen, setPaintOpen] = useState(false);
  const setToyCar = useUIStore((st) => st.setToyCar);
  // Voertuig-speeltje alleen zolang het gekozen is en Toybox open staat; daarna volgt het model de auto weer
  useEffect(() => { if (!isToyboxOpen || toyId !== 'vehicle') setToyCar(null); }, [isToyboxOpen, toyId, setToyCar]);

  if (!isToyboxOpen) return null;
  const toy = TOYS.find((x) => x.id === toyId)!;

  return (
    <div className={`theater-app toybox-app tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="theater-head">
        <div className="theater-title"><Blocks size={22} /><span>{t('Toybox')}</span></div>
        <button className="theater-close" onClick={closeToybox} aria-label={t('Close')}><X size={22} /></button>
      </div>

      <div className="toy-hero">
        <div className="toy-hero-text">
          <span className="arcade-hero-name">{t(toy.name)}</span>
          <small className="tsl-hint">{t(toy.text)}</small>

          {toy.id === 'rainbow' && (
            <label className="tsl-switch-row">
              <span className="tsl-field-text" style={{ flex: 1 }}>{t('Rainbow Floor')}</span>
              <input type="checkbox" className="tsl-toggle" checked={!!vehicleSettings.rainbowFloor}
                onChange={(e) => updateVehicleSetting('rainbowFloor', e.target.checked)} />
            </label>
          )}
          {toy.id === 'whoopee' && (
            <>
              <div className="tsl-segmented">
                {(['short', 'long', 'rumble'] as const).map((k) => (
                  <button key={k} className={whoopee === k ? 'is-active' : ''} onClick={() => setWhoopee(k)}>
                    {t(k === 'short' ? 'Short' : k === 'long' ? 'Long' : 'Rumble')}
                  </button>
                ))}
              </div>
              <button className="arcade-play" onClick={() => playWhoopee(whoopee)}><Play size={18} fill="currentColor" /> {t('Play')}</button>
            </>
          )}
          {toy.id === 'vehicle' && (
            <>
              <small className="tsl-hint">{t('The tailgate cannot open in this 3D model.')}</small>
              <button className="tsl-btn is-small toy-off" onClick={() => useUIStore.getState().setToyCar({ lights: 'off', highBeam: false, blinker: 'off',
                brake: false, reverse: false, doors: { fl: false, fr: false, rl: false, rr: false, trunk: false } })}><Power size={16} /> {t('Everything off')}</button>
            </>
          )}
          {toy.id === 'neon' && (
            <label className="tsl-switch-row" style={{ alignSelf: 'stretch' }}>
              <span className="tsl-field-text" style={{ flex: 1 }}>{t('Neon')}</span>
              <input type="checkbox" className="tsl-toggle" checked={!!vehicleSettings.neon?.on}
                onChange={(e) => updateVehicleSetting('neon', { ...DEFAULT_NEON, ...(vehicleSettings.neon ?? {}), on: e.target.checked })} />
            </label>
          )}
          {toy.id === 'minigun' && (
            <label className="tsl-switch-row" style={{ alignSelf: 'stretch' }}>
              <span className="tsl-field-text" style={{ flex: 1 }}>{t('Minigun')}</span>
              <input type="checkbox" className="tsl-toggle" checked={!!vehicleSettings.minigun}
                onChange={(e) => updateVehicleSetting('minigun', e.target.checked)} />
            </label>
          )}
          {toy.id === 'paint' && (
            <button className="arcade-play" onClick={() => setPaintOpen(true)}><Palette size={18} /> {t('Colouriser')}</button>
          )}
        </div>
        {toy.id === 'vehicle' && <VehiclePlay />}
        {toy.id === 'neon' && <NeonToy />}
        {toy.id === 'sketch' && <Sketchpad />}
        {toy.id === 'fireplace' && <Fireplace />}
      </div>

      <div className="arcade-row">
        {TOYS.map((x) => (
          <button key={x.id} className={`arcade-tile ${x.id === toyId ? 'is-selected' : ''}`} onClick={() => setToyId(x.id)}>
            <span className="toy-icon" style={{ background: x.color }}>{x.icon}</span>
            <span>{t(x.name)}</span>
          </button>
        ))}
      </div>

      {paintOpen && <Colouriser onClose={() => setPaintOpen(false)} />}
    </div>
  );
};

export default ToyboxApp;
