// CAN-koppelingen (CAN-monitor > Koppelen): welke functies je kunt koppelen en wat een binnenkomend signaal met de
// auto in PandaOS doet. De launcher (CanLinks.kt) herkent de gekoppelde regels/broadcasts en roept
// window.PandaOS.canSignal({func, action, value}) aan; hier wordt dat de echte autostatus (3D-model, P R D, meldingen).
import { useUIStore, type DoorId } from '../store/uiStore';
import { diag } from './diagnostics';

export type CanAction = 'on' | 'off' | 'value';
export interface CanLink { id: string; func: string; action: CanAction; match: string; source: 'logcat' | 'broadcast' }
export interface CanFunction {
  id: string;
  label: string; // Engels, vertaald via t()
  group: 'Drive' | 'Doors' | 'Lights' | 'Values';
  kind: 'switch' | 'value'; // switch: aan/uit leren; value: een getal uit de regel
  hint: string; // wat je in de auto doet tijdens het leren
  unit?: string;
}

export const CAN_FUNCTIONS: CanFunction[] = [
  { id: 'reverse', label: 'Reverse', group: 'Drive', kind: 'switch', hint: 'Shift into reverse (on) or out of reverse (off).' },
  { id: 'handbrake', label: 'Handbrake', group: 'Drive', kind: 'switch', hint: 'Pull the handbrake (on) or release it (off).' },
  { id: 'door_fl', label: 'Front left door', group: 'Doors', kind: 'switch', hint: 'Open (on) or close (off) the front left door.' },
  { id: 'door_fr', label: 'Front right door', group: 'Doors', kind: 'switch', hint: 'Open (on) or close (off) the front right door.' },
  { id: 'door_rl', label: 'Rear left door', group: 'Doors', kind: 'switch', hint: 'Open (on) or close (off) the rear left door.' },
  { id: 'door_rr', label: 'Rear right door', group: 'Doors', kind: 'switch', hint: 'Open (on) or close (off) the rear right door.' },
  { id: 'trunk', label: 'Tailgate', group: 'Doors', kind: 'switch', hint: 'Open (on) or close (off) the tailgate.' },
  { id: 'parking', label: 'Parking lights', group: 'Lights', kind: 'switch', hint: 'Turn the light switch to parking lights (on) or off (off).' },
  { id: 'low', label: 'Low beam', group: 'Lights', kind: 'switch', hint: 'Turn the light switch to low beam (on) or off (off).' },
  { id: 'high', label: 'High beam', group: 'Lights', kind: 'switch', hint: 'High beam on (on) or off (off).' },
  { id: 'blinker_left', label: 'Left indicator', group: 'Lights', kind: 'switch', hint: 'Left indicator on (on) or off (off).' },
  { id: 'blinker_right', label: 'Right indicator', group: 'Lights', kind: 'switch', hint: 'Right indicator on (on) or off (off).' },
  { id: 'hazard', label: 'Hazard lights', group: 'Lights', kind: 'switch', hint: 'Hazard lights on (on) or off (off).' },
  { id: 'speed', label: 'Speed', group: 'Values', kind: 'value', unit: 'km/h', hint: 'Drive a short distance so the speed changes.' },
  { id: 'fuel', label: 'Fuel level', group: 'Values', kind: 'value', unit: '%', hint: 'The fuel level line usually comes by itself; wait a moment.' },
  { id: 'outside_temp', label: 'Outside temperature', group: 'Values', kind: 'value', unit: '°C', hint: 'The temperature line usually comes by itself; wait a moment.' },
  { id: 'range', label: 'Range', group: 'Values', kind: 'value', unit: 'km', hint: 'The range line usually comes by itself; wait a moment.' },
];

const bridge = () => (window as any).PandaAndroid;

export const getCanLinks = (): CanLink[] => {
  try { return JSON.parse(bridge()?.canLinksGet?.() ?? '[]'); } catch { return []; }
};
export const saveCanLinks = (links: CanLink[]): boolean => bridge()?.canLinksSave?.(JSON.stringify(links)) === true;

// Tekst om op te zoeken uit een gekozen regel: het bericht na "tag( pid): ", zonder getallen aan het eind
// (bij 'value' tot aan het eerste getal, want dat getal is de waarde)
export const suggestMatch = (text: string, action: CanAction, source: CanLink['source']): string => {
  if (source === 'broadcast') return text.split(' ')[0];
  const message = text.replace(/^[VDIWEF]\/[^(:]*\(\s*\d+\):\s*/, '').trim();
  if (action === 'value') {
    const m = message.match(/^(.*?[a-zA-Z_][^0-9-]*?)\s*[:=]?\s*-?\d/);
    return (m ? m[1] : message).trim().slice(0, 80);
  }
  return message.replace(/[\s:=]*-?\d+(?:[.,]\d+)?\s*$/, '').trim().slice(0, 120);
};

// Signaal van de launcher toepassen op de auto in PandaOS
export const applyCanSignal = (signal: { func: string; action: CanAction; value: string }) => {
  const store = useUIStore.getState();
  const on = signal.action === 'on';
  const num = parseFloat(signal.value);
  const doors: Record<string, DoorId> = { door_fl: 'fl', door_fr: 'fr', door_rl: 'rl', door_rr: 'rr', trunk: 'trunk' };
  if (signal.action !== 'value') diag('info', 'can', `${signal.func}: ${signal.action}`);

  switch (signal.func) {
    case 'reverse': store.setReverseSignal(on); break;
    case 'handbrake': useUIStore.setState({ brakeApplied: on }); break;
    case 'parking': store.setCarState({ lights: on ? 'parking' : 'off' }); break;
    case 'low': store.setCarState({ lights: on ? 'low' : (store.carState.lights === 'low' ? 'parking' : store.carState.lights) }); break;
    case 'high': store.setCarState({ highBeam: on }); break;
    case 'blinker_left': store.setCarState({ blinker: on ? 'left' : 'off' }); break;
    case 'blinker_right': store.setCarState({ blinker: on ? 'right' : 'off' }); break;
    case 'hazard': store.setCarState({ blinker: on ? 'hazard' : 'off' }); break;
    case 'speed': if (!isNaN(num)) store.setGpsSpeed(Math.max(0, Math.round(num))); break;
    case 'fuel': if (!isNaN(num)) store.setCarState({ fuelPercent: Math.max(0, Math.min(100, num)) }); break;
    case 'outside_temp': if (!isNaN(num)) store.setCarState({ outsideTemp: num }); break;
    case 'range': if (!isNaN(num)) store.setCarState({ rangeKm: Math.max(0, num) }); break;
    default:
      if (doors[signal.func]) store.setCarState({ doors: { [doors[signal.func]]: on } });
  }
};
