// Toybox: half scherm naast de auto (zoals Theater en Arcade) met speeltjes die echt op de radio werken.
// Bovenaan het gekozen speeltje (uitleg, opties, voorbeeld); onderaan de rij met alle speeltjes.
// Geluid komt uit de speakers van de radio (Web Audio, zelf opgewekt: geen geluidsbestanden).
// Alles wat de auto zelf zou moeten doen (lampen, toeter) kan niet: PandaOS stuurt niets naar de auto.
// Voertuig en Neon veranderen alleen het 3D-model; de echte autostatus (CAN, radio) blijft ongemoeid.
import React, { useEffect, useRef, useState } from 'react';
import { X, Blocks, Rainbow, Wind, Pencil, Flame, Palette, Trash2, Play, Car, Lightbulb, DoorOpen, DoorClosed, LightbulbOff,
  Sun, SunDim, Zap, OctagonAlert, Undo2, ArrowBigLeft, ArrowBigRight, TriangleAlert, Power, Waves, Circle, Sparkles,
  PanelLeft, PanelRight, PanelTop, PanelBottom, Crosshair, Music2, CloudSunRain, Droplets, AudioLines, Rocket, TreePine,
  Activity, ArrowLeftRight, RotateCw, Minus, Plus, Hand, Ban, RefreshCw, CloudRain, Snowflake, Bug, Drum, Laugh,
  Megaphone, PartyPopper, TrendingUp, MoveVertical, Sparkle, CircleDot } from 'lucide-react';
import { useUIStore, DEFAULT_NEON, DEFAULT_LIGHT_SHOW, type ToyCar, type DoorId, type NeonSettings, type LightShowSettings,
  type WeatherFx, type RimFinish } from '../uiStore';
import { getVehicleModel } from '../../components/screen/splash-screen/configuration/vehicleModels';
import { WASH_MS } from '../../components/screen/splash-screen/configuration/toyFx';
import { ctx, noiseBuffer, playApplause, playCrickets, playDrumroll, playRimshot, playClownHorn, playAirHorn, playSlideWhistle,
  playBoing, playBoost, playWash } from './toySounds';
import { getEffectiveTheme } from '../../settings';
import Colouriser from '../../components/settings/Colouriser';
import IconTiles from '../../components/settings/IconTiles';
import { useT } from '../../i18n';
import './_theater.scss';

type ToyId = 'rainbow' | 'whoopee' | 'sketch' | 'fireplace' | 'paint' | 'vehicle' | 'neon' | 'minigun'
  | 'lightshow' | 'weather' | 'wash' | 'sounds' | 'boost' | 'holidays';

const TOYS: { id: ToyId; name: string; text: string; icon: React.ReactNode; color: string }[] = [
  { id: 'rainbow', name: 'Rainbow Floor', text: 'A rainbow glows under your car in the car view.', icon: <Rainbow size={30} />, color: '#e84393' },
  { id: 'whoopee', name: 'Whoopee Cushion', text: 'Plays a whoopee cushion sound through the speakers of the radio.', icon: <Wind size={30} />, color: '#8e6b3e' },
  { id: 'sketch', name: 'Sketchpad', text: 'Draw with your finger. Tap the bin to start over.', icon: <Pencil size={30} />, color: '#2d9cdb' },
  { id: 'fireplace', name: 'Fireplace', text: 'A crackling fire for when you are parked. Tap the fire to stop the sound.', icon: <Flame size={30} />, color: '#e67e22' },
  { id: 'paint', name: 'Paint Shop', text: 'Give your car a different colour and finish.', icon: <Palette size={30} />, color: '#6c3ce0' },
  { id: 'vehicle', name: 'Vehicle Play', text: 'Open the doors and test the lights of the 3D car. Only the picture changes, not your real car.', icon: <Car size={30} />, color: '#27ae60' },
  { id: 'neon', name: 'Neon', text: 'Neon lights under the 3D car. Choose the colour, the effect and the sides.', icon: <Lightbulb size={30} />, color: '#00b8d4' },
  { id: 'minigun', name: 'Minigun', text: 'A minigun on the roof of the 3D car. Just for fun, only in the picture.', icon: <Crosshair size={30} />, color: '#5d6d7e' },
  { id: 'lightshow', name: 'Light Show', text: 'The lights of the 3D car flash to a beat. The radio cannot hear the music, so you choose the tempo or tap along.', icon: <Music2 size={30} />, color: '#9b59b6' },
  { id: 'weather', name: 'Weather on the Car', text: 'Rain, snow or sunshine on the 3D car. Auto follows the real weather from the top bar.', icon: <CloudSunRain size={30} />, color: '#3b7dd8' },
  { id: 'wash', name: 'Car Wash', text: 'Foam over the 3D car, a rinse and a shine. Takes about 8 seconds.', icon: <Droplets size={30} />, color: '#16a085' },
  { id: 'sounds', name: 'Soundboard', text: 'Funny sounds through the speakers of the radio, made by PandaOS itself.', icon: <AudioLines size={30} />, color: '#c0392b' },
  { id: 'boost', name: 'Boost', text: 'Flames from the exhaust of the 3D car, with a boost sound.', icon: <Rocket size={30} />, color: '#d35400' },
  { id: 'holidays', name: 'Holidays', text: 'In December lights and a Santa hat on the 3D car, fireworks around New Year. You can switch it off here.', icon: <TreePine size={30} />, color: '#1e8449' },
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

// --- Lichtshow: lampen van het 3D-model op een tempo. De muziek speelt meestal buiten PandaOS (radio, telefoon),
// dus PandaOS kan de tel niet horen: je kiest het tempo zelf of tikt het mee. ---
const LightShowToy: React.FC = () => {
  const t = useT();
  const { vehicleSettings, updateVehicleSetting } = useUIStore();
  const show: LightShowSettings = { ...DEFAULT_LIGHT_SHOW, ...(vehicleSettings.lightShow ?? {}) };
  const set = (patch: Partial<LightShowSettings>) => updateVehicleSetting('lightShow', { ...show, ...patch });
  const bpm = (v: number) => set({ bpm: Math.max(60, Math.min(200, Math.round(v))) });
  const taps = useRef<number[]>([]);
  const tap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((x) => now - x < 2500), now].slice(-6);
    if (taps.current.length >= 2) {
      const gaps = taps.current.slice(1).map((x, i) => x - taps.current[i]);
      bpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
    }
  };
  return (
    <div className="toy-controls">
      <IconTiles columns={4} value={show.pattern} onChange={(id) => set({ pattern: id as LightShowSettings['pattern'], on: true })} tiles={[
        { id: 'pulse', label: t('Pulse'), icon: <Activity size={22} /> },
        { id: 'alternate', label: t('Alternate'), icon: <ArrowLeftRight size={22} /> },
        { id: 'chase', label: t('Chase'), icon: <RotateCw size={22} /> },
        { id: 'strobe', label: t('Strobe'), icon: <Zap size={22} /> },
      ]} />
      <div className="toy-sketch-tools">
        <button className="tsl-btn is-small" onClick={() => bpm(show.bpm - 5)} aria-label="-"><Minus size={16} /></button>
        <span className="tsl-field-text" style={{ minWidth: 72, textAlign: 'center' }}>{show.bpm} BPM</span>
        <button className="tsl-btn is-small" onClick={() => bpm(show.bpm + 5)} aria-label="+"><Plus size={16} /></button>
        <button className="tsl-btn is-small" onClick={tap}><Hand size={16} /> {t('Tap')}</button>
      </div>
      <label className="tsl-switch-row">
        <span className="tsl-field-text" style={{ flex: 1 }}>{t('Only while music plays')}</span>
        <input type="checkbox" className="tsl-toggle" checked={show.onlyWhilePlaying} onChange={(e) => set({ onlyWhilePlaying: e.target.checked })} />
      </label>
    </div>
  );
};

// --- Weer op de auto: uit, automatisch (echte weer) of zelf gekozen ---
const WeatherToy: React.FC = () => {
  const t = useT();
  const { vehicleSettings, updateVehicleSetting } = useUIStore();
  return (
    <div className="toy-controls">
      <IconTiles columns={3} value={vehicleSettings.weatherFx ?? 'off'} onChange={(id) => updateVehicleSetting('weatherFx', id as WeatherFx)} tiles={[
        { id: 'off', label: t('Off'), icon: <Ban size={22} /> },
        { id: 'auto', label: t('Auto'), icon: <RefreshCw size={22} /> },
        { id: 'rain', label: t('Rain'), icon: <CloudRain size={22} /> },
        { id: 'snow', label: t('Snow'), icon: <Snowflake size={22} /> },
        { id: 'sun', label: t('Sun'), icon: <Sun size={22} /> },
      ]} />
      {vehicleSettings.weatherFx === 'auto' && <small className="tsl-hint">{t('Shows nothing when it is cloudy, foggy or night, or when the weather in the top bar is off.')}</small>}
    </div>
  );
};

// --- Geluidenbord ---
const SOUNDS: { id: string; label: string; icon: React.ReactNode; play: () => void }[] = [
  { id: 'applause', label: 'Applause', icon: <Hand size={22} />, play: playApplause },
  { id: 'crickets', label: 'Crickets', icon: <Bug size={22} />, play: playCrickets },
  { id: 'drumroll', label: 'Drumroll', icon: <Drum size={22} />, play: playDrumroll },
  { id: 'rimshot', label: 'Ba-dum-tss', icon: <Laugh size={22} />, play: playRimshot },
  { id: 'clown', label: 'Clown horn', icon: <PartyPopper size={22} />, play: playClownHorn },
  { id: 'airhorn', label: 'Air horn', icon: <Megaphone size={22} />, play: playAirHorn },
  { id: 'whistle', label: 'Slide whistle', icon: <TrendingUp size={22} />, play: playSlideWhistle },
  { id: 'boing', label: 'Boing', icon: <MoveVertical size={22} />, play: playBoing },
];
const SoundboardToy: React.FC = () => {
  const t = useT();
  return (
    <div className="toy-controls">
      <IconTiles columns={4} tiles={SOUNDS.map((x) => ({ id: x.id, label: t(x.label), icon: x.icon, active: false, onClick: x.play }))} />
    </div>
  );
};

// --- Spuiterij: velgen (kleur en afwerking) en verlagen ---
const PaintShopExtras: React.FC<{ onRims: () => void }> = ({ onRims }) => {
  const t = useT();
  const { vehicleSettings, updateVehicleSetting } = useUIStore();
  // Verlagen kan alleen als het model de wielen los van de carrosserie heeft (wheelParts in vehicleModels.ts)
  const canLower = !!getVehicleModel(vehicleSettings.model).wheelParts;
  const lowered = Number(vehicleSettings.lowered) || 0;
  return (
    <div className="toy-controls">
      <button className="tsl-btn is-small" onClick={onRims}><Palette size={16} /> {t('Rim colour')}</button>
      <IconTiles columns={4} value={vehicleSettings.rimFinish ?? 'gloss'} onChange={(id) => updateVehicleSetting('rimFinish', id as RimFinish)} tiles={[
        { id: 'gloss', label: t('Gloss'), icon: <Sparkle size={22} /> },
        { id: 'satin', label: t('Satin'), icon: <CircleDot size={22} /> },
        { id: 'matte', label: t('Matte'), icon: <Circle size={22} /> },
        { id: 'chrome', label: t('Chrome'), icon: <Sparkles size={22} /> },
      ]} />
      {canLower ? (
        <label className="tsl-switch-row" style={{ gap: 10 }}>
          <span className="tsl-field-text">{t('Lowered')}</span>
          <input type="range" min={0} max={5} step={1} value={lowered} style={{ flex: 1 }}
            onChange={(e) => updateVehicleSetting('lowered', Number(e.target.value))} />
          <span className="tsl-field-text" style={{ minWidth: 44, textAlign: 'right' }}>{lowered} cm</span>
        </label>
      ) : <small className="tsl-hint">{t('This 3D model cannot be lowered.')}</small>}
    </div>
  );
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
  const [rimsOpen, setRimsOpen] = useState(false);
  const [boostSound, setBoostSound] = useState(true);
  const toyFx = useUIStore((st) => st.toyFx);
  const startToyFx = useUIStore((st) => st.startToyFx);
  // Wasstraat: knop uit zolang hij bezig is (eenmalige herteken als hij klaar is)
  const [, setTick] = useState(0);
  const washing = toyFx.wash > 0 && Date.now() - toyFx.wash < WASH_MS;
  useEffect(() => {
    if (!washing) return;
    const timer = window.setTimeout(() => setTick((x) => x + 1), toyFx.wash + WASH_MS - Date.now() + 50);
    return () => window.clearTimeout(timer);
  }, [washing, toyFx.wash]);
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
          {toy.id === 'lightshow' && (
            <label className="tsl-switch-row" style={{ alignSelf: 'stretch' }}>
              <span className="tsl-field-text" style={{ flex: 1 }}>{t('Light Show')}</span>
              <input type="checkbox" className="tsl-toggle" checked={!!vehicleSettings.lightShow?.on}
                onChange={(e) => updateVehicleSetting('lightShow', { ...DEFAULT_LIGHT_SHOW, ...(vehicleSettings.lightShow ?? {}), on: e.target.checked })} />
            </label>
          )}
          {toy.id === 'wash' && (
            <button className="arcade-play" disabled={washing} onClick={() => { startToyFx('wash'); playWash(); }}>
              <Play size={18} fill="currentColor" /> {t('Start')}
            </button>
          )}
          {toy.id === 'boost' && (
            <>
              <button className="arcade-play" onClick={() => { startToyFx('boost'); if (boostSound) playBoost(); }}><Rocket size={18} /> {t('Boost')}</button>
              <label className="tsl-switch-row" style={{ alignSelf: 'stretch' }}>
                <span className="tsl-field-text" style={{ flex: 1 }}>{t('With sound')}</span>
                <input type="checkbox" className="tsl-toggle" checked={boostSound} onChange={(e) => setBoostSound(e.target.checked)} />
              </label>
              {(vehicleSettings.exhaust ?? 'left1') === 'none' && <small className="tsl-hint">{t('Choose an exhaust in Settings > Vehicle to see the flames.')}</small>}
            </>
          )}
          {toy.id === 'holidays' && (
            <>
              <label className="tsl-switch-row" style={{ alignSelf: 'stretch' }}>
                <span className="tsl-field-text" style={{ flex: 1 }}>{t('Holidays')}</span>
                <input type="checkbox" className="tsl-toggle" checked={vehicleSettings.holidays !== false}
                  onChange={(e) => updateVehicleSetting('holidays', e.target.checked)} />
              </label>
              <small className="tsl-hint">{t('Christmas: 1 to 31 December. Fireworks: 31 December and 1 January.')}</small>
              <button className="tsl-btn is-small toy-off" onClick={() => startToyFx('holidayPreview')}><Play size={16} /> {t('Show now')}</button>
            </>
          )}
        </div>
        {toy.id === 'vehicle' && <VehiclePlay />}
        {toy.id === 'neon' && <NeonToy />}
        {toy.id === 'sketch' && <Sketchpad />}
        {toy.id === 'fireplace' && <Fireplace />}
        {toy.id === 'lightshow' && <LightShowToy />}
        {toy.id === 'weather' && <WeatherToy />}
        {toy.id === 'sounds' && <SoundboardToy />}
        {toy.id === 'paint' && <PaintShopExtras onRims={() => setRimsOpen(true)} />}
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
      {rimsOpen && <Colouriser target="rims" onClose={() => setRimsOpen(false)} />}
    </div>
  );
};

export default ToyboxApp;
