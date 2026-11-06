import React, { useEffect, useState, useRef, Suspense, useMemo, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Fuel, DoorOpen, Cctv } from 'lucide-react';
import { useT } from '../../../../i18n';
import { markCarReady } from '../../../../services/preload';
import { useGLTF, PerspectiveCamera, Environment, ContactShadows, Center } from '@react-three/drei';
import { HDR_CITY, HDR_NIGHT } from './environmentFiles';
import { registerCarCapture } from '../../../../services/carSnapshot';
import * as THREE from 'three';
import MusicBar from '../../../music/MusicBar';
import NavigateCard from '../../../navigation/NavigateCard';
import { useUIStore, type WindowTint, type CarState, type DoorId, type NeonSettings, type LightShowSettings, type RimFinish, DOOR_LABELS } from '../../../../store/uiStore';
import { ToyOverlays, useActiveFor, useHolidays, useWeatherFx } from './ToyEffects';
import { lightShowLamps, WASH_MS, BOOST_MS } from './toyFx';
import { getEffectiveTheme } from '../../../../../src/settings';
import { getVehicleModel, type VehicleModel, type TrimRegion } from './vehicleModels';
import './_sidebar-pane.scss';
import WarningLights from './WarningLights';

// Welke onderdelen lak, velgen, ramen en losse rommel zijn, staat per model in vehicleModels.ts.
// Voorruit en voorportierramen blijven altijd licht (wettelijk); alleen de achterste ramen krijgen tint.
const TINT_OPACITY: Record<WindowTint, number> = { None: 0.25, Light: 0.45, Medium: 0.65, Dark: 0.82, Limo: 0.93 };

// Toybox > Spuiterij: afwerking van de velgen (glans = zoals het altijd was)
const RIM_FINISH: Record<RimFinish, { metalness: number; roughness: number }> = {
  gloss: { metalness: 0.8, roughness: 0.3 }, satin: { metalness: 0.6, roughness: 0.5 },
  matte: { metalness: 0.2, roughness: 0.85 }, chrome: { metalness: 1, roughness: 0.06 },
};

const makeGlass = (opacity: number) =>
  new THREE.MeshPhysicalMaterial({ color: '#0b0f12', metalness: 0.1, roughness: 0.05, transparent: true, opacity });

// --- CAMERA DIE DE HELE AUTO IN BEELD HOUDT ---
// In een smal paneel (bijv. Settings open, 30% breed) wordt het beeld horizontaal krapper dan verticaal.
// Dan schuift de camera verder naar achteren, zodat de auto (halfLength van het model aan weerszijden) niet wordt afgesneden.
const CAMERA_FOV = 35;
const CAMERA_TARGET = new THREE.Vector3(0, 1, 0);
// topDown: bovenaanzicht (in R, zoals Tesla). De auto ligt dan in de lengte op het scherm, dus passend maken op de
// hoogte van het beeld. Wisselen van stand gaat vloeiend: de camera schuift in ~1 s naar de nieuwe plek.
const FitCamera = ({ position, halfLength, topDown = false }: { position: [number, number, number]; halfLength: number; topDown?: boolean }) => {
  const { width, height } = useThree((state) => state.size);
  const aspect = width / Math.max(height, 1);
  const tanHalfVertical = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
  const tanHalfHorizontal = tanHalfVertical * aspect;

  const offset = new THREE.Vector3(...position).sub(CAMERA_TARGET);
  const neededDistance = topDown ? (halfLength * 1.15) / tanHalfVertical : halfLength / tanHalfHorizontal;
  const factor = Math.max(1, neededDistance / offset.length());
  const fitted = offset.multiplyScalar(factor).add(CAMERA_TARGET);

  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const goal = useRef(fitted.clone());
  goal.current.copy(fitted);
  const placed = useRef(false);
  useFrame((_, delta) => {
    const cam = cameraRef.current;
    if (!cam) return;
    if (!placed.current) { cam.position.copy(goal.current); placed.current = true; } // eerste keer: meteen goed
    else if (cam.position.distanceToSquared(goal.current) > 1e-6) cam.position.lerp(goal.current, 1 - Math.exp(-5 * Math.min(delta, 0.1)));
    else return;
    cam.lookAt(CAMERA_TARGET); // Camera kijkt altijd netjes naar het midden van de auto
  });

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      fov={CAMERA_FOV}
      onUpdate={(self) => {
        if (!placed.current) { self.position.copy(goal.current); self.lookAt(CAMERA_TARGET); }
        self.updateProjectionMatrix();
      }}
    />
  );
};

// --- CAR MODEL COMPONENT ---
// lightShow: Toybox > Lichtshow (alleen zolang die echt loopt, anders null)
const CarModel = ({ model, carRot, baseYaw, brakeApplied, gear, carState, vehicle, lightShow = null, children }: { model: VehicleModel; carRot: [number, number, number]; baseYaw: number; brakeApplied: boolean; gear: string; carState: CarState; vehicle: any; lightShow?: LightShowSettings | null; children?: React.ReactNode }) => {
  const { url, scale, paintMaterial, rimParts, wheelParts, frontGlass: frontGlassParts, rearGlass: rearGlassParts, strayParts, lightGlass, tailLightGlass, reverseLightGlass, headlightTypes, materialColors, lights, doors, exhaust, trim } = model;
  const { scene } = useGLTF(url) as any;
  const [blink, setBlink] = useState(false);

  // --- UITERLIJK UIT SETTINGS > VEHICLE: lak, velgen, ramentint ---
  const frontGlass = useMemo(() => makeGlass(TINT_OPACITY.None), []);
  const rearGlass = useMemo(() => makeGlass(TINT_OPACITY[vehicle.windowTint as WindowTint]), [vehicle.windowTint]);
  const rimMaterial = useMemo(() => new THREE.MeshStandardMaterial({ metalness: 0.8, roughness: 0.3 }), []);

  useEffect(() => {
    rimMaterial.color.set(vehicle.rimColor);
    const rimFinish = RIM_FINISH[(vehicle.rimFinish as RimFinish) ?? 'gloss'] ?? RIM_FINISH.gloss;
    rimMaterial.metalness = rimFinish.metalness;
    rimMaterial.roughness = rimFinish.roughness;
    scene.traverse((child: any) => {
      if (!child.isMesh) return;
      const parentName = (child.parent?.name || '').toLowerCase();
      if (paintMaterial.test((child.material?.name || '').toLowerCase())) {
        const m = child.material;
        m.color.set(vehicle.paintColor);
        // Lakafwerking (Colouriser): Metallic = het model zoals het is; de originele waarden één keer bewaren
        m.userData.original ??= { metalness: m.metalness, roughness: m.roughness, clearcoat: m.clearcoat };
        const o = m.userData.original;
        const finish = vehicle.paintFinish ?? 'Metallic';
        m.metalness = finish === 'Metallic' ? o.metalness : 0;
        m.roughness = finish === 'Matte' ? 0.85 : o.roughness;
        if (o.clearcoat !== undefined) m.clearcoat = finish === 'Matte' ? 0 : o.clearcoat;
        m.needsUpdate = true;
      }
      else if (frontGlassParts.test(parentName)) child.material = frontGlass;
      else if (rearGlassParts.test(parentName)) child.material = rearGlass;
      else if (rimParts.test(parentName)) child.material = rimMaterial;
    });
  }, [scene, vehicle.paintColor, vehicle.paintFinish, vehicle.rimColor, vehicle.rimFinish, frontGlass, rearGlass, rimMaterial, paintMaterial, frontGlassParts, rearGlassParts, rimParts]);

  // Modelfouten wegwerken: getint lampglas helder maken, bonte binnendelen een vaste neutrale kleur geven
  const clearLightGlass = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.15
  }), []);
  useEffect(() => {
    scene.traverse((child: any) => {
      if (!child.isMesh) return;
      const parentName = (child.parent?.name || '').toLowerCase();
      if (lightGlass?.test(parentName)) child.material = clearLightGlass;
      const fixedColor = materialColors?.[child.material?.name];
      if (fixedColor) child.material.color.set(fixedColor);
    });
  }, [scene, lightGlass, materialColors, clearLightGlass]);

  // Losse onderdelen buiten de auto verwijderen (niet alleen verbergen), anders rekken ze de bounding box van <Center> op
  useMemo(() => {
    const strays: any[] = [];
    scene.traverse((child: any) => {
      // Exacte naam: "exhaustpipe_single" mag "exhaustpipe_single_sport" niet meeslepen
      if (strayParts.includes(child.name.toLowerCase())) strays.push(child);
    });
    strays.forEach((child) => child.parent?.remove(child));
  }, [scene, strayParts]);

  // Knipperritme van de richtingaanwijzers (alarmlichten: beide kanten)
  useEffect(() => {
    const interval = setInterval(() => setBlink((prev) => !prev), 450);
    return () => clearInterval(interval);
  }, []);

  // Banden en chroom een vaste look geven
  useMemo(() => {
    scene.traverse((child: any) => {
      if (!child.isMesh) return;
      const name = child.name.toLowerCase();
      if (name.includes('tire')) {
        child.material.color = new THREE.Color('#111');
        child.material.roughness = 0.9;
      } else if (name.includes('chrome')) {
        child.material.color = new THREE.Color('#999');
        child.material.metalness = 1;
        child.material.roughness = 0.1;
      }
    });
  }, [scene]);

  // --- LAMPEN: lichtschakelaar, grootlicht, knipperlichten, remlicht, achteruitrijlicht (lights in vehicleModels.ts) ---
  // Materialen worden in het model gedeeld: één knipperlicht-materiaal links = voor, achter en spiegel tegelijk.
  const lightMaterials = useMemo(() => {
    const found: Record<string, THREE.MeshStandardMaterial[]> = {};
    if (!lights) return found;
    scene.traverse((child: any) => {
      if (!child.isMesh || !child.material) return;
      const matName = (child.material.name || '').toLowerCase();
      for (const [role, pattern] of Object.entries(lights)) {
        if (pattern && (pattern as RegExp).test(matName)) {
          const list = (found[role] ??= []);
          if (!list.includes(child.material)) list.push(child.material);
        }
      }
    });
    return found;
  }, [scene, lights]);

  const blinkLeft = (carState.blinker === 'left' || carState.blinker === 'hazard') && blink;
  const blinkRight = (carState.blinker === 'right' || carState.blinker === 'hazard') && blink;
  const lightsOn = carState.lights !== 'off';
  // Lamp aan: gloeien in de lampkleur; uit: terug naar de oorspronkelijke kleur
  const setLamp = useCallback((role: string, on: boolean, color: string, intensity: number) => {
    (lightMaterials[role] ?? []).forEach((mat) => {
      if (!mat.userData.baseColor) mat.userData.baseColor = mat.color.clone();
      mat.emissive = new THREE.Color(on ? color : '#000000');
      mat.emissiveIntensity = on ? intensity : 0;
      mat.color.copy(on ? new THREE.Color(color) : mat.userData.baseColor);
      mat.toneMapped = !on; // fel, ook in een lichte omgeving
      mat.needsUpdate = true;
    });
  }, [lightMaterials]);
  const showOn = !!lightShow;
  const showKey = useRef('');
  useEffect(() => {
    // Lichtshow bezig: die zet de lampen zelf (useFrame verderop); bij het stoppen draait dit opnieuw en herstelt alles
    showKey.current = '';
    if (showOn) return;
    setLamp('lowBeam', carState.lights === 'low', '#f4f8ff', 3);
    setLamp('highBeam', carState.highBeam, '#f4f8ff', 4);
    // Stadslicht/dagrijlicht; knippert die kant, dan oranje
    setLamp('parkingLeft', blinkLeft || lightsOn, blinkLeft ? '#ffa000' : '#f4f8ff', blinkLeft ? 4 : 2);
    setLamp('parkingRight', blinkRight || lightsOn, blinkRight ? '#ffa000' : '#f4f8ff', blinkRight ? 4 : 2);
    setLamp('signalLeft', blinkLeft, '#ffa000', 4);
    setLamp('signalRight', blinkRight, '#ffa000', 4);
    // Achterlichten: zwak rood met de lichten aan, fel bij remmen
    setLamp('tail', brakeApplied || lightsOn, '#ff1010', brakeApplied ? 5 : 1.2);
    setLamp('brake', brakeApplied, '#ff1010', 5);
    setLamp('reverse', gear === 'R', '#ffffff', 4);
  }, [setLamp, showOn, carState.lights, carState.highBeam, blinkLeft, blinkRight, lightsOn, brakeApplied, gear]);

  // --- DEUREN: draaien om hun scharnier aan de voorkant (doors in vehicleModels.ts) ---
  // Het model staat Z-omhoog met de neus naar -Y (binnen de eigen rotatie van het model). Per deur een draaipunt
  // op de voorste buitenhoek; de deur en zijn ruit hangen daaronder. Eén keer per scene (useGLTF hergebruikt hem).
  type DoorPivot = { pivot: THREE.Group; dir: number };
  const doorPivots = useMemo(() => {
    if (!doors) return {} as Partial<Record<DoorId, DoorPivot>>;
    if (scene.userData.doorPivots) return scene.userData.doorPivots as Partial<Record<DoorId, DoorPivot>>;
    const pivots: Partial<Record<DoorId, DoorPivot>> = {};
    for (const [door, partNames] of Object.entries(doors) as [DoorId, string[]][]) {
      const parts = partNames.map((n) => scene.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
      const parent = parts[0]?.parent;
      if (!parent) continue;
      const box = new THREE.Box3();
      parts.forEach((part) => part.traverse((o: any) => {
        if (!o.isMesh) return;
        o.geometry.computeBoundingBox();
        box.union(o.geometry.boundingBox);
      }));
      const centerX = (box.min.x + box.max.x) / 2;
      // Scharnier op de voorrand van het deurpaneel: alleen vertices vlak bij de voorrand tellen, anders zou de
      // uitstekende spiegel het draaipunt naar buiten trekken en staat de open deur los van de auto
      // (onderste helft van de deur: daar zit geen spiegel)
      let edgeX = centerX;
      const lowerHalf = (box.min.z + box.max.z) / 2;
      parts.forEach((part) => part.traverse((o: any) => {
        if (!o.isMesh || o.name.includes('mirror')) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          if (pos.getY(i) > box.min.y + 0.08 || pos.getZ(i) > lowerHalf) continue;
          const x = pos.getX(i);
          edgeX = centerX > 0 ? Math.max(edgeX, x) : Math.min(edgeX, x);
        }
      }));
      const hinge = new THREE.Vector3(edgeX, box.min.y, (box.min.z + box.max.z) / 2);
      const pivot = new THREE.Group();
      pivot.name = `pivot_${door}`;
      pivot.position.copy(hinge);
      parent.add(pivot);
      parts.forEach((part) => { part.position.sub(hinge); pivot.add(part); });
      // Linkerkant (+X) draait de andere kant op dan rechts, zodat de deur altijd naar buiten opent
      pivots[door] = { pivot, dir: centerX > 0 ? -1 : 1 };
    }
    scene.userData.doorPivots = pivots;
    return pivots;
  }, [scene, doors]);

  // Zachtjes open en dicht. Het eerste getekende beeld betekent ook: de auto is klaar (opstartscherm mag weg).
  const firstFrame = useRef(true);
  useFrame((_, delta) => {
    if (firstFrame.current) { firstFrame.current = false; markCarReady(); }
    const openAngle = THREE.MathUtils.degToRad(62);
    for (const [door, entry] of Object.entries(doorPivots) as [DoorId, DoorPivot][]) {
      const target = carState.doors[door] ? entry.dir * openAngle : 0;
      const current = entry.pivot.rotation.z;
      if (Math.abs(target - current) > 0.001) entry.pivot.rotation.z = THREE.MathUtils.damp(current, target, 8, delta);
    }
  });

  // --- UITLAAT: varianten gemaakt van één uitlaatpunt (exhaust in vehicleModels.ts), gespiegeld of verschoven ---
  type ExhaustRig = { root: THREE.Group; template: THREE.Group; x: number };
  const exhaustRig = useMemo(() => {
    if (!exhaust) return null;
    if (scene.userData.exhaustRig) return scene.userData.exhaustRig as ExhaustRig;
    const parts = exhaust.parts.map((n) => scene.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
    const parent = parts[0]?.parent;
    if (!parent) return null;
    const template = new THREE.Group();
    parts.forEach((p) => template.add(p)); // uit de scene halen; de varianten zijn kopieën
    // Uitlaat in chroom (het model gaf hem een witte kleur)
    const chrome = new THREE.MeshStandardMaterial({ color: '#d6dadf', metalness: 1, roughness: 0.18 });
    template.traverse((o: any) => { if (o.isMesh) o.material = chrome; });
    const box = new THREE.Box3();
    template.traverse((o: any) => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox); } });
    const root = new THREE.Group();
    root.name = 'exhaust_variants';
    parent.add(root);
    const rig: ExhaustRig = { root, template, x: (box.min.x + box.max.x) / 2 };
    scene.userData.exhaustRig = rig;
    return rig;
  }, [scene, exhaust]);

  useEffect(() => {
    if (!exhaustRig || !exhaust) return;
    const { root, template, x } = exhaustRig;
    root.clear();
    const gap = exhaust.spacing; // afstand tussen twee punten aan dezelfde kant
    // Elke plek: kant (1 = zoals het origineel, -1 = gespiegeld naar de andere kant) en verschuiving naar het midden
    const side = (s: number, n: number) => Array.from({ length: n }, (_, i) => ({ s, inward: i * gap }));
    const layout = vehicle.exhaust ?? 'left1';
    const spots = layout === 'none' ? [] : layout === 'left1' ? side(1, 1) : layout === 'left2' ? side(1, 2)
      : layout === 'right1' ? side(-1, 1) : layout === 'right2' ? side(-1, 2)
      : layout === 'both1' ? [...side(1, 1), ...side(-1, 1)] : layout === 'both2' ? [...side(1, 2), ...side(-1, 2)]
      : [{ s: 1, inward: Math.abs(x) - gap / 2 }, { s: -1, inward: Math.abs(x) - gap / 2 }]; // center2
    spots.forEach(({ s, inward }) => {
      const copy = template.clone(true);
      copy.position.x = -Math.sign(x) * inward; // naar het midden schuiven
      const holder = new THREE.Group();
      holder.scale.x = s; // -1 = spiegelen over x = 0 (andere kant van de auto)
      holder.add(copy);
      root.add(holder);
    });
  }, [exhaustRig, exhaust, vehicle.exhaust]);

  // --- LAMPGLAS: koplampglas licht op met de lichten aan (sterker bij grootlicht), achterlichtglas rood (fel bij remmen) ---
  // De lampjes zelf zijn in dit model klein; zo is van een afstand goed te zien dat de lichten aan zijn.
  // toneMapped uit: de kleurcorrectie van de weergave maakt fel rood anders oranje
  const tailGlass = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#3a0000', metalness: 0, roughness: 0.1, transparent: true, opacity: 0.55, toneMapped: false,
  }), []);
  const reverseGlass = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#3a0000', metalness: 0, roughness: 0.1, transparent: true, opacity: 0.55, toneMapped: false,
  }), []);
  // Lampbinnenkant van de achterlichten: in het model een gedeelde textuur (viilights) die daar oranje uitvalt;
  // een achterlicht is rood
  const tailLamp = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7a0000', metalness: 0.1, roughness: 0.35, toneMapped: false }), []);
  useEffect(() => {
    scene.traverse((child: any) => {
      if (!child.isMesh) return;
      const parentName = (child.parent?.name || '').toLowerCase();
      if (reverseLightGlass?.test(parentName)) child.material = reverseGlass;
      else if (tailLightGlass?.test(parentName)) child.material = tailGlass;
      else if (/taillight_[lr](_high)?$|tailgate_a_light_[lr]$/.test(parentName)
        && /viilights/i.test(child.material?.name || '')) child.material = tailLamp;
    });
  }, [scene, tailLightGlass, reverseLightGlass, tailGlass, reverseGlass, tailLamp]);
  useEffect(() => {
    if (showOn) return; // lichtshow zet het glas zelf
    const front = carState.highBeam ? 1.4 : carState.lights === 'low' ? 0.9 : carState.lights === 'parking' ? 0.35 : 0;
    clearLightGlass.emissive = new THREE.Color(front > 0 ? '#eaf2ff' : '#000000');
    clearLightGlass.emissiveIntensity = front;
    clearLightGlass.opacity = front > 0 ? 0.55 : 0.15;
    const rear = brakeApplied ? 2.2 : lightsOn ? 0.8 : 0;
    tailGlass.emissive = new THREE.Color(rear > 0 ? '#ff0000' : '#000000');
    tailGlass.emissiveIntensity = rear;
    tailLamp.emissive = new THREE.Color(rear > 0 ? '#ff0000' : '#000000');
    tailLamp.emissiveIntensity = rear;
    // Achteruitrijlicht: wit bij R; anders gloeit dit deel mee met de achterlichten
    const reversing = gear === 'R';
    reverseGlass.color.set(reversing ? '#ffffff' : '#3a0000');
    reverseGlass.emissive = new THREE.Color(reversing ? '#ffffff' : rear > 0 ? '#ff0a0a' : '#000000');
    reverseGlass.emissiveIntensity = reversing ? 1.6 : rear;
  }, [clearLightGlass, tailGlass, reverseGlass, tailLamp, carState.lights, carState.highBeam, brakeApplied, lightsOn, gear, showOn]);

  // --- TOYBOX > LICHTSHOW: lampen op de tel (tempo zelf gekozen; de radio hoort de muziek niet).
  // Alleen bij een wisseling iets aanpassen, niet elk beeld. ---
  useFrame(({ clock }) => {
    if (!lightShow) return;
    const l = lightShowLamps(lightShow.pattern, (clock.getElapsedTime() * lightShow.bpm) / 60);
    const key = `${+l.front}${+l.left}${+l.right}${+l.rear}${+l.reverse}`;
    if (key === showKey.current) return;
    showKey.current = key;
    setLamp('lowBeam', l.front, '#f4f8ff', 3);
    setLamp('highBeam', l.front, '#f4f8ff', 4);
    setLamp('parkingLeft', l.front || l.left, l.left ? '#ffa000' : '#f4f8ff', 4);
    setLamp('parkingRight', l.front || l.right, l.right ? '#ffa000' : '#f4f8ff', 4);
    setLamp('signalLeft', l.left, '#ffa000', 4);
    setLamp('signalRight', l.right, '#ffa000', 4);
    setLamp('tail', l.rear, '#ff1010', 5);
    setLamp('brake', l.rear, '#ff1010', 5);
    setLamp('reverse', l.reverse, '#ffffff', 4);
    clearLightGlass.emissive.set(l.front ? '#eaf2ff' : '#000000');
    clearLightGlass.emissiveIntensity = l.front ? 1.4 : 0;
    clearLightGlass.opacity = l.front ? 0.55 : 0.15;
    [tailGlass, tailLamp].forEach((m) => { m.emissive.set(l.rear ? '#ff0000' : '#000000'); m.emissiveIntensity = l.rear ? 2.2 : 0; });
    reverseGlass.color.set(l.reverse ? '#ffffff' : '#3a0000');
    reverseGlass.emissive.set(l.reverse ? '#ffffff' : l.rear ? '#ff0a0a' : '#000000');
    reverseGlass.emissiveIntensity = l.reverse ? 1.6 : l.rear ? 2.2 : 0;
  });

  // --- KOPLAMPUITVOERING: halogeen of xenon (headlightTypes in vehicleModels.ts) ---
  useEffect(() => {
    if (!headlightTypes) return;
    const chosen = vehicle.headlightType ?? 'halogen';
    for (const [type, names] of Object.entries(headlightTypes)) {
      names.forEach((n) => { const node = scene.getObjectByName(n); if (node) node.visible = type === chosen; });
    }
  }, [scene, headlightTypes, vehicle.headlightType]);

  // --- SPIEGELS EN GRILL: uit grotere meshes geknipt (trim in vehicleModels.ts), daarna een eigen materiaal ---
  type TrimPart = { mesh: THREE.Mesh; original: THREE.Material };
  const trimParts = useMemo(() => {
    const result: Record<'mirrors' | 'grille', TrimPart[]> = { mirrors: [], grille: [] };
    if (!trim) return result;
    if (scene.userData.trimParts) return scene.userData.trimParts as typeof result;
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o: any) => { if (o.isMesh) meshes.push(o); });
    for (const [key, regions] of Object.entries(trim) as ['mirrors' | 'grille', TrimRegion[]][]) {
      for (const region of regions) {
        const [x0, x1, y0, y1, z0, z1] = region.box;
        meshes.forEach((mesh) => {
          const geometry = mesh.geometry as THREE.BufferGeometry;
          const index = geometry.index;
          const pos = geometry.attributes.position;
          if (!index || !pos) return;
          if (!region.node.test((mesh.parent?.name || '').toLowerCase())) return;
          if (!region.material.test(((mesh.material as THREE.Material)?.name || '').toLowerCase())) return;
          const keep: number[] = [];
          const cut: number[] = [];
          for (let i = 0; i < index.count; i += 3) {
            const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
            const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
            const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
            const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
            const inside = cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1 && cz >= z0 && cz <= z1;
            (inside ? cut : keep).push(a, b, c);
          }
          if (!cut.length) return;
          geometry.setIndex(keep);
          // Nieuwe mesh met dezelfde vertices, alleen de geknipte driehoeken; zelfde plek in de boom (beweegt mee met de deur)
          const piece = new THREE.BufferGeometry();
          Object.entries(geometry.attributes).forEach(([name, attr]) => piece.setAttribute(name, attr));
          piece.setIndex(cut);
          const original = mesh.material as THREE.Material;
          const part = new THREE.Mesh(piece, original);
          part.name = `${mesh.name}_${key}`;
          part.position.copy(mesh.position);
          part.quaternion.copy(mesh.quaternion);
          part.scale.copy(mesh.scale);
          mesh.parent!.add(part);
          result[key].push({ mesh: part, original });
        });
      }
    }
    scene.userData.trimParts = result;
    return result;
  }, [scene, trim]);

  // Afwerkingen: wagenkleur, (glans)zwart, chroom, carbon
  const trimMaterials = useMemo(() => {
    // Carbon: schuin geweven patroon op een klein canvas, herhaald, met een laklaag
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    // Licht patroon op een donkere basiskleur: zonder bruikbare textuurcoördinaten blijft het dan toch donker
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#ffffff';
    for (let y = 0; y < 32; y += 8) for (let x = 0; x < 32; x += 8) if (((x + y) / 8) % 2 === 0) ctx.fillRect(x, y, 8, 8);
    const weave = new THREE.CanvasTexture(canvas);
    weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
    weave.repeat.set(40, 40);
    return {
      black: new THREE.MeshPhysicalMaterial({ color: '#0a0a0a', metalness: 0.2, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
      chrome: new THREE.MeshStandardMaterial({ color: '#d8d8d8', metalness: 1, roughness: 0.08 }),
      carbon: new THREE.MeshPhysicalMaterial({ color: '#2a2a2a', map: weave, metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 }),
      body: new THREE.MeshPhysicalMaterial({ metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
    };
  }, []);

  useEffect(() => {
    trimMaterials.body.color.set(vehicle.paintColor);
    const apply = (parts: TrimPart[], finish: string) => parts.forEach(({ mesh, original }) => {
      mesh.material = finish === 'standard' ? original : (trimMaterials as Record<string, THREE.Material>)[finish] ?? original;
    });
    // Spiegels in wagenkleur = het originele lakmateriaal (krijgt de lakkleur al mee)
    apply(trimParts.mirrors, (vehicle.mirrors ?? 'body') === 'body' ? 'standard' : vehicle.mirrors);
    apply(trimParts.grille, vehicle.grille ?? 'standard');
  }, [trimParts, trimMaterials, vehicle.mirrors, vehicle.grille, vehicle.paintColor]);

  // --- TOYBOX > SPUITERIJ > VERLAGEN: alles behalve de wielen (wheelParts in vehicleModels.ts) zakt een paar cm.
  // Het model staat Z-omhoog binnen de groep waar alle onderdelen (en de deur-scharnieren, uitlaat) direct onder hangen.
  // De wielen blijven staan, dus <Center top> en de vloer kloppen nog. Oorspronkelijke hoogte één keer bewaren. ---
  useEffect(() => {
    if (!wheelParts) return;
    let group: THREE.Object3D | null = null;
    scene.traverse((o: THREE.Object3D) => { if (!group && wheelParts.test(o.name.toLowerCase())) group = o.parent; });
    if (!group) return;
    const drop = Math.max(0, Math.min(5, Number(vehicle.lowered) || 0)) / 100; // cm -> modeleenheden (meters)
    (group as THREE.Object3D).children.forEach((child) => {
      if (wheelParts.test(child.name.toLowerCase())) return;
      child.userData.lowerBaseZ ??= child.position.z;
      child.position.z = child.userData.lowerBaseZ - drop;
    });
  }, [scene, wheelParts, vehicle.lowered, doorPivots, exhaustRig, trimParts]);

  return (
    // <Center top> plaatst de wielen exact op Y=0, ongeacht de interne afmetingen van het .glb bestand!
    // De rotatie zit op een groep buiten <Center>, zodat de auto om zijn eigen midden draait (ook als je hem sleept).
    // car-root + baseYaw: de momentopname voor Software draait de auto even terug naar de standaardstand
    <group name="car-root" rotation={carRot} userData={{ baseYaw }}>
      <Center top>
        <primitive object={scene} scale={scale} />
      </Center>
      {children}
    </group>
  );
};

// Momentopname van de auto voor Settings > Software (services/carSnapshot.ts): één beeld renderen en als PNG lezen
// Tekenen op aanvraag (Canvas frameloop="demand"): de auto wordt alleen getekend als er iets verandert, niet 60 keer
// per seconde terwijl hij stilstaat (dat waren ~9000 tekenopdrachten per seconde op de radio, 6-11-2026).
//  - continuous: zolang er iets beweegt (draaien, knipperlicht, neon-effect, regenboogvloer) gewoon 60 beelden/s
//  - elke wijziging in de store of in deps: 1,5 s doortekenen, zodat deuren en lampen vloeiend uitlopen
//  - vangnet: altijd 1 beeld per seconde, zodat er nooit iets blijft hangen dat we vergeten zijn
const RenderOnDemand: React.FC<{ continuous: boolean; deps: unknown[] }> = ({ continuous, deps }) => {
  const invalidate = useThree((st) => st.invalidate);
  const until = useRef(0);
  const live = useRef(continuous);
  live.current = continuous;
  // Teller voor de laptop (tools/pandaos.mjs js "__pandaRender"): waarom er getekend wordt
  const stats = ((window as any).__pandaRender ??= { store: {} as Record<string, number>, deps: 0, continuous: false, frames: 0, panes: 0 });
  useFrame(() => { stats.frames++; });
  stats.continuous = continuous;
  const raf = useRef(0);
  // Lus alleen zolang er iets beweegt of net veranderd is; daarna stopt hij (geen requestAnimationFrame in rust,
  // anders blijft de tekenpijplijn van de browser elke frame wakker)
  const run = useCallback(() => {
    if (raf.current) return;
    const step = (now: number) => {
      if (live.current || now < until.current) { invalidate(); raf.current = requestAnimationFrame(step); }
      else raf.current = 0;
    };
    raf.current = requestAnimationFrame(step);
  }, [invalidate]);
  const kick = useCallback((ms = 1500) => {
    until.current = Math.max(until.current, performance.now() + ms);
    run();
  }, [run]);
  useEffect(() => { if (continuous) run(); }, [continuous, run]);
  useEffect(() => {
    kick(3000); // na het laden: model, licht en schaduw opbouwen
    // Alleen wat de auto raakt (niet bijv. de muziekpositie, die elke seconde verandert)
    const pick = (st: ReturnType<typeof useUIStore.getState>) => [st.carState, st.toyCar, st.vehicleSettings,
      (st as any).brakeApplied, (st as any).gear, st.screenMode, st.vehicleLightsOn, st.displaySettings];
    let prev = pick(useUIStore.getState());
    const unsubscribe = useUIStore.subscribe((st) => {
      const next = pick(st);
      const changed = next.findIndex((v, i) => v !== prev[i]);
      if (changed >= 0) {
        const name = ['carState', 'toyCar', 'vehicleSettings', 'brakeApplied', 'gear', 'screenMode', 'vehicleLightsOn', 'displaySettings'][changed];
        stats.store[name] = (stats.store[name] ?? 0) + 1;
        kick();
      }
      prev = next;
    });
    const beat = window.setInterval(() => invalidate(), 1000); // vangnet: 1 beeld per seconde
    return () => { unsubscribe(); window.clearInterval(beat); cancelAnimationFrame(raf.current); raf.current = 0; };
  }, [invalidate, kick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { stats.deps++; kick(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

const SnapshotBridge: React.FC = () => {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    registerCarCapture(() => {
      // Zonder de schaduw op de vloer (die wordt anders een lichte rechthoek in de afbeelding)
      const shadows = scene.getObjectByName('contact-shadows');
      if (shadows) shadows.visible = false;
      // Altijd vanuit dezelfde hoek, ook als je de auto zelf hebt rondgedraaid (één beeld; daarna terug)
      const root = scene.getObjectByName('car-root');
      const yaw = root?.rotation.y;
      if (root && typeof root.userData.baseYaw === 'number') root.rotation.y = root.userData.baseYaw;
      gl.render(scene, camera);
      const png = gl.domElement.toDataURL('image/png');
      if (root && yaw !== undefined) root.rotation.y = yaw;
      if (shadows) shadows.visible = true;
      gl.render(scene, camera);
      return png;
    });
    return () => registerCarCapture(null);
  }, [gl, scene, camera]);
  return null;
};

// Toybox > Neon: gloed op de vloer langs de gekozen kanten van de auto (draait mee met de auto).
// Gloed-textuur: fel in het midden van de strook, zacht naar buiten. Additief, dus geen zwarte randen.
const NEON_HALF_LENGTH = 2.0; // halve lengte van de Golf (scene-eenheden, na schaal), iets binnen de bumpers
const NEON_HALF_WIDTH = 0.95;
const NeonUnderglow: React.FC<{ neon: NeonSettings }> = ({ neon }) => {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 4; canvas.height = 128;
    const c = canvas.getContext('2d')!;
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 4, 128);
    return new THREE.CanvasTexture(canvas);
  }, []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }), [texture]);
  useEffect(() => { material.color.set(neon.color); material.opacity = 1; }, [material, neon.color]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (neon.effect === 'pulse') material.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 3));
    else if (neon.effect === 'rainbow') material.color.setHSL((t * 0.15) % 1, 1, 0.55);
  });
  const width = 0.9; // breedte van de gloed
  const strips: { key: string; pos: [number, number, number]; size: [number, number]; rotZ: number }[] = [];
  // Lengte van de auto langs Z, breedte langs X. Elke strook: [lengte, gloedbreedte], de gloed loopt dwars;
  // stroken langs de zijkant een kwartslag gedraaid zodat ze in de lengte van de auto liggen.
  if (neon.sides.left) strips.push({ key: 'l', pos: [NEON_HALF_WIDTH, 0.01, 0], size: [NEON_HALF_LENGTH * 2, width], rotZ: Math.PI / 2 });
  if (neon.sides.right) strips.push({ key: 'r', pos: [-NEON_HALF_WIDTH, 0.01, 0], size: [NEON_HALF_LENGTH * 2, width], rotZ: Math.PI / 2 });
  if (neon.sides.front) strips.push({ key: 'f', pos: [0, 0.01, NEON_HALF_LENGTH], size: [NEON_HALF_WIDTH * 2, width], rotZ: 0 });
  if (neon.sides.rear) strips.push({ key: 'b', pos: [0, 0.01, -NEON_HALF_LENGTH], size: [NEON_HALF_WIDTH * 2, width], rotZ: 0 });
  return (
    <group name="neon">
      {strips.map((st) => (
        <mesh key={st.key} position={st.pos} rotation={[-Math.PI / 2, 0, st.rotZ]} material={material}>
          <planeGeometry args={st.size} />
        </mesh>
      ))}
    </group>
  );
};

// Toybox > Minigun: het model (public/models/minigun.glb) op het midden van het dak. Het model heeft een eigen
// maat; het wordt geschaald naar MINIGUN_LENGTH en met de lange kant in de lengte van de auto gelegd.
const MINIGUN_LENGTH = 1.3; // scene-eenheden (de auto is ~5 lang)
const ROOF_HEIGHT = 1.7; // bovenkant van het dak van de Golf (na schaal)
const Minigun: React.FC = () => {
  const { scene } = useGLTF('/models/minigun.glb') as any;
  const object = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const scale = MINIGUN_LENGTH / Math.max(size.x, size.y, size.z);
    const center = box.getCenter(new THREE.Vector3());
    // Onderkant op het dak, midden boven het midden van de auto
    clone.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    clone.scale.setScalar(scale);
    // Kleur: lopen en ronde delen staalgrijs, de rest donker legergroen (het model heeft één kale grijze lak)
    const steel = new THREE.MeshStandardMaterial({ color: '#3b3f45', metalness: 0.9, roughness: 0.35 });
    const body = new THREE.MeshStandardMaterial({ color: '#3d4a2c', metalness: 0.4, roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1c1d1f', metalness: 0.6, roughness: 0.5 });
    clone.traverse((o: any) => {
      if (!o.isMesh) return;
      const name = `${o.name} ${o.parent?.name ?? ''}`.toLowerCase();
      o.material = /cylinder|tube|barrel/.test(name) ? steel : /plane/.test(name) ? dark : body;
      o.castShadow = true;
    });
    const group = new THREE.Group();
    group.name = 'minigun-root';
    group.add(clone);
    return group;
  }, [scene]);
  // Lange kant van het model ligt langs X; de auto ligt langs Z. Loop naar de voorkant, midden van het dak.
  return <primitive object={object} position={[0, ROOF_HEIGHT, -0.25]} rotation={[0, Math.PI / 2, 0]} />;
};

// Kenteken (Instellingen > Voertuig): geel Nederlands kenteken voor en achter op de 3D-auto.
// Getekend op een canvas (EU-strook met NL, zwarte rand, zwarte tekens); 52 × 11 cm, met de schaal van het model.
const PLATE_W = 0.52 * 1.2;
const PLATE_H = 0.11 * 1.2;
const makePlateTexture = (text: string) => {
  const w = 1040; const h = 220;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d')!;
  const r = 18;
  const rounded = (x: number, y: number, ww: number, hh: number, rr: number) => {
    c.beginPath();
    c.moveTo(x + rr, y); c.lineTo(x + ww - rr, y); c.quadraticCurveTo(x + ww, y, x + ww, y + rr);
    c.lineTo(x + ww, y + hh - rr); c.quadraticCurveTo(x + ww, y + hh, x + ww - rr, y + hh);
    c.lineTo(x + rr, y + hh); c.quadraticCurveTo(x, y + hh, x, y + hh - rr);
    c.lineTo(x, y + rr); c.quadraticCurveTo(x, y, x + rr, y); c.closePath();
  };
  c.fillStyle = '#111'; rounded(0, 0, w, h, r); c.fill();
  c.fillStyle = '#f7c600'; rounded(8, 8, w - 16, h - 16, r - 6); c.fill();
  // EU-strook met sterrenkring en NL
  const strip = 112;
  c.save(); rounded(8, 8, w - 16, h - 16, r - 6); c.clip();
  c.fillStyle = '#003399'; c.fillRect(8, 8, strip, h - 16); c.restore();
  c.fillStyle = '#ffcc00';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.beginPath(); c.arc(8 + strip / 2 + Math.cos(a) * 30, 72 + Math.sin(a) * 30, 5, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = '#ffffff'; c.font = 'bold 56px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('NL', 8 + strip / 2, 165);
  // Tekens: zo groot mogelijk binnen het gele deel
  c.fillStyle = '#111';
  let size = 170;
  c.font = `bold ${size}px "Roboto Condensed", "Arial Narrow", sans-serif`;
  const room = w - strip - 70;
  while (c.measureText(text).width > room && size > 60) { size -= 6; c.font = `bold ${size}px "Roboto Condensed", "Arial Narrow", sans-serif`; }
  c.fillText(text, strip + 8 + (w - strip - 16) / 2, h / 2 + 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
};
// Plek van de platen uit het model zelf: de auto-groep even recht zetten, de omvang meten, de voorkant vinden aan
// de koplampen (lowbeam) en dan met een straal van buitenaf het echte oppervlak van bumper en achterklep zoeken.
// Alleen zichtbare delen van de auto tellen (het model heeft verborgen varianten van bumpers en koplampen).
const REAR_PLATE_SHIFT_X = 0.03;
type PlateSpots = { front: [number, number, number]; rear: [number, number, number]; frontDir: number; frontTilt: number };
const isVisible = (o: THREE.Object3D, stop: THREE.Object3D) => {
  for (let p: THREE.Object3D | null = o; p && p !== stop; p = p.parent) if (!p.visible) return false;
  return true;
};
const findPlateSpots = (root: THREE.Object3D): PlateSpots | null => {
  const car = root.getObjectByName('car-root');
  if (!car) return null;
  const saved = car.rotation.clone();
  car.rotation.set(0, 0, 0);
  car.updateMatrixWorld(true);
  const inverse = car.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const meshes: THREE.Mesh[] = [];
  let lampZ = 0; let lampCount = 0;
  car.traverse((o: any) => {
    if (!o.isMesh || !isVisible(o, car)) return;
    const owner = o.parent?.name || '';
    if (owner === 'license-plates' || owner === 'neon' || owner === 'minigun-root') return;
    for (let p = o.parent; p && p !== car; p = p.parent) if (p.name === 'toy-overlay') return; // Toybox-effecten
    if (o.geometry && !o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry?.boundingBox?.clone().applyMatrix4(o.matrixWorld).applyMatrix4(inverse);
    if (!b) return;
    meshes.push(o);
    box.union(b);
    if (/lowbeam/.test((o.material?.name || '').toLowerCase())) { lampZ += (b.min.z + b.max.z) / 2; lampCount++; }
  });
  if (box.isEmpty()) { car.rotation.copy(saved); car.updateMatrixWorld(true); return null; }
  const frontDir = lampCount && lampZ / lampCount < (box.min.z + box.max.z) / 2 ? -1 : 1;
  const height = box.max.y - box.min.y;
  // Straal van buiten de auto naar binnen, midden over de breedte, op de hoogte van het kenteken
  // Geeft de plek en de schuinte (om de X-as) van het oppervlak, zodat de plaat plat tegen de bumper ligt
  const hit = (y: number, dir: number, fallbackZ: number): { pos: [number, number, number]; tilt: number } => {
    const startLocal = new THREE.Vector3(0, box.min.y + y, dir > 0 ? box.max.z + 1 : box.min.z - 1);
    const start = startLocal.clone().applyMatrix4(car.matrixWorld);
    const toward = new THREE.Vector3(0, 0, -dir).transformDirection(car.matrixWorld);
    const ray = new THREE.Raycaster(start, toward);
    const first = ray.intersectObjects(meshes, false)[0];
    const z = first ? first.point.clone().applyMatrix4(inverse).z : fallbackZ;
    let tilt = 0;
    if (first?.face) {
      const n = first.face.normal.clone().transformDirection(first.object.matrixWorld).transformDirection(inverse);
      // Hoek van het oppervlak t.o.v. verticaal; begrensd, zodat een rare driehoek de plaat niet plat legt
      tilt = Math.max(-0.5, Math.min(0.5, Math.atan2(n.y, Math.abs(n.z)))) * (dir > 0 ? -1 : 1);
    }
    return { pos: [0, box.min.y + y, z + dir * 0.015], tilt }; // net voor het oppervlak
  };
  // Voor: op de gespoten bumper direct onder de grill (boven het zwarte deel); achter: laag, net boven de bumper
  const front = hit(height * 0.33, frontDir, frontDir > 0 ? box.max.z : box.min.z);
  const rear = hit(height * 0.33, -frontDir, frontDir > 0 ? box.min.z : box.max.z);
  car.rotation.copy(saved);
  car.updateMatrixWorld(true);
  // Achter: iets verder naar buiten en iets opzij (in het model staat het midden van de achterklep niet op X = 0)
  const rearPos: [number, number, number] = [REAR_PLATE_SHIFT_X, rear.pos[1], rear.pos[2] - frontDir * 0.012];
  return { frontDir, front: front.pos, rear: rearPos, frontTilt: front.tilt };
};

const LicensePlates: React.FC<{ text: string }> = ({ text }) => {
  const { scene } = useThree();
  const [spots, setSpots] = useState<PlateSpots | null>(null);
  // Na het laden van de auto meten (model komt via Suspense; een paar keer proberen)
  useEffect(() => {
    let tries = 0;
    const timer = window.setInterval(() => {
      const found = findPlateSpots(scene);
      if (found || ++tries > 20) { setSpots(found); window.clearInterval(timer); }
    }, 300);
    return () => window.clearInterval(timer);
  }, [scene]);
  const materials = useMemo(() => {
    const face = new THREE.MeshStandardMaterial({ map: makePlateTexture(text), roughness: 0.45, metalness: 0.1 });
    const edge = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.6 });
    // Dun plaatje (box): voorkant = kenteken, achterkant en randen zwart
    return [edge, edge, edge, edge, face, edge];
  }, [text]);
  useEffect(() => () => { materials[4].map?.dispose(); materials.forEach((m) => m.dispose()); }, [materials]);
  if (!spots) return null;
  return (
    <group name="license-plates">
      <mesh position={spots.front} rotation={[spots.frontTilt, spots.frontDir > 0 ? 0 : Math.PI, 0, 'YXZ']} material={materials}>
        <boxGeometry args={[PLATE_W, PLATE_H, 0.012]} />
      </mesh>
      {/* Achter recht op (de achterklep is daar vlak); alleen voor volgt de schuinte van de bumper */}
      <mesh position={spots.rear} rotation={[0, spots.frontDir > 0 ? Math.PI : 0, 0]} material={materials}>
        <boxGeometry args={[PLATE_W, PLATE_H, 0.012]} />
      </mesh>
    </group>
  );
};

// --- HOOFD COMPONENT ---
// widthFraction = breedte van dit paneel als deel van het scherm (1 = vol, 0.3 = Settings open), zie SplashScreen.
// Toybox > Regenboogvloer: draaiende regenboogschijf onder de auto (vervaagt naar de rand)
// Studio (zoals de auto in een showroom staat): muur, vloer en een lichtvlek onder de auto, als CSS-verloop achter
// het (doorzichtige) canvas. Licht: lichtgrijze studio; donker: donkere studio met een zachte lamp boven de auto.
// De studio wordt één keer als plaatje getekend (canvas 2D) en als achtergrond gebruikt. Geen CSS-verlopen en geen
// 3D-vloer: op allebei crashte de software-GPU van de emulator (SwiftShader) zodra het 3D-canvas erboven tekende
// (6-11-2026). Een plaatje is voor elke GPU het lichtst. Per thema (licht/donker) onthouden.
const studioCache: Record<string, string> = {};
const studioBackground = (dark: boolean): string => {
  const key = dark ? 'dark' : 'light';
  if (studioCache[key]) return studioCache[key];
  try {
    const w = 640, h = 400;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d')!;
    // Muur boven, vloer onder (zachte overgang)
    const wall = c.createLinearGradient(0, 0, 0, h);
    const stops = dark
      ? [[0, '#141518'], [0.42, '#1b1d21'], [0.6, '#111214'], [1, '#08090a']]
      : [[0, '#e2e2e7'], [0.42, '#eeeef2'], [0.6, '#dddde3'], [1, '#cfcfd6']];
    stops.forEach(([o, col]) => wall.addColorStop(o as number, col as string));
    c.fillStyle = wall;
    c.fillRect(0, 0, w, h);
    // Ellips: radiaal verloop in een geschaalde cirkel
    const ellipse = (cx: number, cy: number, rx: number, ry: number, colors: [number, string][]) => {
      c.save();
      c.translate(cx, cy);
      c.scale(1, ry / rx);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
      colors.forEach(([o, col]) => g.addColorStop(o, col));
      c.fillStyle = g;
      c.fillRect(-rx, -rx, rx * 2, rx * 2);
      c.restore();
    };
    // Lichtere plek op de muur achter de auto
    ellipse(w * 0.5, h * 0.42, w * 0.7, h * 0.45, dark
      ? [[0, 'rgba(43,47,54,1)'], [0.45, 'rgba(27,29,34,0.8)'], [1, 'rgba(27,29,34,0)']]
      : [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(240,240,243,0.8)'], [1, 'rgba(240,240,243,0)']]);
    // Lichtvlek op de vloer onder de auto
    ellipse(w * 0.5, h * 0.63, w * 0.34, h * 0.13, dark
      ? [[0, 'rgba(120,128,142,0.45)'], [0.45, 'rgba(70,76,88,0.25)'], [1, 'rgba(70,76,88,0)']]
      : [[0, 'rgba(255,255,255,0.95)'], [0.45, 'rgba(250,250,252,0.6)'], [1, 'rgba(250,250,252,0)']]);
    studioCache[key] = `url(${canvas.toDataURL('image/png')})`;
  } catch {
    studioCache[key] = 'none';
  }
  return studioCache[key];
};

const RainbowFloor: React.FC = () => {
  const ref = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const c = canvas.getContext('2d')!;
    const mid = size / 2;
    for (let a = 0; a < 360; a += 2) { // regenboog in taartpunten (createConicGradient bestaat niet in elke WebView)
      c.fillStyle = `hsl(${a}, 90%, 55%)`;
      c.beginPath();
      c.moveTo(mid, mid);
      c.arc(mid, mid, mid, (a * Math.PI) / 180, ((a + 2.5) * Math.PI) / 180);
      c.fill();
    }
    c.globalCompositeOperation = 'destination-in';
    const fade = c.createRadialGradient(mid, mid, mid * 0.35, mid, mid, mid);
    fade.addColorStop(0, 'rgba(0,0,0,0.85)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = fade;
    c.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }, []);
  useFrame((_, delta) => { if (ref.current) ref.current.rotation.z += delta * 0.4; });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
      <circleGeometry args={[3.2, 64]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
};

const SidebarPane: React.FC<{ widthFraction?: number }> = ({ widthFraction = 1 }) => {
  const { 
    btDevices, btConnectedAddress, gear, speed, brakeApplied, screenMode, vehicleLightsOn, displaySettings, vehicleSettings,
    carState, safetySettings, speedLimit, toyCar
  } = useUIStore();
  // Toybox > Voertuig: zolang het speeltje aan staat, toont het model de speelstand in plaats van de auto
  // Toybox-effecten op de 3D-auto (ToyEffects.tsx): lichtshow, weer, wasstraat, boost, feestdagen
  const isPlaying = useUIStore((st) => st.isPlaying);
  const toyFx = useUIStore((st) => st.toyFx);
  const lightShowActive = !!vehicleSettings.lightShow?.on && (!vehicleSettings.lightShow.onlyWhilePlaying || isPlaying);
  const weatherFx = useWeatherFx(vehicleSettings.weatherFx);
  const washing = useActiveFor(toyFx.wash, WASH_MS);
  const boosting = useActiveFor(toyFx.boost, BOOST_MS);
  const holiday = useHolidays(vehicleSettings.holidays !== false, toyFx.holidayPreview);
  const shownCarState: CarState = toyCar ? { ...carState, lights: toyCar.lights, highBeam: toyCar.highBeam, blinker: toyCar.blinker, doors: toyCar.doors } : carState;
  
  const isBluetoothConnected = btConnectedAddress !== null || btDevices.some(device => device.connected);
  const currentTrackForBar = useUIStore((st) => st.currentTrack);
  
  const [isDarkMode, setIsDarkMode] = useState(getEffectiveTheme(screenMode) === 'dark');

  useEffect(() => { 
    setIsDarkMode(getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark');
  }, [screenMode, vehicleLightsOn]);

  const isDriving = ['R', 'D', '1', '2', '3', '4', '5', '6'].includes(gear) || speed > 0;

  // Snelheidswaarschuwing (Settings > Safety): snelheid rood boven limiet + marge, met Chime ook een piep
  const isSpeeding = safetySettings.speedWarning && speedLimit !== null && speed > speedLimit + safetySettings.offset;
  useEffect(() => {
    if (!isSpeeding || !safetySettings.chime) return;
    try {
      const audio = new AudioContext();
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.4);
      tone.connect(gain).connect(audio.destination);
      tone.start();
      tone.stop(audio.currentTime + 0.4);
      tone.onended = () => audio.close();
    } catch {
      // Geen geluid mogelijk (bijv. nog geen interactie met de pagina): alleen de rode snelheid
    }
  }, [isSpeeding, safetySettings.chime]);
  // Flitspaal: een korte dubbele piep bij de eerste waarschuwing (Settings > Safety)
  const cameraAhead = useUIStore((st) => st.cameraAhead);
  useEffect(() => {
    if (!cameraAhead?.chime) return;
    try {
      const audio = new AudioContext();
      [0, 0.25].forEach((at) => {
        const tone = audio.createOscillator(); const gain = audio.createGain();
        tone.frequency.value = 1180;
        gain.gain.setValueAtTime(0.18, audio.currentTime + at);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + at + 0.18);
        tone.connect(gain).connect(audio.destination);
        tone.start(audio.currentTime + at); tone.stop(audio.currentTime + at + 0.18);
      });
      window.setTimeout(() => audio.close(), 800);
    } catch { /* geen geluid */ }
  }, [cameraAhead?.chime]);
  const isBigScreen = screenMode === 'visualizer';

  // --- AUTO DRAAIEN (alleen in Park) ---
  const canRotate = gear === 'P' && !isDriving;
  const [userYaw, setUserYaw] = useState(0);
  const dragRef = useRef<{ x: number; yaw: number } | null>(null);
  // Was de laatste aanraking een sleepbeweging? Dan telt hij niet als klik (die sluit anders het open menu).
  const draggedRef = useRef(false);

  // Zodra je gaat rijden of Park verlaat, springt de auto terug naar de standaardstand.
  useEffect(() => {
    if (!canRotate) { setUserYaw(0); dragRef.current = null; }
  }, [canRotate]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggedRef.current = false;
    if (!canRotate) return;
    dragRef.current = { x: e.clientX, yaw: userYaw };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    if (Math.abs(e.clientX - dragRef.current.x) > 5) draggedRef.current = true;
    // Pas draaien na 5 px: een gewone klik (bijv. om Settings te sluiten) mag de auto niet een klein beetje verdraaien
    if (draggedRef.current) setUserYaw(dragRef.current.yaw + (e.clientX - dragRef.current.x) * 0.01);
  };
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggedRef.current) e.stopPropagation();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // --- COÖRDINATEN LOGICA ---
  let cameraPosition: [number, number, number] = [0.20, 1.20, 9.50]; 
  // car.glb (Golf 6): Y is boven, neus wijst naar +Z. Geen pitch (x) meer, anders staat de auto met de neus omlaag.
  let carRotation: [number, number, number] = [0.00, -0.66, 0.00];

  // In R: bovenaanzicht, auto met de neus naar boven (zoals Tesla bij achteruitrijden)
  const reversing = toyCar ? toyCar.reverse : gear === 'R';
  if (reversing) {
    cameraPosition = [0.00, 9.00, 0.60];
    carRotation = [0.00, Math.PI, 0.00];
  } else if (isDriving) {
    cameraPosition = [0.20, 1.80, 13.80];
    carRotation = [0.00, Math.PI, 0.00]; // auto van achteren gezien
  } else if (isBigScreen) {
    cameraPosition = [0.20, 1.20, 7.80];
    carRotation = [0.00, -0.66, 0.00];
  }

  // --- AUTO MEESCHUIVEN MET HET PANEEL ---
  // Het canvas blijft altijd schermbreed (100vw), zodat WebGL niet bij elke animatiestap opnieuw van grootte hoeft
  // te veranderen. Als het paneel smaller wordt, schuift en krimpt het canvas met een CSS-transform. Die gebruikt
  // dezelfde duur en curve als de breedte-animatie in SplashScreen, dus de auto beweegt precies mee.
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasHeight, setCanvasHeight] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setCanvasHeight(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cameraDistance = new THREE.Vector3(...cameraPosition).sub(CAMERA_TARGET).length();
  const vehicleModel = getVehicleModel(vehicleSettings.model);
  const carHalfPx = (canvasHeight * vehicleModel.halfLength) / (2 * cameraDistance * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)));
  const paneHalfPx = (widthFraction * window.innerWidth) / 2;
  const carScale = carHalfPx > 0 ? Math.max(0.2, Math.min(1, paneHalfPx / carHalfPx)) : 1;
  // Studio alleen op het startscherm (auto over het hele scherm); met Instellingen of een app open: alleen de auto
  const showStudio = vehicleSettings.studioScene !== false && widthFraction >= 0.99;
  const canvasTransform = `translateX(${-(1 - widthFraction) * 50}vw) scale(${carScale})`;

  const speedUnit = displaySettings?.distance === 'Kilometers' ? 'KM/H' : 'MPH';
  const lowGraphics = vehicleSettings.graphics === 'Low';
  // Brandstof: percentage of actieradius (Settings > Display > Energy Display), alleen als de auto het doorgeeft
  // (carState.fuelPercent/rangeKm via CAN-kastje of OBD2). Onbekend = niets tonen, geen verzonnen waarde.
  const range = carState.rangeKm;
  const energyDisplay = displaySettings?.energyDisplay === 'Percentage'
    ? (carState.fuelPercent != null ? `${Math.round(carState.fuelPercent)}%` : null)
    : (range != null ? (displaySettings?.distance === 'Kilometers' ? `${Math.round(range)} km` : `${Math.round(range * 0.621)} mi`) : null);

  // Versnellingsweergave: automaat P R N D; handgeschakeld P R D, want zonder OBD2 is de versnelling (1-6)
  // niet uit te lezen. P = stilstand, D = rijden (GPS), R = achteruit-signaal van de radio.
  // Automatisch herkennen: wat de auto doorgeeft (CAN/OBD2); zolang dat onbekend is P R N D
  const transmission = vehicleSettings.transmission === 'Detect' ? (carState.detectedTransmission ?? 'Automatic') : vehicleSettings.transmission;
  const isManual = transmission === 'Manual';
  // Open deuren, zoals in het dashboard van de auto (ook als melding bij het opengaan, zie setCarState)
  const openDoors = (Object.keys(carState.doors) as DoorId[]).filter((d) => carState.doors[d]);
  const t = useT();
  const gearLabels = isManual ? ['P', 'R', 'D'] : ['P', 'R', 'N', 'D'];
  const activeGearLabel = isManual && !['P', 'R'].includes(gear) ? 'D' : gear;

  return (
    <aside 
      // Nieuwe classname om styling conflicten uit je SCSS te negeren
      className="panda-sidebar-view" 
      style={{ 
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        // React forceert nu 100% de achtergrond kleur:
        backgroundColor: isDarkMode ? '#111111' : '#e5e5ea',
        // Studio-achtergrond (Instellingen > Voertuig > Studio); uit = effen kleur zoals voorheen
        backgroundImage: showStudio ? studioBackground(isDarkMode) : 'none',
        backgroundSize: '100% 100%',
        transition: 'background-color 0.3s ease',
        height: '100%', width: '100%', overflow: 'hidden', position: 'relative'
      }}
    >
      {/* --- VERSNELLING EN BRANDSTOF (links boven, zodat ze nooit met de statusbalk rechts botsen) --- */}
      <div style={{
         position: 'absolute', top: 0, left: 0, right: 0, padding: '18px 25px',
         display: 'flex', alignItems: 'flex-start', gap: '28px', zIndex: 20
      }}>
         {/* Versnelling met daaronder de controlelampjes (licht, knipperlicht, gordel) */}
         <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
         {/* Automaat: P R N D. Handgeschakeld: N, R of de versnelling (1-6), uit Settings > Vehicle > Transmission */}
         <div style={{ display: 'flex', gap: '15px', fontSize: 'calc(20px * var(--text-scale, 1))', fontWeight: '800', color: isDarkMode ? '#555' : '#aaa' }}>
           {gearLabels.map(g => (
              <span key={g} style={{ color: g === activeGearLabel ? (isDarkMode ? '#fff' : '#000') : '' }}>{g}</span>
           ))}
         </div>
         <WarningLights />
         </div>
         {/* Brandstof (tankniveau/actieradius van de auto); verborgen zolang onbekend */}
         {energyDisplay && <div style={{ fontWeight: '600', fontSize: 'calc(18px * var(--text-scale, 1))', display: 'flex', alignItems: 'center', gap: '8px', color: isDarkMode ? '#fff' : '#555' }}>
           <Fuel size={20} strokeWidth={2.2} />
           {energyDisplay}
         </div>}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        
        {/* Speedometer */}
        {isDriving && (
          <div style={{ textAlign: 'center', position: 'absolute', top: '80px', width: '100%', zIndex: 10, pointerEvents: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
              <div style={{ fontSize: '80px', fontWeight: 'bold', color: isSpeeding ? '#ed4e3b' : (isDarkMode ? '#fff' : '#000'), lineHeight: 1 }}>{speed}</div>
              {/* Maximumsnelheidsbord (Settings > Safety > Show Speed Limit) */}
              {safetySettings.showSpeedLimit && speedLimit !== null && (
                <div style={{ width: 48, height: 48, borderRadius: '50%', border: '5px solid #ed4e3b', background: '#fff', color: '#000',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'calc(18px * var(--text-scale, 1))', fontWeight: 'bold', boxSizing: 'border-box' }}>
                  {speedLimit}
                </div>
              )}
            </div>
            <div style={{ fontSize: 'calc(16px * var(--text-scale, 1))', color: '#888', fontWeight: 'bold' }}>{speedUnit}</div>
          </div>
        )}

        {/* Flitspaal vóór de auto (OpenStreetMap): afstand en de snelheid van de paal */}
        {isDriving && cameraAhead && (
          <div style={{ position: 'absolute', top: '185px', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 12, pointerEvents: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px',
              background: 'rgba(237, 78, 59, 0.14)', color: '#ed4e3b', fontWeight: 600, fontSize: 'calc(14px * var(--text-scale, 1))' }}>
              <Cctv size={18} />
              {t(cameraAhead.kind === 'section' ? 'Section control' : 'Speed camera')} · {cameraAhead.distance} m{cameraAhead.maxspeed ? ` · ${cameraAhead.maxspeed} km/h` : ''}
            </div>
          </div>
        )}

        {/* Deur(en) open: rode aanduiding in het midden, onder de snelheid */}
        {openDoors.length > 0 && (
          <div style={{ position: 'absolute', top: isDriving ? '185px' : '70px', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 11, pointerEvents: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px',
              background: 'rgba(237, 78, 59, 0.12)', color: '#ed4e3b', fontWeight: 600, fontSize: 'calc(14px * var(--text-scale, 1))' }}>
              <DoorOpen size={18} />
              {openDoors.length > 1 ? t('DOORS OPEN') : t(DOOR_LABELS[openDoors[0]])}
            </div>
          </div>
        )}

        {/* 3D Visualizer */}
        <div
          ref={containerRef}
          className="car-visualization-container"
          style={{ flex: 1, position: 'relative', overflow: 'hidden', touchAction: 'none', cursor: canRotate ? 'grab' : 'default' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClickCapture={onClickCapture}
        >
          <div style={{
            position: 'absolute', top: 0, left: 0, height: '100%', width: '100vw',
            transform: canvasTransform, transformOrigin: 'center center',
            transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)', // gelijk aan de paneel-animatie in SplashScreen
            willChange: 'transform'
          }}>
          {/* offsetSize: meet de echte (ongeschaalde) grootte. getBoundingClientRect telt de CSS-transform hierboven mee,
              waardoor het canvas zich soms op de verkleinde maat instelde en de auto versprong. */}
          {/* Grafische kwaliteit (Settings > Vehicle): Laag = geen schaduwen, 1 pixel per pixel, geen anti-aliasing.
              Hoog: maximaal 1,5x pixels (scherp genoeg op een radioscherm, veel lichter dan 2x). */}
          <Canvas key={lowGraphics ? 'low' : 'high'} frameloop="demand" shadows={!lowGraphics} dpr={lowGraphics ? 1 : [1, 1.5]}
            gl={{ antialias: !lowGraphics, powerPreference: 'high-performance' }} resize={{ offsetSize: true }}>
            <Suspense fallback={null}>
              <ambientLight intensity={isDarkMode ? 0.3 : 0.7} />
              <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow={!lowGraphics} />
              {/* Lichtomgeving uit de app zelf (public/hdr), niet van internet: zonder internet viel de app anders om */}
              <Environment files={isDarkMode ? HDR_NIGHT : HDR_CITY} />

              <SnapshotBridge />
              <RenderOnDemand
                continuous={dragRef.current != null
                  || (shownCarState.blinker != null && shownCarState.blinker !== 'off')
                  || (!!vehicleSettings.neon?.on && vehicleSettings.neon.effect !== 'steady')
                  || !!vehicleSettings.rainbowFloor
                  // Toybox: alleen zolang het effect echt loopt (kerstlampjes twinkelen op het vangnet van 1 beeld/s)
                  || lightShowActive || !!weatherFx || washing || boosting || holiday.fireworks}
                deps={[userYaw, carRotation[0], carRotation[1], carRotation[2], isDarkMode, widthFraction, String(cameraPosition)]} />
              <FitCamera position={cameraPosition} halfLength={vehicleModel.halfLength} topDown={reversing} />
              
              <CarModel 
                key={vehicleModel.id} // ander model = nieuwe component (schone materialen en state)
                model={vehicleModel}
                carRot={[carRotation[0], carRotation[1] + userYaw, carRotation[2]]} baseYaw={carRotation[1]}
                brakeApplied={toyCar ? toyCar.brake : brakeApplied}
                gear={toyCar ? (toyCar.reverse ? 'R' : 'P') : gear}
                carState={shownCarState}
                vehicle={vehicleSettings}
                lightShow={lightShowActive ? vehicleSettings.lightShow : null}
              >
                {vehicleSettings.neon?.on && <NeonUnderglow neon={vehicleSettings.neon} />}
                {vehicleSettings.minigun && <Suspense fallback={null}><Minigun /></Suspense>}
                {!vehicleSettings.licensePlateHidden && vehicleSettings.licensePlate?.trim() && <LicensePlates text={vehicleSettings.licensePlate.trim()} />}
                <ToyOverlays weather={weatherFx} washAt={washing ? toyFx.wash : 0} boostAt={boosting ? toyFx.boost : 0}
                  christmas={holiday.christmas} fireworks={holiday.fireworks} lowered={Number(vehicleSettings.lowered) || 0}
                  paintMaterial={vehicleModel.paintMaterial} minigun={!!vehicleSettings.minigun} />
              </CarModel>

              {vehicleSettings.rainbowFloor && <RainbowFloor />}

              {/* Vaste schaduw op de "vloer" (Y=0); niet bij snelle weergave. frames={60}: de auto staat stil, dus na het
                  laden niet elk beeldje opnieuw berekenen (scheelt veel rekenwerk) */}
              {!lowGraphics && <group name="contact-shadows"><ContactShadows 
                position={[0, -0.01, 0]} 
                opacity={isDarkMode ? 0.8 : 0.3} 
                scale={15} 
                blur={2} 
                far={4.5} 
                frames={60}
              /></group>}
            </Suspense>
          </Canvas>
          </div>
        </div>
      </div>

      {/* Music Bar: zwevende kaart over de auto (absoluut), zodat het 3D-canvas niet kleiner wordt en de auto niet verspringt */}
      {/* Muziekbalk. Auto over het hele scherm (Figma Mockups > Car status): onderaan in het midden, naast het kaartje
          Navigeren. Met een pagina rechts open: ingeklapt linksonder bij de auto. Ook zonder Bluetooth-verbinding die
          PandaOS ziet (Bluetooth-module van de radio): zodra er iets speelt. */}
      {widthFraction >= 0.99 ? (
        <div className="sidebar-home-cards" style={{ position: 'absolute', left: 0, right: 0, bottom: '15px', zIndex: 10,
          display: 'flex', justifyContent: 'center', alignItems: 'stretch', gap: '12px', pointerEvents: 'none' }}>
          {/* Muziekbalk altijd naast Navigeren, ook als er niets speelt (dan "Niets aan het afspelen") */}
          <div style={{ width: 400, pointerEvents: 'auto' }}><MusicBar /></div>
          <div style={{ width: 260, pointerEvents: 'auto' }}><NavigateCard /></div>
        </div>
      ) : (isBluetoothConnected || !!currentTrackForBar) && (
        <div className="sidebar-music-container" style={{ position: 'absolute', left: '15px', right: '15px', bottom: '15px', zIndex: 10 }}>
          <MusicBar />
        </div>
      )}
    </aside>
  );
};

export default SidebarPane;