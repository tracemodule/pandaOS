// De auto van David: de standaardinstellingen van PandaOS zijn hierop afgestemd, zodat alles meteen klopt
// (versnellingsbak, CAN-protocol, koplampen, uiterlijk van het 3D-model ...). Bron: RDW-gegevens.
// Getoond in Settings > Geavanceerd > Mijn auto.
import type { VehicleSettings } from './uiStore';

export const MY_VEHICLE = {
  name: 'Volkswagen Golf 6 Trendline',
  year: '2010',
  color: 'Reflex silver metallic',
  engine: '1.4 TSI (CAX), 90 kW / 123 hp, turbo',
  fuel: 'Petrol',
  transmission: '6-speed manual',
  tank: 55, // liter
  tyres: '205/55 R16',
  oil: '5W-30, 3.6 l',
  oilInterval: '15,000 km / 12 months',
  service: '30,000 km / 1 year',
  coolantInterval: '48 months / 60,000 km',
  canProtocol: 'VW PQ35',
};

// Instellingen die bij deze auto horen (standaard bij een nieuwe installatie, en via "Toepassen" in Geavanceerd)
export const MY_VEHICLE_SETTINGS: Partial<VehicleSettings> = {
  model: 'golf6',
  transmission: 'Manual', // 6 versnellingen, handgeschakeld
  paintColor: '#9ea3a8', // reflexzilver
  windowTint: 'None', // Trendline: geen getinte ruiten af fabriek
  headlightType: 'halogen', // Trendline: geen xenon
  mirrors: 'body',
  grille: 'standard',
  exhaust: 'left1', // 1.4 TSI: één uitlaat links
  canbox: 'radio',
  canProtocol: 'vw-pq35', // Golf 6 = PQ35-platform
};
