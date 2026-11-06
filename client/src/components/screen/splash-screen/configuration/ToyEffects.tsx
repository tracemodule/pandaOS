// Toybox-effecten op de 3D-auto (SidebarPane): weer (regen, sneeuw, zon), wasstraat, uitlaatvlammen (boost) en
// feestdagen (kerstlampjes, kerstmuts, vuurwerk). Alles alleen in het plaatje, nooit de echte auto.
// Licht houden voor de trage radio: weinig deeltjes (< 300 per effect), Points/LineSegments/InstancedMesh, geen grote
// doorzichtige vlakken onder de auto (de emulator-GPU crashte daar eerder op). Alles hangt in een groep "toy-overlay"
// onder car-root (draait mee met de auto); het kenteken en de metingen hieronder slaan die groep over.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { cachedWeather, weatherKind, type Weather } from '../../../../services/weather';
import type { WeatherFx } from '../../../../store/uiStore';
import { BOOST_MS, HOLIDAY_PREVIEW_MS, WASH_MS, holidaysOn } from './toyFx';

// --- Hooks voor SidebarPane ---

// true zolang start + ms nog niet voorbij is (rendert één keer opnieuw als het afloopt)
export const useActiveFor = (start: number, ms: number) => {
  const [, force] = useState(0);
  const active = start > 0 && Date.now() - start < ms;
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => force((x) => x + 1), start + ms - Date.now() + 30);
    return () => window.clearTimeout(timer);
  }, [active, start, ms]);
  return active;
};

// Feestdagen: automatisch in de periode (tenzij uitgezet) of tijdelijk via "Nu tonen"
export const useHolidays = (enabled: boolean, previewAt: number) => {
  const dayKey = () => new Date().toDateString();
  const [day, setDay] = useState(dayKey);
  useEffect(() => {
    const timer = window.setInterval(() => setDay(dayKey()), 5 * 60_000); // zelfde dag = geen nieuwe render
    return () => window.clearInterval(timer);
  }, []);
  const preview = useActiveFor(previewAt, HOLIDAY_PREVIEW_MS);
  const real = holidaysOn(new Date(day));
  return { christmas: preview || (enabled && real.christmas), fireworks: preview || (enabled && real.fireworks) };
};

// Weer op de auto: handmatige keuze, of 'auto' = het echte weer (services/weather.ts). Haalt zelf niets op: leest de
// laatste stand die de bovenbalk bewaart, één keer per minuut (en alleen in 'auto').
export const useWeatherFx = (mode: WeatherFx | undefined): 'rain' | 'snow' | 'sun' | null => {
  const [weather, setWeather] = useState<Weather | null>(() => (mode === 'auto' ? cachedWeather() : null));
  useEffect(() => {
    if (mode !== 'auto') return;
    const read = () => setWeather((prev) => {
      const next = cachedWeather();
      return prev && next && prev.code === next.code && prev.isDay === next.isDay ? prev : next; // zelfde weer = geen render
    });
    read();
    const timer = window.setInterval(read, 60_000);
    return () => window.clearInterval(timer);
  }, [mode]);
  if (!mode || mode === 'off') return null;
  if (mode !== 'auto') return mode;
  if (!weather) return null;
  const kind = weatherKind(weather.code);
  if (kind === 'rain' || kind === 'drizzle' || kind === 'storm') return 'rain';
  if (kind === 'snow') return 'snow';
  if ((kind === 'clear' || kind === 'partly') && weather.isDay) return 'sun';
  return null;
};

export const WASH_DURATION_MS = WASH_MS;
export const BOOST_DURATION_MS = BOOST_MS;

// --- Vorm van de auto: hoogtekaart van boven gezien, uit de vertices van het model (geen stralen: dat is op de
// radio te traag). In de ruimte van car-root met de auto recht gezet; Y = 0 is de vloer (Center top). ---
export type CarShape = {
  minX: number; maxX: number; minZ: number; maxZ: number; maxY: number;
  nx: number; nz: number; heights: Float32Array; // hoogste punt per vak (0 = geen auto)
  roof: { x0: number; x1: number; z0: number; z1: number; y: number };
};
const GRID_X = 12;
const GRID_Z = 24;
const SKIP = new Set(['license-plates', 'neon', 'minigun-root', 'toy-overlay', 'contact-shadows']);

const measureCar = (car: THREE.Object3D): CarShape | null => {
  const saved = car.rotation.clone();
  car.rotation.set(0, 0, 0);
  car.updateMatrixWorld(true);
  try {
    const inverse = car.matrixWorld.clone().invert();
    const meshes: THREE.Mesh[] = [];
    const box = new THREE.Box3();
    const walk = (o: THREE.Object3D) => {
      if (!o.visible || SKIP.has(o.name)) return;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry?.attributes?.position) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
        meshes.push(mesh);
      }
      o.children.forEach(walk);
    };
    car.children.forEach(walk);
    if (!meshes.length || box.isEmpty()) return null;
    const heights = new Float32Array(GRID_X * GRID_Z);
    const sx = (box.max.x - box.min.x) / GRID_X;
    const sz = (box.max.z - box.min.z) / GRID_Z;
    const v = new THREE.Vector3();
    const m = new THREE.Matrix4();
    for (const mesh of meshes) {
      m.multiplyMatrices(inverse, mesh.matrixWorld);
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        const gx = Math.min(GRID_X - 1, Math.max(0, Math.floor((v.x - box.min.x) / sx)));
        const gz = Math.min(GRID_Z - 1, Math.max(0, Math.floor((v.z - box.min.z) / sz)));
        const k = gz * GRID_X + gx;
        if (v.y > heights[k]) heights[k] = v.y;
      }
    }
    // Lege vakken binnen de auto (grote driehoeken zonder hoekpunt in dat vak): buren gebruiken
    for (let pass = 0; pass < 2; pass++) {
      for (let gz = 1; gz < GRID_Z - 1; gz++) for (let gx = 1; gx < GRID_X - 1; gx++) {
        const k = gz * GRID_X + gx;
        if (heights[k] > 0) continue;
        const n = [heights[k - 1], heights[k + 1], heights[k - GRID_X], heights[k + GRID_X]].filter((h) => h > 0);
        if (n.length >= 3) heights[k] = n.reduce((a, b) => a + b, 0) / n.length;
      }
    }
    // Dak: de hoogste vakken (een antenne telt niet mee: 92e percentiel als maat)
    const filled = Array.from(heights).filter((h) => h > 0).sort((a, b) => a - b);
    const ref = filled[Math.floor(filled.length * 0.92)] ?? box.max.y;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const roofHeights: number[] = [];
    for (let gz = 0; gz < GRID_Z; gz++) for (let gx = 0; gx < GRID_X; gx++) {
      const h = heights[gz * GRID_X + gx];
      if (h < ref - 0.08) continue;
      roofHeights.push(h);
      x0 = Math.min(x0, box.min.x + gx * sx); x1 = Math.max(x1, box.min.x + (gx + 1) * sx);
      z0 = Math.min(z0, box.min.z + gz * sz); z1 = Math.max(z1, box.min.z + (gz + 1) * sz);
    }
    roofHeights.sort((a, b) => a - b);
    const roofY = roofHeights[Math.floor(roofHeights.length / 2)] ?? box.max.y;
    return {
      minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, maxY: box.max.y, nx: GRID_X, nz: GRID_Z, heights,
      // Iets binnen de gevonden vakken (de rand van het dak loopt al af)
      roof: { x0: x0 + sx * 0.4, x1: x1 - sx * 0.4, z0: z0 + sz * 0.4, z1: z1 - sz * 0.4, y: roofY },
    };
  } finally {
    car.rotation.copy(saved);
    car.updateMatrixWorld(true);
  }
};

// Hoogte van de auto op (x, z), tussen de vakmiddens in; 0 naast de auto
export const heightAt = (s: CarShape, x: number, z: number) => {
  const fx = ((x - s.minX) / (s.maxX - s.minX)) * s.nx - 0.5;
  const fz = ((z - s.minZ) / (s.maxZ - s.minZ)) * s.nz - 0.5;
  if (fx < -0.5 || fz < -0.5 || fx > s.nx - 0.5 || fz > s.nz - 0.5) return 0;
  const cell = (gx: number, gz: number) => s.heights[Math.min(s.nz - 1, Math.max(0, gz)) * s.nx + Math.min(s.nx - 1, Math.max(0, gx))];
  const gx = Math.floor(fx), gz = Math.floor(fz);
  const tx = fx - gx, tz = fz - gz;
  const a = cell(gx, gz) * (1 - tx) + cell(gx + 1, gz) * tx;
  const b = cell(gx, gz + 1) * (1 - tx) + cell(gx + 1, gz + 1) * tx;
  return a * (1 - tz) + b * tz;
};

// Eén keer meten per auto (en per verlaagstand); het model komt via Suspense, dus een paar keer proberen
const shapeCache = new WeakMap<THREE.Object3D, { lowered: number; shape: CarShape }>();
const useCarShape = (enabled: boolean, lowered: number) => {
  const scene = useThree((st) => st.scene);
  const [shape, setShape] = useState<CarShape | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      const car = scene.getObjectByName('car-root');
      const cached = car ? shapeCache.get(car) : undefined;
      if (cached && cached.lowered === lowered) { setShape(cached.shape); window.clearInterval(timer); return; }
      const found = car ? measureCar(car) : null;
      if (car && found) shapeCache.set(car, { lowered, shape: found });
      if (found || ++tries > 20) { setShape(found); window.clearInterval(timer); }
    }, 350);
    return () => window.clearInterval(timer);
  }, [scene, enabled, lowered]);
  return enabled ? shape : null;
};

// --- Kleine textuurtjes (canvas, één keer) ---
const dotTexture = (() => {
  let tex: THREE.Texture | null = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.8, 'rgba(190,200,215,0.9)'); // grijs randje: ook zichtbaar op de lichte studio
    grad.addColorStop(1, 'rgba(190,200,215,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();
const glowTexture = (() => {
  let tex: THREE.Texture | null = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();
const starTexture = (() => {
  let tex: THREE.Texture | null = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const glow = g.createRadialGradient(32, 32, 0, 32, 32, 14);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow; g.fillRect(0, 0, 64, 64);
    // Vier stralen: smalle verlopen kruislings
    const ray = (horizontal: boolean) => {
      const lg = horizontal ? g.createLinearGradient(0, 0, 64, 0) : g.createLinearGradient(0, 0, 0, 64);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      if (horizontal) g.fillRect(0, 31, 64, 2); else g.fillRect(31, 0, 2, 64);
    };
    ray(true); ray(false);
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();

// Ruim de geometrie/materialen van een effect op als het verdwijnt
const useDispose = (...items: { dispose: () => void }[]) => {
  useEffect(() => () => items.forEach((x) => x.dispose()), []); // eslint-disable-line react-hooks/exhaustive-deps
};

// --- Regen: korte strepen die op dak, motorkap of vloer eindigen ---
const RAIN_DROPS = 200;
const RAIN_TOP = 4;
const RAIN_LEN = 0.22;
const Rain: React.FC<{ shape: CarShape }> = ({ shape }) => {
  const { geometry, material, drops } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_DROPS * 6), 3));
    return {
      geometry: g,
      material: new THREE.LineBasicMaterial({ color: '#6f95c9', transparent: true, opacity: 0.7, depthWrite: false }),
      drops: Array.from({ length: RAIN_DROPS }, () => ({ x: 0, y: 0, z: 0, floor: 0, speed: 0 })),
    };
  }, []);
  useDispose(geometry, material);
  const spawn = (d: typeof drops[number], top: boolean) => {
    d.x = shape.minX - 0.8 + Math.random() * (shape.maxX - shape.minX + 1.6);
    d.z = shape.minZ - 0.8 + Math.random() * (shape.maxZ - shape.minZ + 1.6);
    d.floor = heightAt(shape, d.x, d.z);
    d.y = top ? RAIN_TOP + Math.random() * 1.2 : d.floor + Math.random() * (RAIN_TOP - d.floor);
    d.speed = 7 + Math.random() * 2;
  };
  useEffect(() => { drops.forEach((d) => spawn(d, false)); }, [shape]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const pos = geometry.attributes.position.array as Float32Array;
    drops.forEach((d, i) => {
      d.y -= d.speed * dt;
      if (d.y < d.floor) spawn(d, true);
      const o = i * 6;
      pos[o] = d.x; pos[o + 1] = d.y + RAIN_LEN; pos[o + 2] = d.z;
      pos[o + 3] = d.x; pos[o + 4] = d.y; pos[o + 5] = d.z;
    });
    geometry.attributes.position.needsUpdate = true;
  });
  return <lineSegments geometry={geometry} material={material} frustumCulled={false} />;
};

// --- Sneeuw: dwarrelende vlokken en een laagje op het dak ---
const SNOW_FLAKES = 220;
const Snow: React.FC<{ shape: CarShape }> = ({ shape }) => {
  const { geometry, material, flakes } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SNOW_FLAKES * 3), 3));
    return {
      geometry: g,
      // alphaTest in plaats van doorzichtig mengen: lichter voor de GPU
      material: new THREE.PointsMaterial({ map: dotTexture(), size: 0.075, sizeAttenuation: true, alphaTest: 0.5, color: '#ffffff' }),
      flakes: Array.from({ length: SNOW_FLAKES }, () => ({ x: 0, y: 0, z: 0, floor: 0, speed: 0, phase: 0 })),
    };
  }, []);
  useDispose(geometry, material);
  const spawn = (f: typeof flakes[number], top: boolean) => {
    f.x = shape.minX - 1 + Math.random() * (shape.maxX - shape.minX + 2);
    f.z = shape.minZ - 1 + Math.random() * (shape.maxZ - shape.minZ + 2);
    f.floor = heightAt(shape, f.x, f.z);
    f.y = top ? RAIN_TOP + Math.random() * 0.5 : f.floor + Math.random() * (RAIN_TOP - f.floor);
    f.speed = 0.45 + Math.random() * 0.4;
    f.phase = Math.random() * Math.PI * 2;
  };
  useEffect(() => { flakes.forEach((f) => spawn(f, false)); }, [shape]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = clock.getElapsedTime();
    const pos = geometry.attributes.position.array as Float32Array;
    flakes.forEach((f, i) => {
      f.y -= f.speed * dt;
      f.x += Math.sin(t * 1.3 + f.phase) * 0.25 * dt;
      if (f.y < f.floor) spawn(f, true);
      pos[i * 3] = f.x; pos[i * 3 + 1] = f.y; pos[i * 3 + 2] = f.z;
    });
    geometry.attributes.position.needsUpdate = true;
  });
  const r = shape.roof;
  return (
    <>
      <points geometry={geometry} material={material} frustumCulled={false} />
      {/* Sneeuwlaag: platte ellips op het dak (de onderste helft valt in het dak) */}
      <mesh position={[(r.x0 + r.x1) / 2, r.y - 0.015, (r.z0 + r.z1) / 2]} scale={[((r.x1 - r.x0) / 2) * 0.95, 0.075, ((r.z1 - r.z0) / 2) * 0.95]}>
        <sphereGeometry args={[1, 20, 10]} />
        <meshStandardMaterial color="#f4f7fb" roughness={0.95} />
      </mesh>
    </>
  );
};

// --- Glinsteringen: sterretjes die om de beurt oplichten (zon, en de glans na de wasstraat) ---
const Sparkles: React.FC<{ points: [number, number, number][]; period: number; size: number; from?: number; until?: number }> =
  ({ points, period, size, from, until }) => {
    const materials = useMemo(() => points.map(() => new THREE.SpriteMaterial({
      map: starTexture(), color: '#fff3d0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0,
    })), [points]);
    useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
    const refs = useRef<(THREE.Sprite | null)[]>([]);
    useFrame(({ clock }) => {
      const now = Date.now();
      const visible = (from === undefined || now >= from) && (until === undefined || now < until);
      const t = clock.getElapsedTime();
      materials.forEach((m, i) => {
        const local = ((t + (i * period) / points.length) % period) / period;
        const glow = visible && local < 0.3 ? Math.sin((local / 0.3) * Math.PI) : 0;
        m.opacity = glow;
        m.rotation = t * 0.6 + i;
        refs.current[i]?.scale.setScalar(0.02 + size * glow);
      });
    });
    return (
      <>
        {points.map((p, i) => (
          <sprite key={i} ref={(el) => { refs.current[i] = el; }} position={p} material={materials[i]} />
        ))}
      </>
    );
  };

// Plekken voor glinsteringen: dakhoeken en de flanken
const glintPoints = (s: CarShape, count: number): [number, number, number][] => {
  const r = s.roof;
  const midZ = (s.minZ + s.maxZ) / 2;
  const base: [number, number, number][] = [
    [r.x0 + 0.08, r.y + 0.02, r.z1 - 0.1],
    [r.x1 - 0.08, r.y + 0.02, r.z0 + 0.1],
    [(r.x0 + r.x1) / 2, r.y + 0.03, (r.z0 + r.z1) / 2],
  ];
  // Op de motorkap/achterklep: ergens tussen dak en de uiteinden, op de gemeten hoogte
  for (const dz of [-0.62, 0.62, -0.75, 0.75]) {
    const z = midZ + dz * (s.maxZ - s.minZ) / 2;
    const x = (dz > 0 ? 0.25 : -0.25) * (s.maxX - s.minX) / 2;
    const y = heightAt(s, x, z);
    if (y > 0.3) base.push([x, y + 0.03, z]);
  }
  return base.slice(0, count);
};

// --- Wasstraat: schuimbellen op de auto, afspoelen, dan glans ---
const BUBBLES = 140;
const Wash: React.FC<{ shape: CarShape; startedAt: number; paintMaterial: RegExp }> = ({ shape, startedAt, paintMaterial }) => {
  const scene = useThree((st) => st.scene);
  const ref = useRef<THREE.InstancedMesh>(null);
  const { geometry, material, bubbles } = useMemo(() => {
    const list: { x: number; y: number; z: number; r: number; appear: number; phase: number }[] = [];
    let guard = 0;
    while (list.length < BUBBLES && guard++ < BUBBLES * 20) {
      const side = Math.random() < 0.3;
      const z = shape.minZ + 0.2 + Math.random() * (shape.maxZ - shape.minZ - 0.4);
      let x: number, y: number;
      if (side) { // tegen de flank
        const sign = Math.random() < 0.5 ? -1 : 1;
        x = sign * ((shape.maxX - shape.minX) / 2 - 0.12);
        const top = heightAt(shape, x * 0.6, z);
        if (top < 0.5) continue;
        y = 0.3 + Math.random() * (top * 0.6 - 0.3);
      } else { // bovenop
        x = shape.minX + 0.15 + Math.random() * (shape.maxX - shape.minX - 0.3);
        y = heightAt(shape, x, z);
        if (y < 0.4) continue;
      }
      list.push({ x, y, z, r: 0.05 + Math.random() * 0.1, appear: 0.2 + Math.random() * 3.3, phase: Math.random() * 6 });
    }
    return {
      geometry: new THREE.IcosahedronGeometry(1, 1),
      material: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0, emissive: '#cfe0ff', emissiveIntensity: 0.25 }),
      bubbles: list,
    };
  }, [shape]);
  useDispose(geometry, material);
  // Lichte pastelkleuren per bel
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const colors = ['#ffffff', '#eef6ff', '#fdf0ff', '#f0fff8'].map((c) => new THREE.Color(c));
    bubbles.forEach((_, i) => mesh.setColorAt(i, colors[i % colors.length]));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [bubbles]);
  // Lak: glans-flits aan het eind; altijd terugzetten
  const paints = useMemo(() => {
    const found = new Set<THREE.MeshStandardMaterial>();
    scene.getObjectByName('car-root')?.traverse((o: any) => {
      if (o.isMesh && o.material && paintMaterial.test((o.material.name || '').toLowerCase())) found.add(o.material);
    });
    return [...found];
  }, [scene, paintMaterial]);
  useEffect(() => () => paints.forEach((m) => { m.emissive?.setRGB(0, 0, 0); m.emissiveIntensity = 1; }), [paints]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = (Date.now() - startedAt) / 1000;
    const wobbleT = clock.getElapsedTime();
    const rinse = Math.min(1, Math.max(0, (t - 4.5) / 1.5));
    bubbles.forEach((b, i) => {
      let s = Math.min(1, Math.max(0, (t - b.appear) / 0.4));
      s = s * s * (3 - 2 * s); // zacht aangroeien
      s *= 1 - rinse;
      dummy.position.set(b.x, b.y - rinse * rinse * 0.8, b.z);
      dummy.scale.setScalar(Math.max(0.0001, b.r * s * (1 + 0.08 * Math.sin(wobbleT * 6 + b.phase))));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    const shine = t > 6 && t < 8 ? Math.sin(((t - 6) / 2) * Math.PI) * 0.3 : 0;
    paints.forEach((m) => { m.emissive?.setRGB(shine, shine, shine); });
  });
  const glints = useMemo(() => glintPoints(shape, 7), [shape]);
  return (
    <>
      <instancedMesh ref={ref} args={[geometry, material, bubbles.length]} frustumCulled={false} />
      <Sparkles points={glints} period={1.2} size={0.45} from={startedAt + 6000} until={startedAt + WASH_MS} />
    </>
  );
};

// --- Boost: vlammen uit de uitlaatpunten (exhaust_variants uit CarModel) ---
const Boost: React.FC<{ startedAt: number }> = ({ startedAt }) => {
  const scene = useThree((st) => st.scene);
  const tips = useMemo(() => {
    const car = scene.getObjectByName('car-root');
    const root = scene.getObjectByName('exhaust_variants');
    if (!car || !root) return [];
    car.updateMatrixWorld(true);
    return root.children.map((holder) => {
      const box = new THREE.Box3().setFromObject(holder);
      if (box.isEmpty()) return null;
      const local = car.worldToLocal(box.getCenter(new THREE.Vector3()));
      const dir = local.z >= 0 ? 1 : -1; // achterkant = de kant waar de uitlaat zit
      return { pos: [local.x, local.y, local.z + dir * 0.05] as [number, number, number], dir };
    }).filter(Boolean) as { pos: [number, number, number]; dir: number }[];
  }, [scene, startedAt]);
  const materials = useMemo(() => ({
    outer: new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    inner: new THREE.MeshBasicMaterial({ color: '#8fc8ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    glow: new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb347', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  }), []);
  useDispose(materials.outer, materials.inner, materials.glow);
  const flames = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const t = (Date.now() - startedAt) / 1000;
    const env = t < 0.08 ? t / 0.08 : t < 1.1 ? 1 : Math.max(0, 1 - (t - 1.1) / 0.5);
    flames.current.forEach((g) => {
      if (!g) return;
      const flicker = 0.7 + Math.random() * 0.5;
      g.scale.set(env * (0.9 + Math.random() * 0.2), Math.max(0.0001, env * flicker), env * (0.9 + Math.random() * 0.2));
    });
    materials.glow.opacity = env * (0.6 + Math.random() * 0.4);
  });
  return (
    <>
      {tips.map((tip, i) => (
        <group key={i} position={tip.pos}>
          {/* Kegel langs Y gedraaid naar de achterkant: punt naar buiten */}
          <group ref={(el) => { flames.current[i] = el; }} rotation={[tip.dir * Math.PI / 2, 0, 0]}>
            <mesh position={[0, 0.27, 0]} material={materials.outer}><coneGeometry args={[0.075, 0.55, 12, 1, true]} /></mesh>
            <mesh position={[0, 0.15, 0]} material={materials.inner}><coneGeometry args={[0.04, 0.3, 10, 1, true]} /></mesh>
          </group>
          <sprite material={materials.glow} scale={[0.35, 0.35, 0.35]} />
        </group>
      ))}
    </>
  );
};

// --- Kerst: lichtjes rond het dak en een kerstmuts ---
const BULBS = 28;
const BULB_COLORS = ['#ff2a2a', '#2aff5a', '#ffd21f', '#2a7bff', '#ffffff'].map((c) => new THREE.Color(c));
const ChristmasLights: React.FC<{ shape: CarShape }> = ({ shape }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const r = shape.roof;
  const points = useMemo(() => {
    // Rechthoek langs de dakrand, gelijk verdeeld over de omtrek
    const inset = 0.04;
    const corners: [number, number][] = [[r.x0 + inset, r.z0 + inset], [r.x1 - inset, r.z0 + inset], [r.x1 - inset, r.z1 - inset], [r.x0 + inset, r.z1 - inset]];
    const lengths = corners.map((c, i) => Math.hypot(corners[(i + 1) % 4][0] - c[0], corners[(i + 1) % 4][1] - c[1]));
    const total = lengths.reduce((a, b) => a + b, 0);
    return Array.from({ length: BULBS }, (_, i) => {
      let d = (i / BULBS) * total;
      let side = 0;
      while (d > lengths[side]) { d -= lengths[side]; side++; }
      const a = corners[side], b = corners[(side + 1) % 4];
      const k = d / lengths[side];
      const x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k;
      const y = Math.min(r.y, Math.max(r.y - 0.06, heightAt(shape, x, z))) + 0.03;
      return new THREE.Vector3(x, y, z);
    });
  }, [shape, r]);
  const { geometry, material, wire } = useMemo(() => {
    const line = new THREE.BufferGeometry().setFromPoints([...points, points[0]]);
    return {
      geometry: new THREE.SphereGeometry(0.035, 8, 6),
      material: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      wire: new THREE.Line(line, new THREE.LineBasicMaterial({ color: '#1f3a22' })),
    };
  }, [points]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); wire.geometry.dispose(); (wire.material as THREE.Material).dispose(); }, [geometry, material, wire]);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    points.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); mesh.setMatrixAt(i, m); mesh.setColorAt(i, BULB_COLORS[i % BULB_COLORS.length]); });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [points]);
  // Twinkelen: ~1 keer per seconde, zodat dit geen continu tekenen nodig heeft (de auto tekent in rust 1 beeld/s)
  const step = useRef(-1);
  const color = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    const s = Math.floor(clock.getElapsedTime() * 1.25);
    if (!mesh || s === step.current) return;
    step.current = s;
    points.forEach((_, i) => {
      color.copy(BULB_COLORS[(i + s) % BULB_COLORS.length]).multiplyScalar(Math.random() < 0.25 ? 0.3 : 1);
      mesh.setColorAt(i, color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <>
      <primitive object={wire} />
      <instancedMesh ref={ref} args={[geometry, material, BULBS]} frustumCulled={false} />
    </>
  );
};

const SantaHat: React.FC<{ shape: CarShape; minigun: boolean }> = ({ shape, minigun }) => {
  const r = shape.roof;
  let z = (r.z0 + r.z1) / 2;
  // Minigun staat midden op het dak (z = -0.25, zie SidebarPane): muts dan aan het andere eind van het dak
  if (minigun) z = Math.abs(r.z0 + 0.3 + 0.25) > Math.abs(r.z1 - 0.3 + 0.25) ? r.z0 + 0.3 : r.z1 - 0.3;
  const x = (r.x0 + r.x1) / 2;
  return (
    <group position={[x, r.y, z]} rotation={[0.18, 0, -0.12]}>
      <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.25, 0.065, 10, 24]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.33, 0]}>
        <coneGeometry args={[0.25, 0.55, 20]} />
        <meshStandardMaterial color="#c8102e" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <sphereGeometry args={[0.07, 12, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.95} />
      </mesh>
    </group>
  );
};

// --- Vuurwerk: drie pijlen om de beurt, elk een bol van vonken (samen 210 punten) ---
const BURSTS = 3;
const SPARKS = 70;
const BURST_S = 1.8;
const Fireworks: React.FC = () => {
  const { geometry, material, bursts } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURSTS * SPARKS * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(BURSTS * SPARKS * 3), 3));
    const list = Array.from({ length: BURSTS }, () => ({
      cycle: -1, center: new THREE.Vector3(), color: new THREE.Color(),
      vel: Array.from({ length: SPARKS }, () => new THREE.Vector3()),
    }));
    return {
      geometry: g,
      material: new THREE.PointsMaterial({ map: glowTexture(), size: 0.12, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      bursts: list,
    };
  }, []);
  useDispose(geometry, material);
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    const pos = geometry.attributes.position.array as Float32Array;
    const col = geometry.attributes.color.array as Float32Array;
    bursts.forEach((b, bi) => {
      const shifted = time + (bi * BURST_S) / BURSTS;
      const cycle = Math.floor(shifted / BURST_S);
      const t = shifted - cycle * BURST_S;
      if (cycle !== b.cycle) { // nieuwe pijl: plek, kleur en richtingen
        b.cycle = cycle;
        b.center.set((Math.random() - 0.5) * 4, 2.7 + Math.random() * 0.9, (Math.random() - 0.5) * 2.5);
        b.color.setHSL(Math.random(), 1, 0.6);
        b.vel.forEach((v) => v.randomDirection().multiplyScalar(1.1 + Math.random() * 0.6));
      }
      const fade = Math.pow(Math.max(0, 1 - t / BURST_S), 1.5);
      b.vel.forEach((v, i) => {
        const o = (bi * SPARKS + i) * 3;
        const spread = t * (1 - t * 0.22); // remt af
        pos[o] = b.center.x + v.x * spread;
        pos[o + 1] = b.center.y + v.y * spread - 0.5 * t * t;
        pos[o + 2] = b.center.z + v.z * spread;
        col[o] = b.color.r * fade; col[o + 1] = b.color.g * fade; col[o + 2] = b.color.b * fade;
      });
    });
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
};

// --- Alles samen (kind van car-root in SidebarPane) ---
export const ToyOverlays: React.FC<{
  weather: 'rain' | 'snow' | 'sun' | null; washAt: number; boostAt: number; christmas: boolean; fireworks: boolean;
  lowered: number; paintMaterial: RegExp; minigun: boolean;
}> = ({ weather, washAt, boostAt, christmas, fireworks, lowered, paintMaterial, minigun }) => {
  const shape = useCarShape(!!weather || washAt > 0 || christmas, lowered);
  const sunPoints = useMemo(() => (shape ? glintPoints(shape, 5) : []), [shape]);
  if (!weather && !washAt && !boostAt && !christmas && !fireworks) return null;
  return (
    <group name="toy-overlay">
      {shape && weather === 'rain' && <Rain shape={shape} />}
      {shape && weather === 'snow' && <Snow shape={shape} />}
      {shape && weather === 'sun' && <Sparkles points={sunPoints} period={2.4} size={0.55} />}
      {shape && washAt > 0 && <Wash key={washAt} shape={shape} startedAt={washAt} paintMaterial={paintMaterial} />}
      {boostAt > 0 && <Boost key={boostAt} startedAt={boostAt} />}
      {shape && christmas && <><ChristmasLights shape={shape} /><SantaHat shape={shape} minigun={minigun} /></>}
      {fireworks && <Fireworks />}
    </group>
  );
};
