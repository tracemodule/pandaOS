/*
 * PandaOS
 * Copyright (C) 2025  David Cotino
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 */

/**
 * Mappatura GPIO per rilevamento spie veicolo
 * 
 * Configurazione optoaccoppiatori collegati al Raspberry Pi 4B
 * Ogni spia è collegata a un pin GPIO specifico
 * 
 * Logica:
 * - HIGH (1) = Spia accesa
 * - LOW (0) = Spia spenta
 */

module.exports = {
  // Configurazione globale GPIO
  config: {
    // Modalità numerazione pin (BCM = Broadcom GPIO numbering)
    mode: 'BCM',
    
    // Resistenza pull-down interna attivata
    pullMode: 'PUD_DOWN',
    
    // Debounce per evitare letture spurie (ms)
    debounceTime: 50,
    
    // Intervallo di polling per lettura GPIO (ms)
    pollingInterval: 100,
  },

  // Configurazione quadro accensione (ignition)
  ignition: {
    // Abilita gestione quadro tramite optoaccoppiatore dedicato
    enabled: true,
    
    // Pin GPIO collegato all'optoaccoppiatore del quadro
    // Deve essere diverso dai pin usati per le altre spie
    pin: 21,
    
    // Valore logico che indica "quadro acceso"
    // 0 se opto porta a massa quando ON (active low), 1 se active high
    activeOn: 0,
    
    // Percorsi agli script di gestione power-saving
    scripts: {
      // Script low-power eseguito quando il quadro viene SPENTO
      // Percorso relativo alla cartella server (server/scripts/low-power.sh)
      lowPower: './scripts/low-power.sh',

      // Script wake eseguito quando il quadro viene ACCESO
      // Percorso relativo alla cartella server (server/scripts/wake.sh)
      wake: './scripts/wake.sh',
    },
  },

  // Configurazione sensore temperatura DS18B20
  temperature: {
    // Abilita lettura sensore DS18B20
    enabled: true,
    
    // ID sensore (lasciare null per auto-detect del primo sensore trovato)
    // Esempio: '28-0123456789ab'
    sensorId: null,
    
    // Path base per 1-Wire
    basePath: '/sys/bus/w1/devices',
    
    // Intervallo di lettura temperatura (ms)
    readInterval: 5000,
    
    // Pin GPIO per 1-Wire (default GPIO 4 per Raspberry Pi)
    pin: 4,
  },

  // Configurazione sensore carburante ADS1115 (ADC via I2C)
  fuel: {
    // Abilita lettura sensore carburante
    enabled: true,
    
    // Chip ADC (0 = ADS1115, 1 = ADS1015)
    chip: 0,
    
    // Canale ADC (0-3 per A0-A3)
    channel: 0,
    
    // Gain ADC (256, 512, 1024, 2048, 4096, 6144)
    // 4096 = ±4.096V full-scale
    gain: 4096,
    
    // Sample rate (8, 16, 32, 64, 128, 250, 475, 860 SPS)
    sampleRate: 250,
    
    // Intervallo di lettura (ms)
    readInterval: 500,
    
    // Configurazione partitore resistivo (R1 + R2) / R2
    // Esempio: 100kΩ + 33kΩ = 133kΩ / 33kΩ = 4.03
    voltageDivider: {
      r1: 100000, // 100kΩ
      r2: 33000,  // 33kΩ
    },
    
    // Calibrazione tensione → percentuale carburante
    calibration: {
      // Tensione a serbatoio vuoto
      voltageEmpty: 0.5,
      
      // Tensione a serbatoio pieno
      voltageFull: 4.0,
    },
    
    // Pin I2C (GPIO 2 = SDA, GPIO 3 = SCL su Raspberry Pi)
    pins: {
      sda: 2,
      scl: 3,
    },
  },

  // Mappatura spie veicolo -> GPIO pin
  // Key corrisponde alle key usate nel frontend (state.warnings)
  mapping: {
    // Indicatori di direzione
    turnSignals: {
      pin: 17,
      name: 'Frecce',
      description: 'Indicatori di direzione',
    },
    
    // Sistema elettrico
    battery: {
      pin: 27,
      name: 'Alternatore',
      description: 'Carica batteria/alternatore',
    },
    
    // Sistema lubrificazione
    engineOil: {
      pin: 22,
      name: 'Pressione olio',
      description: 'Pressione olio motore',
    },
    
    // Sistema frenante
    brakeSystem: {
      pin: 23,
      name: 'Freni',
      description: 'Sistema frenante',
    },
    
    // Sistema iniezione
    injectors: {
      pin: 24,
      name: 'Iniettori',
      description: 'Sistema iniezione carburante',
    },
    
    // Chiave inserita
    keyOn: {
      pin: 25,
      name: 'KEY',
      description: 'Chiave inserita/quadro acceso',
    },
    
    // Luci esterne
    highBeam: {
      pin: 5,
      name: 'Abbaglianti',
      description: 'Fari abbaglianti',
    },
    
    lowBeam: {
      pin: 6,
      name: 'Anabbaglianti',
      description: 'Fari anabbaglianti',
    },
    
    hazard: {
      pin: 12,
      name: 'Quattro frecce',
      description: 'Luci di emergenza',
    },
    
    fogLight: {
      pin: 13,
      name: 'Fendinebbia',
      description: 'Fendinebbia posteriore',
    },
    
    // Sistema raffreddamento
    engineColant: {
      pin: 16,
      name: 'Temperatura raffreddamento',
      description: 'Temperatura liquido refrigerante',
    },
    
    // Comfort
    rearDefrost: {
      pin: 19,
      name: 'Termoresistenza lunotto',
      description: 'Sbrinatore lunotto posteriore',
    },
    
    // Carburante
    fuel: {
      pin: 20,
      name: 'Riserva carburante',
      description: 'Livello carburante in riserva',
    },
  },

  /**
   * Restituisce la lista di tutti i pin GPIO utilizzati
   */
  getAllPins() {
    return Object.values(this.mapping).map(config => config.pin);
  },

  /**
   * Restituisce la configurazione per una specifica spia
   */
  getWarningConfig(warningKey) {
    return this.mapping[warningKey] || null;
  },

  /**
   * Restituisce la mappatura pin -> warning key
   */
  getPinToWarningMap() {
    const map = {};
    Object.entries(this.mapping).forEach(([key, config]) => {
      map[config.pin] = key;
    });
    return map;
  },
};