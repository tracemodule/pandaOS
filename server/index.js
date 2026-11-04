const { WebSocketServer } = require('ws');
const bluetoothManager = require('./scripts/bluetooth');
const mediaMonitor = require('./scripts/media');
const phoneManager = require('./scripts/phone');
const { startCarPlayService } = require('./scripts/CarPlayService'); 

const wss = new WebSocketServer({ port: 8080 });

// --- START DE CARPLAY SERVICE ---
startCarPlayService()
    .then(() => {
        // Dit wordt pas uitgevoerd als de hele functie (inclusief carplayInstance.start) klaar is
    })
    .catch(err => {
        console.error('====================================');
        console.error('[CARPLAY ERROR]');
        console.error(err.message);
        console.error('====================================');
    });

console.log('====================================');
console.log('   PANDAOS BACKEND (REAL HARDWARE)  ');
console.log('   Draait op ws://localhost:8080    ');
console.log('   CarPlay op ws://localhost:5005   ');
console.log('====================================');

wss.on('connection', (socket) => {
    console.log('[Systeem] Tesla Interface verbonden via WebSocket.');

    // Wat er speelt (titel, artiest, hoes, voortgang) doorsturen naar de app
    const stopMediaMonitor = mediaMonitor.start(socket);
    // Inkomende/lopende oproepen van de verbonden telefoon volgen (alleen Pi)
    const stopPhoneMonitor = phoneManager.start(socket);

    socket.on('message', async (message) => {
        try {
            const request = JSON.parse(message);
            console.log(`[Commando] ${request.event} ontvangen.`);

            switch (request.event) {
                case 'START_BT_SCAN':
                    await bluetoothManager.scanDevices(socket);
                    break;
                case 'PHONE_SYNC':
                case 'PHONE_DIAL':
                case 'PHONE_ANSWER':
                case 'PHONE_HANGUP':
                case 'PHONE_MUTE':
                case 'PHONE_DTMF':
                    await phoneManager.handle(request.event, request.data || {}, socket);
                    break;
                case 'BT_MAKE_DISCOVERABLE':
                    await bluetoothManager.makeDiscoverable(socket);
                    break;
                case 'BT_RADIO_ON':
                    await bluetoothManager.turnOnRadio(socket);
                    break;
                case 'CONNECT_BT_DEVICE':
                    if (request.data && request.data.address) {
                        bluetoothManager.connectToDevice(request.data.address, socket);
                    }
                    break;
                case 'DISCONNECT_BT_DEVICE':
                    if (request.data && request.data.address) {
                        bluetoothManager.disconnectDevice(request.data.address, socket);
                    }
                    break;
                case 'BT_SEND_CMD':
                    if (request.data && request.data.command) {
                        bluetoothManager.sendData(request.data.command); // alleen bij een seriële verbinding
                        mediaMonitor.sendCommand(request.data.command);
                    }
                    break;
            }
        } catch (err) {
            console.error('[Fout] Kan bericht niet verwerken:', err);
        }
    });

    socket.on('close', () => {
        console.log('[Systeem] Interface verbroken.');
        stopMediaMonitor();
        stopPhoneMonitor();
    });
});