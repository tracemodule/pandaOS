import { useUIStore } from '../store/uiStore';
import { PANDA_CONFIG } from '../settings';

const systemChannel = new BroadcastChannel('panda_os_system');

export const CustomCommands = {
    initInternalListener: () => {
        systemChannel.onmessage = (event) => {
            const { command, data } = event.data;
            const store = useUIStore.getState();

            switch (command) {
                // --- Airbag ---
                case 'AIRBAG_ON':
                    store.showNotification("AIRBAG ACTIVATED", "info", "PASSENGER");
                    break;
                case 'AIRBAG_OFF':
                    store.showNotification("AIRBAG OFF", "alert", "PASSENGER");
                    break;

                // --- Seatbelts ---
                case 'SEATBELT_OFF':
                    store.showNotification("BELT UNBUCKLED", "alert", "REAR LEFT");
                    break;
                case 'SEATBELT_ON':
                    store.showNotification("BELT BUCKLED", "info", "REAR LEFT");
                    break;

                // --- Vehicle Checks ---
                case 'TIRE_CHECK':
                    store.showNotification("LOW PRESSURE", "alert", "TIRE CHECK");
                    break;
                case 'BATTERY_CHECK':
                    store.showNotification("HEALTH 94%", "info", "BATTERY");
                    break;

                // --- System Settings ---
                case 'SCREEN_DARK':
                    PANDA_CONFIG.SCREEN_MODE = 'dark';
                    store.setScreenMode('dark'); // Forceer direct de Zustand state update
                    store.showNotification("DARK MODE", "info", "SYSTEM");
                    break;
                case 'SCREEN_LIGHT':
                    PANDA_CONFIG.SCREEN_MODE = 'light';
                    store.setScreenMode('light'); // Forceer direct de Zustand state update
                    store.showNotification("LIGHT MODE", "info", "SYSTEM");
                    break;
                // Simuleert het OBD2-koplampsignaal (null = geen OBD2, Auto valt terug op de klok)
                case 'HEADLIGHTS_SET':
                    store.setVehicleLights(data);
                    store.showNotification(data === null ? "OBD2 OFF" : (data ? "HEADLIGHTS ON" : "HEADLIGHTS OFF"), "info", "LIGHTS");
                    break;
                case 'SET_TIMEZONE':
                    PANDA_CONFIG.SYSTEM_TIME_ZONE = data;
                    store.showNotification(data, "info", "TIMEZONE");
                    break;
                case 'SET_COUNTRY':
                    PANDA_CONFIG.SYSTEM_COUNTRY = data;
                    store.showNotification(data, "info", "COUNTRY");
                    break;

                // --- Media & Volume ---
                case 'VOLUME_SET':
                    store.setVolume(data);
                    break;
                // Ook voor de VOL+/VOL- knoppen van de radio: stap van 1, popup 3 seconden zichtbaar
                case 'VOLUME_UP':
                    store.stepVolume(1);
                    break;
                case 'VOLUME_DOWN':
                    store.stepVolume(-1);
                    break;
                case 'VOLUME_MUTE':
                    store.setVolume(0);
                    break;
                case 'MUSIC_PLAY':
                    if (!store.isPlaying) store.togglePlayPause();
                    break;
                case 'MUSIC_PAUSE':
                    if (store.isPlaying) store.togglePlayPause();
                    break;

                // --- Voertuig Besturing ---
                case 'TRANSMISSION_SET':
                    // Via de override, anders zet de GPS-snelheid hem meteen terug naar P/D (R = achteruit-signaal)
                    store.setGearOverride(data === 'P' ? null : data);
                    if (data === 'P') store.setGear('P');
                    store.showNotification(`GEAR: ${data}`, "info", "TRANSMISSION");
                    break;
                case 'BRAKE_SET':
                    store.setBrake(data);
                    break;

                // --- Autostatus voor het 3D-model (straks van het CAN-kastje / OBD2) ---
                case 'LIGHTS_SET': // 'off' | 'parking' | 'low'
                    store.setCarState({ lights: data });
                    break;
                case 'HIGHBEAM_SET':
                    store.setCarState({ highBeam: data });
                    break;
                case 'FOG_SET': // { which: 'front' | 'rear', on }
                    store.setCarState(data.which === 'rear' ? { fogRear: data.on } : { fogFront: data.on });
                    break;
                case 'BLINKER_SET': // 'off' | 'left' | 'right' | 'hazard'
                    store.setCarState({ blinker: data });
                    break;
                case 'DOOR_SET': // { door: 'fl' | 'fr' | 'rl' | 'rr' | 'trunk' | 'all', open }
                    store.setCarState({ doors: data.door === 'all'
                        ? { fl: data.open, fr: data.open, rl: data.open, rr: data.open, trunk: data.open }
                        : { [data.door]: data.open } });
                    break;
                case 'CAR_TRANSMISSION': // wat de auto als versnellingsbak doorgeeft: 'Automatic' | 'Manual' | null
                    store.setCarState({ detectedTransmission: data });
                    break;

                // Proefoproep zonder telefoon (dev-console: "call David" of "call end")
                case 'MOCK_CALL':
                    if (data === 'end') store.hangUp();
                    else store.receiveIncomingCall(data, '+31 6 12345678');
                    break;

                case 'PERM_REQ':
                    alert(`System Request: Allow ${data} access?`);
                    break;
            }
        };
    },

    sendCommand: (command: string, data?: any) => {
        systemChannel.postMessage({ command, data });
    }
};