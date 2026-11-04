// src/components/screen/splash-screen/configuration/DevConsoleWindow.tsx
import React, { useState } from 'react';
import { CustomCommands } from '../../../../scripts/customcmdcommands';

const DevConsoleWindow: React.FC = () => {
    const [input, setInput] = useState('');
    const [history, setHistory] = useState<string[]>([
        "PandaOS Kernel 1.0.5 - Developer Console", 
        "Type 'help' for a list of available commands..."
    ]);

    const handleCommand = (e: React.FormEvent) => {
        e.preventDefault();
        const fullCmd = input.trim();
        const cmd = fullCmd.toLowerCase();
        let output = `> ${fullCmd}`;

        // --- Airbag Commands ---
        if (cmd === 'airbag off') {
            CustomCommands.sendCommand('AIRBAG_OFF');
            output += " | System: Passenger Airbag Deactivated";
        }
        else if (cmd === 'airbag on') {
            CustomCommands.sendCommand('AIRBAG_ON');
            output += " | System: Passenger Airbag Activated";
        }

        // --- Seatbelt Commands ---
        else if (cmd === 'seatbelt off') {
            CustomCommands.sendCommand('SEATBELT_OFF');
            output += " | Warning: Seatbelt unbuckled detected";
        }
        else if (cmd === 'seatbelt on') {
            CustomCommands.sendCommand('SEATBELT_ON');
            output += " | Info: All seatbelts secured";
        }

        // --- Vehicle Checks ---
        else if (cmd === 'tire check') {
            CustomCommands.sendCommand('TIRE_CHECK');
            output += " | Diagnostics: Checking tire pressures...";
        }
        else if (cmd === 'battery check') {
            CustomCommands.sendCommand('BATTERY_CHECK');
            output += " | Diagnostics: Checking high voltage system...";
        }

        // --- Screen Mode Commands ---
        else if (cmd === 'screen dark') {
            CustomCommands.sendCommand('SCREEN_DARK');
            output += " | UI: Switching to Dark Mode";
        }
        else if (cmd === 'screen light') {
            CustomCommands.sendCommand('SCREEN_LIGHT');
            output += " | UI: Switching to Light Mode";
        }

        // --- Headlights (simulatie OBD2-signaal voor Auto-thema) ---
        else if (cmd.startsWith('headlights ')) {
            const val = cmd.split('headlights ')[1];
            const lightsMap: Record<string, boolean | null> = { 'on': true, 'off': false, 'obd off': null };
            if (val in lightsMap) {
                CustomCommands.sendCommand('HEADLIGHTS_SET', lightsMap[val]);
                output += ` | Vehicle: Headlights ${val}`;
            } else {
                output += " | Error: use headlights on/off/obd off";
            }
        }

        // --- Lichtschakelaar, grootlicht, mist, knipperlichten (3D-model) ---
        else if (cmd.startsWith('lights ')) {
            const val = cmd.split('lights ')[1];
            const map: Record<string, string> = { 'off': 'off', '0': 'off', 'parking': 'parking', 'low': 'low', 'on': 'low' };
            if (map[val]) {
                CustomCommands.sendCommand('LIGHTS_SET', map[val]);
                output += ` | Vehicle: Light switch ${map[val]}`;
            } else output += " | Error: use lights off/parking/low";
        }
        else if (cmd === 'highbeam on' || cmd === 'highbeam off') {
            CustomCommands.sendCommand('HIGHBEAM_SET', cmd.endsWith('on'));
            output += ` | Vehicle: High beam ${cmd.endsWith('on') ? 'on' : 'off'}`;
        }
        else if (/^fog (front|rear) (on|off)$/.test(cmd)) {
            const [, which, state] = cmd.split(' ');
            CustomCommands.sendCommand('FOG_SET', { which, on: state === 'on' });
            output += ` | Vehicle: ${which} fog lights ${state}`;
        }
        else if (/^blinker (left|right|hazard|off)$/.test(cmd)) {
            const val = cmd.split(' ')[1];
            CustomCommands.sendCommand('BLINKER_SET', val);
            output += ` | Vehicle: Blinker ${val}`;
        }

        // --- Deuren (3D-model + melding) ---
        else if (/^door (fl|fr|rl|rr|trunk|all) (open|close)$/.test(cmd)) {
            const [, door, state] = cmd.split(' ');
            CustomCommands.sendCommand('DOOR_SET', { door, open: state === 'open' });
            output += ` | Vehicle: Door ${door} ${state}`;
        }

        // --- Versnellingsbak die de auto doorgeeft (Settings > Vehicle > Automatisch herkennen) ---
        else if (/^cartype (automatic|manual|unknown)$/.test(cmd)) {
            const val = cmd.split(' ')[1];
            CustomCommands.sendCommand('CAR_TRANSMISSION', val === 'automatic' ? 'Automatic' : val === 'manual' ? 'Manual' : null);
            output += ` | Vehicle: Car reports transmission ${val}`;
        }

        // --- Volume Commands ---
        else if (cmd.startsWith('volume ')) {
            const val = cmd.split('volume ')[1];
            if (val === 'up') CustomCommands.sendCommand('VOLUME_UP');
            else if (val === 'down') CustomCommands.sendCommand('VOLUME_DOWN');
            else if (val === 'mute') CustomCommands.sendCommand('VOLUME_MUTE');
            else {
                const num = parseInt(val);
                if (!isNaN(num)) CustomCommands.sendCommand('VOLUME_SET', num);
            }
            output += ` | Audio: Volume set to ${val}`;
        }

        // --- Music Commands ---
        else if (cmd === 'music play') {
            CustomCommands.sendCommand('MUSIC_PLAY');
            output += " | Media: Playing";
        }
        else if (cmd === 'music pause') {
            CustomCommands.sendCommand('MUSIC_PAUSE');
            output += " | Media: Paused";
        }

        // --- Transmission Commands ---
        else if (cmd.startsWith('transmission ')) {
            const val = cmd.split('transmission ')[1];
            const gearMap: Record<string, string> = {
                'neutral': 'N', 'backwards': 'R', 'park': 'P', 'drive': 'D',
                '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6'
            };
            const mappedGear = gearMap[val];
            if (mappedGear) {
                CustomCommands.sendCommand('TRANSMISSION_SET', mappedGear);
                output += ` | Vehicle: Transmission shifted to ${mappedGear}`;
            } else {
                output += " | Error: Unknown gear";
            }
        }

        // --- Brake Commands ---
        else if (cmd.startsWith('brake ')) {
            const val = cmd.split('brake ')[1];
            if (val === 'enabled') CustomCommands.sendCommand('BRAKE_SET', true);
            else if (val === 'disabled') CustomCommands.sendCommand('BRAKE_SET', false);
            output += ` | Vehicle: Brakes ${val}`;
        }

        // --- System Settings (With Arguments) ---
        else if (cmd.startsWith('set timezone ')) {
            const tz = fullCmd.split('set timezone ')[1];
            CustomCommands.sendCommand('SET_TIMEZONE', tz);
            output += ` | Config: Timezone changed to ${tz}`;
        }
        else if (cmd.startsWith('set country ')) {
            const country = fullCmd.split('set country ')[1];
            CustomCommands.sendCommand('SET_COUNTRY', country);
            output += ` | Config: Country changed to ${country}`;
        }

        // --- Mock Call ---
        else if (cmd.startsWith('call ')) {
            const name = fullCmd.split('call ')[1];
            CustomCommands.sendCommand('MOCK_CALL', name);
            output += ` | VoIP: Simulating call from ${name}`;
        }

        // --- Utility Commands ---
        else if (cmd === 'help') {
            output += " | Available commands:\n" +
                      " - airbag on/off\n" +
                      " - seatbelt on/off\n" +
                      " - tire check\n" +
                      " - battery check\n" +
                      " - screen dark/light\n" +
                      " - headlights [on/off/obd off]\n" +
                      " - lights [off/parking/low]\n" +
                      " - highbeam [on/off]\n" +
                      " - fog [front/rear] [on/off]\n" +
                      " - blinker [left/right/hazard/off]\n" +
                      " - door [fl/fr/rl/rr/trunk/all] [open/close]\n" +
                      " - cartype [automatic/manual/unknown]\n" +
                      " - volume [up/down/mute/0-100]\n" +
                      " - music [play/pause]\n" +
                      " - transmission [park/drive/neutral/backwards/1-6]\n" +
                      " - brake [enabled/disabled]\n" +
                      " - set timezone [value]\n" +
                      " - set country [value]\n" +
                      " - call [name]\n" +
                      " - clear";
        }
        else if (cmd === 'clear') { 
            setHistory([]); 
            setInput(''); 
            return; 
        }
        else {
            output += " | Error: Command not recognized. Type 'help' for info.";
        }

        setHistory([...history, output]);
        setInput('');
    };

    return (
        <div style={{ 
            backgroundColor: '#000', 
            color: '#0f0', 
            height: '100vh', 
            padding: '20px', 
            fontFamily: 'monospace', 
            overflowY: 'auto',
            fontSize: '14px',
            lineHeight: '1.4'
        }}>
            <div style={{ whiteSpace: 'pre-wrap' }}>
                {history.map((line, i) => <div key={i} style={{ marginBottom: '5px' }}>{line}</div>)}
            </div>
            
            <form onSubmit={handleCommand} style={{ display: 'flex', marginTop: '10px' }}>
                <span style={{ marginRight: '10px', fontWeight: 'bold' }}>PandaOS:&gt;</span>
                <input 
                    autoFocus
                    style={{ 
                        backgroundColor: 'transparent', 
                        color: '#0f0', 
                        border: 'none', 
                        outline: 'none', 
                        flex: 1, 
                        fontFamily: 'monospace', 
                        fontSize: '16px' 
                    }}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                />
            </form>
        </div>
    );
};

export default DevConsoleWindow;