// Beschikbare 3D-voertuigen voor Settings > Vehicle.
//
// Een model toevoegen:
// 1. Zet het .glb-bestand in client/public/models/ (bijv. van Sketchfab, met een licentie die dat toestaat).
// 2. Voeg hieronder een regel toe. Zoek de onderdeelnamen op in het model (bijv. met gltf.report of three.js editor).
//    Namen zijn de door GLTFLoader gesaneerde node-namen: kleine letters vergelijken, punten verdwijnen ("a.001" -> "a001").
//    Onderdeelnamen nog niet uitgezocht? Gebruik dan `...DEFAULT_PARTS` voor de algemene herkenning.

export interface VehicleModel {
  id: string;
  name: string;
  url: string;
  scale: number;
  halfLength: number; // halve lengte in scene-eenheden (na schaal) plus marge; camera houdt dit in beeld
  paintMaterial: RegExp; // materiaalnaam van de lak
  rimParts: RegExp; // naam van de oudernode van de velg-meshes
  // Wielen (banden, velgen, naven): node-namen (kleine letters) die op hun plek blijven als de carrosserie lager gaat
  // (Toybox > Spuiterij > Verlagen). Moeten directe kinderen van dezelfde node zijn als de rest van de auto.
  // Niet ingesteld = verlagen kan niet bij dit model.
  wheelParts?: RegExp;
  frontGlass: RegExp; // voorruit + voorportierramen: altijd licht (wettelijk)
  rearGlass: RegExp; // achterste ramen: krijgen de gekozen tint
  strayParts: string[]; // volledige node-namen van onderdelen die verwijderd moeten worden (exacte match)
  lightGlass?: RegExp; // glas van koplampen/achterlichten: helder maken (sommige modellen hebben getint glas)
  tailLightGlass?: RegExp; // glas van de achterlichten: licht rood op met de lichten aan / bij remmen
  reverseLightGlass?: RegExp; // glas over het achteruitrijlicht: wit bij R, anders zoals de achterlichten
  // Koplampuitvoeringen die tegelijk in het model zitten; alleen de gekozen blijft zichtbaar (Settings > Vehicle)
  headlightTypes?: Record<'halogen' | 'xenon', string[]>;
  materialColors?: Record<string, string>; // materiaalnaam -> vaste kleur (bijv. bonte binnendelen neutraal maken)
  // Lampen: materiaalnaam (kleine letters) per functie; die materialen gaan gloeien (SidebarPane, CarModel)
  lights?: Partial<Record<'lowBeam' | 'highBeam' | 'parkingLeft' | 'parkingRight' | 'signalLeft' | 'signalRight' | 'tail' | 'brake' | 'reverse', RegExp>>;
  // Deuren: node-namen die samen draaien (deur + ruit), scharnier aan de voorste buitenhoek
  doors?: Partial<Record<'fl' | 'fr' | 'rl' | 'rr', string[]>>;
  // Uitlaat: node-namen van één uitlaatpunt; de gekozen opstelling (Settings > Vehicle) wordt daarvan gemaakt.
  // spacing = afstand tussen twee punten aan dezelfde kant (scene-eenheden van het model)
  exhaust?: { parts: string[]; spacing: number };
  // Onderdelen die bij het laden uit een grotere mesh worden geknipt om een eigen kleur te krijgen
  // (Settings > Vehicle: spiegels, grill). Driehoeken waarvan het midden in box ligt
  // (model-ruimte: [xmin, xmax, ymin, ymax, zmin, zmax]) van meshes onder node (regex) met dat materiaal.
  trim?: Partial<Record<'mirrors' | 'grille', TrimRegion[]>>;
}

export interface TrimRegion {
  node: RegExp; // naam van de oudernode (kleine letters)
  material: RegExp; // materiaalnaam (kleine letters)
  box: [number, number, number, number, number, number];
}

// Algemene herkenning voor modellen zonder eigen regels
export const DEFAULT_PARTS = {
  paintMaterial: /paint|body|carpaint/,
  rimParts: /rim|wheel_?disc|velg/,
  frontGlass: /windshield|windscreen|front.*(glass|window)/,
  rearGlass: /rear.*(glass|window)|(glass|window).*rear|back.*(glass|window)/,
  strayParts: [] as string[],
};

export const VEHICLE_MODELS: VehicleModel[] = [
  {
    id: 'golf6',
    name: 'Volkswagen Golf 6',
    url: '/models/car.glb',
    scale: 1.2,
    halfLength: 3.0, // 4,27 m × 1,2 / 2 plus marge
    // Velgen: KLP/KLZ/KPP/KPZ = Pools voor links-voor/links-achter/rechts-voor/rechts-achter; "_tex" is de velg, "_p1b" de band
    paintMaterial: /^vgolf6_paint$/,
    rimParts: /^k[lp][pz]_tex$/,
    // Banden (_p1b), velgen (_tex) en naven blijven staan bij verlagen; ruimte tussen band en wielkast is ~6 cm
    wheelParts: /^k[lp][pz]_(p1b|tex)$|^(vgolf6|vivace)_hub_/,
    frontGlass: /doorglass_f[lr]|windshield/,
    rearGlass: /doorglass_r[lr]|tailgateglass/,
    // Los van de auto: uitlaatpunten 7 m erachter, letter 2,9 m erboven, bodemplaat ernaast,
    // en een wieldopje midden onder de auto dat 0,22 onder de grond uitsteekt (auto stond daardoor te hoog)
    // Uitlaten: het model bevat meerdere varianten tegelijk; die verdwijnen allemaal. Het uitlaatpunt links
    // (exhaust_tips_c + _c001) is de basis voor de gekozen opstelling (zie exhaust hieronder).
    strayParts: [
      'vgolf6_exhaust_tips_a', 'vgolf6_lettering_s001', 'vgolf6_skidplate', 'vgolf6_hubcap_02a_16',
      'vgolf6_exhaust_tips_b', 'vgolf6_exhaust_race', 'vgolf6_exhaustpipe_double', 'vgolf6_exhaustpipe_single',
      // Uitlaatbuis onder de auto: eindigt in twee pijpen midden achter, die niet bij de gekozen opstelling horen
      'vgolf6_exhaust',
      // Race-achterbumper met diffuser en twee grote zwarte middenpijpen; ligt over de gewone achterbumper heen
      'vgolf6_bumper_race_r',
    ],
    // Koplampglas is in dit model groen getint (vivace_glass), waardoor de koplampen groen oogden
    lightGlass: /headlightglass/,
    // Buitenste achterlichten (op de zijkant) en het binnenste deel op de achterklep, waar het achteruitrijlicht zit
    tailLightGlass: /taillightsglass/,
    reverseLightGlass: /tailgate_a_lightglass/,
    // headlight_L/R = halogeen (los knipperlicht), headlight_L/R_high = xenon-uitvoering (met dagrijlichtstrip)
    headlightTypes: {
      halogen: ['vgolf6_headlight_L', 'vgolf6_headlight_R'],
      xenon: ['vgolf6_headlight_L_high', 'vgolf6_headlight_R_high'],
    },
    // Binnendelen die door het glas en langs de banden zichtbaar zijn: groen interieur, rood interieur-accent,
    // lichtgrijze motor/ophanging. Neutraal donkergrijs, zoals een echte auto er van buiten uitziet.
    materialColors: {
      vivace_interior: '#2b2b2b',
      vgolf6_int_a_tex: '#2b2b2b',
      vivace_engine: '#333333',
      vivace_mechanical: '#333333',
      mechanical_rally: '#333333',
    },
    // Lampmaterialen van het model. drl_signal = stadslicht/dagrijlicht-strip (knippert mee), chmsl = derde remlicht.
    // Mistlampen zitten niet in dit model.
    lights: {
      lowBeam: /^vgolf6_lowbeam$/,
      highBeam: /^vgolf6_highbeam$/,
      parkingLeft: /^vgolf6_drl_signal_l$/,
      parkingRight: /^vgolf6_drl_signal_r$/,
      signalLeft: /^(vgolf6_)?signal_l$/,
      signalRight: /^(vgolf6_)?signal_r$/,
      tail: /^vgolf6_taillight$/,
      brake: /^vgolf6_chmsl$/,
      reverse: /^vgolf6_reverselight$/,
    },
    // De achterklep kan niet los: tailgate_a/_b lopen in dit model over de hele auto door (alleen een melding)
    doors: {
      fl: ['vgolf6_door_FL', 'vgolf6_doorglass_FL'],
      fr: ['vgolf6_door_FR', 'vgolf6_doorglass_FR'],
      rl: ['vgolf6_door_RL', 'vgolf6_doorglass_RL'],
      rr: ['vgolf6_door_RR', 'vgolf6_doorglass_RR'],
    },
    // spacing = breedte van het uitlaatpunt (exhaust_tips_c001, 0,06), zodat twee punten tegen elkaar aan zitten
    exhaust: { parts: ['vgolf6_exhaust_tips_c', 'vgolf6_exhaust_tips_c001'], spacing: 0.065 },
    // Model-ruimte: Z omhoog, neus naar -Y, links = +X. Spiegelkap = lak van de voordeur buiten het deurpaneel;
    // grill = zwart kunststof van de voorbumpers tussen de koplampen (het model heeft meerdere bumpers over elkaar).
    trim: {
      mirrors: [
        // Rond het spiegelglas (x 0,83–1,03, y -0,71 – -0,56, z 0,94–1,07), inclusief de voet aan de deurkant
        // (ondergrens net onder het glas, anders komt er een strook van de deur onder de spiegel mee)
        { node: /^vgolf6_door_fl$/, material: /^vgolf6_paint$/, box: [0.79, 1.2, -0.82, -0.45, 0.925, 1.15] },
        { node: /^vgolf6_door_fr$/, material: /^vgolf6_paint$/, box: [-1.2, -0.79, -0.82, -0.45, 0.925, 1.15] },
      ],
      grille: [
        { node: /^vgolf6_bumper_(a|b|gtd|r)_f$/, material: /^(etk800|gti_nodamage)$/, box: [-0.42, 0.42, -2.3, -1.88, 0.58, 0.76] },
      ],
    },
  },
];

export const DEFAULT_VEHICLE_MODEL = VEHICLE_MODELS[0].id;

export const getVehicleModel = (id: string | undefined): VehicleModel =>
  VEHICLE_MODELS.find((m) => m.id === id) ?? VEHICLE_MODELS[0];
