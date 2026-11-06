// Toybox-geluiden: zelf opgewekt met Web Audio (geen geluidsbestanden, geen bestaande melodieën).
// Eén AudioContext voor alle speeltjes. Geluiden met veel losse tikjes (applaus, krekels, trommels) worden in één
// keer in een buffer uitgerekend en als één bron afgespeeld: dat is lichter voor de radio dan honderden losse nodes.

let audio: AudioContext | null = null;
export const ctx = () => {
  audio ??= new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audio.state === 'suspended') audio.resume().catch(() => { /* geen geluid mogelijk */ });
  return audio;
};

// Bruine ruis (zacht, voor scheetkussen en vuur)
export const noiseBuffer = (ac: AudioContext, seconds: number) => {
  const buffer = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; data[i] = last * 3.5; } // bruine ruis
  return buffer;
};

// Witte ruis
const whiteBuffer = (ac: AudioContext, seconds: number) => {
  const buffer = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * seconds)), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
};

// Buffer zelf vullen en afspelen (optioneel door een filter)
const playRendered = (seconds: number, fill: (data: Float32Array, rate: number) => void, volume = 0.8,
  filter?: { type: BiquadFilterType; frequency: number; Q?: number }) => {
  const ac = ctx();
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const data = buffer.getChannelData(0);
  fill(data, ac.sampleRate);
  // Begrenzen, zodat het nooit kraakt
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 1) for (let i = 0; i < data.length; i++) data[i] /= peak;
  const source = ac.createBufferSource();
  source.buffer = buffer;
  const gain = ac.createGain();
  gain.gain.value = volume;
  if (filter) {
    const f = ac.createBiquadFilter();
    f.type = filter.type; f.frequency.value = filter.frequency; f.Q.value = filter.Q ?? 0.7;
    source.connect(f).connect(gain);
  } else source.connect(gain);
  gain.connect(ac.destination);
  source.start();
};

// Kort geruisje met snelle uitsterving op plek `at` (seconden) in data
const burst = (data: Float32Array, rate: number, at: number, length: number, decay: number, amp: number) => {
  const start = Math.floor(at * rate);
  const n = Math.floor(length * rate);
  for (let i = 0; i < n && start + i < data.length; i++) data[start + i] += amp * (Math.random() * 2 - 1) * Math.exp(-i / (decay * rate));
};

// Toon met dalende toonhoogte (trommel): sinus van f0 naar f1
const tom = (data: Float32Array, rate: number, at: number, f0: number, f1: number, length: number, amp: number) => {
  const start = Math.floor(at * rate);
  const n = Math.floor(length * rate);
  let phase = 0;
  for (let i = 0; i < n && start + i < data.length; i++) {
    const k = i / n;
    phase += (2 * Math.PI * (f0 + (f1 - f0) * k)) / rate;
    data[start + i] += amp * Math.sin(phase) * Math.exp(-k * 5);
  }
};

// Bekken: ruis met veel hoog, plus een paar metalige blokgolven die niet bij elkaar passen
const cymbal = (data: Float32Array, rate: number, at: number, length: number, amp: number) => {
  const start = Math.floor(at * rate);
  const n = Math.floor(length * rate);
  const freqs = [3150, 4120, 5270, 6830];
  let prev = 0;
  for (let i = 0; i < n && start + i < data.length; i++) {
    const t = i / rate;
    const white = Math.random() * 2 - 1;
    const hiss = white - prev; // eerste verschil: alleen het hoge deel
    prev = white;
    let ring = 0;
    for (const f of freqs) ring += Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.08;
    data[start + i] += amp * (hiss * 0.6 + ring) * Math.exp(-t / (length * 0.3));
  }
};

export const playApplause = () => playRendered(3.4, (data, rate) => {
  // ~25 mensen die klappen: dichtheid snel omhoog, daarna langzaam uitsterven
  for (let p = 0; p < 25; p++) {
    let t = Math.random() * 0.25;
    const interval = 0.18 + Math.random() * 0.12;
    const amp = 0.25 + Math.random() * 0.25;
    while (t < 3.2) {
      const fade = t < 2 ? 1 : Math.max(0, 1 - (t - 2) / 1.1);
      if (fade > 0 && Math.random() > (t < 2 ? 0.05 : 0.4)) burst(data, rate, t, 0.03, 0.005, amp * fade);
      t += interval * (0.85 + Math.random() * 0.3);
    }
  }
}, 0.7, { type: 'bandpass', frequency: 1600, Q: 0.6 });

export const playCrickets = () => playRendered(3.2, (data, rate) => {
  // Twee krekels: elk tsjirp is een paar korte pulsjes van een hoge toon
  [[4300, 0], [4750, 0.21]].forEach(([freq, offset]) => {
    for (let chirp = offset; chirp < 3; chirp += 0.42 + Math.random() * 0.08) {
      for (let pulse = 0; pulse < 3; pulse++) {
        const start = Math.floor((chirp + pulse * 0.032) * rate);
        const n = Math.floor(0.018 * rate);
        for (let i = 0; i < n && start + i < data.length; i++) {
          const env = Math.sin((Math.PI * i) / n);
          data[start + i] += 0.25 * env * Math.sin((2 * Math.PI * freq * (start + i)) / rate);
        }
      }
    }
  });
}, 0.6);

export const playDrumroll = () => playRendered(3.6, (data, rate) => {
  // Roffel op de snaartrom die sneller en harder wordt, met een klap en bekken aan het eind
  let t = 0;
  while (t < 2) {
    const k = t / 2;
    burst(data, rate, t, 0.08, 0.025, 0.25 + 0.35 * k);
    tom(data, rate, t, 220, 180, 0.06, 0.12 + 0.15 * k);
    t += 0.075 - 0.03 * k;
  }
  tom(data, rate, 2.05, 110, 50, 0.4, 0.9);
  burst(data, rate, 2.05, 0.15, 0.05, 0.6);
  cymbal(data, rate, 2.05, 1.5, 0.8);
}, 0.8);

export const playRimshot = () => playRendered(2.0, (data, rate) => {
  // Ba-dum-tss: twee tomtoms en een bekken
  tom(data, rate, 0, 210, 120, 0.3, 0.8);
  tom(data, rate, 0.17, 150, 80, 0.35, 0.8);
  burst(data, rate, 0.42, 0.06, 0.02, 0.5);
  cymbal(data, rate, 0.42, 1.4, 0.7);
}, 0.85);

// Toeters: oscillators door een filter (weinig nodes)
const tone = (type: OscillatorType, freqs: number[], start: number, length: number, volume: number,
  filter: { type: BiquadFilterType; frequency: number; Q?: number }, glide?: (f: AudioParam, at: number, base: number) => void) => {
  const ac = ctx();
  const at = ac.currentTime + start;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.03);
  gain.gain.setValueAtTime(volume, at + length * 0.75);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  const f = ac.createBiquadFilter();
  f.type = filter.type; f.frequency.value = filter.frequency; f.Q.value = filter.Q ?? 1;
  f.connect(gain).connect(ac.destination);
  freqs.forEach((base) => {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(base, at);
    glide?.(osc.frequency, at, base);
    osc.connect(f);
    osc.start(at);
    osc.stop(at + length + 0.05);
  });
};

// Clownstoeter: twee keer "toet" van een rubberen peer
export const playClownHorn = () => {
  [0, 0.3].forEach((start) => tone('sawtooth', [380, 384], start, 0.22, 0.35, { type: 'bandpass', frequency: 1100, Q: 2.5 },
    (f, at, base) => { f.linearRampToValueAtTime(base * 1.08, at + 0.05); f.linearRampToValueAtTime(base * 0.93, at + 0.22); }));
};

// Luchthoorn: één lange stoot van drie lage tonen tegelijk
export const playAirHorn = () => {
  tone('sawtooth', [233, 294, 350], 0, 1.3, 0.22, { type: 'lowpass', frequency: 2400, Q: 0.8 },
    (f, at, base) => { f.setValueAtTime(base * 0.97, at); f.linearRampToValueAtTime(base, at + 0.08); });
};

// Fluitje dat omhoog en weer omlaag glijdt
export const playSlideWhistle = () => {
  tone('sine', [520], 0, 1.2, 0.3, { type: 'lowpass', frequency: 5000 },
    (f, at) => { f.exponentialRampToValueAtTime(1900, at + 0.6); f.exponentialRampToValueAtTime(650, at + 1.15); });
};

// Boing: veer met uitdovende trilling in de toonhoogte
export const playBoing = () => {
  const ac = ctx();
  const at = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(170, at);
  osc.frequency.linearRampToValueAtTime(240, at + 0.9);
  const wobble = ac.createOscillator();
  wobble.frequency.value = 13;
  const depth = ac.createGain();
  depth.gain.setValueAtTime(110, at);
  depth.gain.exponentialRampToValueAtTime(1, at + 0.9);
  wobble.connect(depth).connect(osc.frequency);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.5, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.95);
  osc.connect(gain).connect(ac.destination);
  [osc, wobble].forEach((n) => { n.start(at); n.stop(at + 1); });
};

// Boost: aanzwellend gebrul, een zwiep en een paar knallen uit de uitlaat
export const playBoost = () => {
  const ac = ctx();
  const at = ac.currentTime;
  // Gebrul
  const rumble = ac.createOscillator();
  rumble.type = 'sawtooth';
  rumble.frequency.setValueAtTime(55, at);
  rumble.frequency.exponentialRampToValueAtTime(130, at + 1.0);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 450;
  const rumbleGain = ac.createGain();
  rumbleGain.gain.setValueAtTime(0.0001, at);
  rumbleGain.gain.exponentialRampToValueAtTime(0.5, at + 0.15);
  rumbleGain.gain.setValueAtTime(0.5, at + 0.9);
  rumbleGain.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
  rumble.connect(lp).connect(rumbleGain).connect(ac.destination);
  rumble.start(at); rumble.stop(at + 1.45);
  // Zwiep: ruis door een filter dat omhoog schuift
  const whoosh = ac.createBufferSource();
  whoosh.buffer = whiteBuffer(ac, 1.3);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(300, at);
  bp.frequency.exponentialRampToValueAtTime(3200, at + 1.0);
  const whooshGain = ac.createGain();
  whooshGain.gain.setValueAtTime(0.0001, at);
  whooshGain.gain.exponentialRampToValueAtTime(0.35, at + 0.3);
  whooshGain.gain.exponentialRampToValueAtTime(0.0001, at + 1.3);
  whoosh.connect(bp).connect(whooshGain).connect(ac.destination);
  whoosh.start(at);
  // Knallen
  playRendered(1.7, (data, rate) => { [1.15, 1.3, 1.42].forEach((t) => burst(data, rate, t, 0.08, 0.015, 0.9)); }, 0.7,
    { type: 'lowpass', frequency: 900 });
};

// Wasstraat: geruis van water en borstels, en een heldere "ting" bij de glans
export const playWash = () => {
  playRendered(6.2, (data, rate) => {
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      const env = Math.min(1, t / 0.5) * (t > 5 ? Math.max(0, 1 - (t - 5) / 1.2) : 1);
      const swish = 0.7 + 0.3 * Math.sin(2 * Math.PI * 1.6 * t); // borstels die ronddraaien
      last = (last + 0.1 * (Math.random() * 2 - 1)) / 1.1;
      data[i] = last * 4 * env * swish;
    }
  }, 0.35, { type: 'lowpass', frequency: 1800 });
  const ac = ctx();
  const at = ac.currentTime + 6.1;
  [2640, 3960].forEach((freq, i) => {
    const osc = ac.createOscillator();
    osc.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(i ? 0.06 : 0.12, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.2);
    osc.connect(g).connect(ac.destination);
    osc.start(at); osc.stop(at + 1.25);
  });
};
