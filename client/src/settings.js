import { useUIStore } from './store/uiStore';

export const PANDA_CONFIG = {
    SCREEN_SIZE: {
        width: 1920,
        height: 1080
    },
    MODE: 'dev', // 'dev' of 'standard'
    // Uit version.json in de projectmap (vite.config.ts), zelfde nummer als de launcher-app
    // eslint-disable-next-line no-undef
    VERSION: __PANDAOS_VERSION__,
    STRICT_MODE: false,
    
    // --- Systeem Configuratie ---
    SYSTEM_TIME_ZONE: 'Europe/Amsterdam',
    SYSTEM_COUNTRY: 'Netherlands',
    SCREEN_MODE: 'auto', // 'light', 'dark', of 'auto'
    
    // Standaard weergave instellingen (Worden nu in de uiStore dynamisch beheerd)
    DEFAULT_TEMPERATURE_UNIT: 'C', 
    DEFAULT_TIME_FORMAT: '24h',
    DEFAULT_DISTANCE_UNIT: 'km',
    DEFAULT_ENERGY_DISPLAY: 'percentage',
    
    // --- Functies ---
    REAR_CAMERA_PARKING: true 
};

// Auto-modus: het koplampsignaal van de auto (OBD2) bepaalt het thema, net als bij Android-multimedia
// die op de lichtschakelaar reageert. Zolang er geen OBD2-data is (vehicleLightsOn === null) valt hij terug op de klok.
export const getEffectiveTheme = (mode, vehicleLightsOn = useUIStore.getState().vehicleLightsOn) => {
    if (mode === 'auto') {
        if (vehicleLightsOn !== null && vehicleLightsOn !== undefined) return vehicleLightsOn ? 'dark' : 'light';
        const hour = new Date().getHours();
        return (hour >= 19 || hour <= 6) ? 'dark' : 'light';
    }
    return mode;
};