#!/usr/bin/env node
// PandaOS vanaf de laptop bedienen en uitlezen (radio of emulator via adb, USB of wifi-adb).
// Gebruikt dezelfde DevTools-verbinding als chrome://inspect: geen open poort op de radio nodig.
//
//   node tools/pandaos.mjs status            stand van PandaOS (volume, versnelling, licht, muziek, open app)
//   node tools/pandaos.mjs volume 20         meestervolume zetten (0-40)
//   node tools/pandaos.mjs set display.dockHeight 72    een instelling zetten (displaySettings, navigationSettings ...)
//   node tools/pandaos.mjs open settings     app openen: settings, music, phone, contacts, calendar, messages, map
//   node tools/pandaos.mjs bluetooth         Bluetooth van Android: aan/uit, verbonden apparaten, profielen
//   node tools/pandaos.mjs media             wat Android als "speelt nu" ziet (mediasessies) en wat PandaOS toont
//   node tools/pandaos.mjs sources           welke opslag voor contacten/gesprekken/agenda gevuld is (alleen aantallen)
//   node tools/pandaos.mjs log <tekst>       laatste regels uit het logboek van de radio met die tekst
//   node tools/pandaos.mjs js "<expressie>"  vrije JavaScript in PandaOS (pandaStore, PandaAndroid)
//
// Radio klaarzetten en testen (zie RADIO-TEST.md):
//   node tools/pandaos.mjs setup             alle rechten en Android-instellingen die PandaOS nodig heeft (eenmalig)
//   node tools/pandaos.mjs doctor            controleren of alles klopt (rechten, vensters, WebView, equalizer, verbinding)
//   node tools/pandaos.mjs apks              APK's van de fabrikant (com.jancar.* e.d.) ophalen naar tools/radio-apks/
//   node tools/pandaos.mjs can list          alle CAN-functies
//   node tools/pandaos.mjs can <functie> <on|off|waarde>   CAN-signaal nadoen (zelfde weg als het CAN-kastje)
//   node tools/pandaos.mjs sim <wat> <stand> [--hold]       auto nadoen: gear R|P|D|N, speed 50, lights off|parking|low,
//                                            high on|off, blinker left|right|hazard|off, door fl|fr|rl|rr|trunk open|closed,
//                                            brake on|off, fuel 60, temp 12, range 400, seatbelt on|off.
//                                            --hold = vasthouden (elke 0,3 s opnieuw), ook als de echte auto iets anders meldt
//   node tools/pandaos.mjs sim reset         vastgehouden standen loslaten, PandaOS volgt de auto weer
//   node tools/pandaos.mjs camera open|close achteruitrijcamera
//   node tools/pandaos.mjs audio             wat de radio kan (equalizer, geluidsapp) en welke bron-apps er zijn
//   node tools/pandaos.mjs audio eq 0 2 1 0 -1 3   zes banden in dB (sub, bas, laag-mid, mid, hoog-mid, hoog)
//   node tools/pandaos.mjs shot [naam]       schermafbeelding naar tools/radio-shots/ (niet in git)
//   node tools/pandaos.mjs test              rondje langs alles met geslaagd/mislukt; zet daarna alles terug
//
// Privacy: geen enkel commando toont contacten, nummers of berichten; "sources" geeft alleen aantallen.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const PKG = 'nl.pandaos.launcher';

const ADB = process.env.ADB || (process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools\\adb.exe` : 'adb');
const PORT = 9333;
const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const sh = (cmd) => { try { return adb('shell', cmd).trim(); } catch (e) { return `FOUT: ${(e.stderr || e.message || '').toString().trim()}`; } };
const ok = (good, text) => console.log(`${good ? '✓' : '✗'} ${text}`);

// Rechten die PandaOS via adb krijgt (zelfde lijst als LAPTOP-ADB.md)
const GRANTS = ['android.permission.WRITE_SECURE_SETTINGS', 'android.permission.READ_LOGS', 'android.permission.CHANGE_CONFIGURATION',
  'android.permission.READ_CONTACTS', 'android.permission.WRITE_CONTACTS', 'android.permission.READ_CALL_LOG', 'android.permission.WRITE_CALL_LOG',
  'android.permission.CALL_PHONE', 'android.permission.READ_CALENDAR', 'android.permission.READ_SMS', 'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.CAMERA', 'android.permission.RECORD_AUDIO'];

// Auto nadoen: elk commando wordt een stukje JavaScript in PandaOS. CAN-functies gaan via pandaCan (de echte weg).
const can = (func, action, value = '') => `pandaCan.applyCanSignal({ func: ${JSON.stringify(func)}, action: ${JSON.stringify(action)}, value: ${JSON.stringify(String(value))} })`;
function simCode(what, val) {
  const on = ['on', 'open', 'aan', '1', 'true'].includes(String(val).toLowerCase());
  switch (what) {
    case 'gear': return `pandaStore.getState().setGearOverride(${JSON.stringify(String(val).toUpperCase())})`;
    case 'speed': return `pandaStore.getState().setSpeed(${Number(val)})`;
    case 'lights':
      if (val === 'low') return `${can('parking', 'on')}; ${can('low', 'on')}`;
      if (val === 'parking') return `${can('low', 'off')}; ${can('parking', 'on')}`;
      return `${can('low', 'off')}; ${can('parking', 'off')}`;
    case 'high': return can('high', on ? 'on' : 'off');
    case 'blinker':
      if (val === 'hazard') return can('hazard', 'on');
      if (val === 'left') return can('blinker_left', 'on');
      if (val === 'right') return can('blinker_right', 'on');
      return `${can('hazard', 'off')}; ${can('blinker_left', 'off')}; ${can('blinker_right', 'off')}`;
    case 'brake': return can('handbrake', on ? 'on' : 'off');
    case 'fuel': return can('fuel', 'value', val);
    case 'temp': return can('outside_temp', 'value', val);
    case 'range': return can('range', 'value', val);
    case 'seatbelt': return can('seatbelt', on ? 'on' : 'off');
    case 'reverse': return can('reverse', on ? 'on' : 'off');
    default: return null;
  }
}
const simDoor = (door, val) => can(door === 'trunk' ? 'trunk' : `door_${door}`, ['open', 'on'].includes(val) ? 'on' : 'off');
// Vasthouden: in PandaOS een lijstje dat elke 0,3 s opnieuw wordt toegepast (tot "sim reset")
const holdCode = (key, code) => `(() => { const h = (window.__pandaSim ??= { held: {}, timer: 0 });
  h.held[${JSON.stringify(key)}] = () => { ${code}; };
  if (!h.timer) h.timer = setInterval(() => Object.values(h.held).forEach((f) => { try { f(); } catch (e) {} }), 300);
  h.held[${JSON.stringify(key)}](); return 'vastgehouden: ' + Object.keys(h.held).join(', '); })()`;

async function evaluate(expression) {
  const pid = adb('shell', 'pidof', 'nl.pandaos.launcher').trim();
  if (!pid) throw new Error('PandaOS draait niet (pidof nl.pandaos.launcher is leeg)');
  adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = pages.find((p) => p.url.endsWith('/index.html')) || pages[0];
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const waitMs = Number(process.env.PANDAOS_TIMEOUT || 60000);
    const timer = setTimeout(() => { ws.close(); reject(new Error(`Geen antwoord van PandaOS (${waitMs / 1000} s)`)); }, waitMs);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id !== 1) return;
      clearTimeout(timer); ws.close();
      if (msg.result?.exceptionDetails) reject(new Error(msg.result.exceptionDetails.exception?.description || 'Fout in PandaOS'));
      else resolve(msg.result?.result?.value);
    };
  });
}

const APPS = {
  settings: "s.openSettingsTab('Display')", music: 's.toggleMusic()', phone: 's.openPhone()', map: 's.openMap()',
  contacts: "s.openPanelApp('contacts')", calendar: "s.openPanelApp('calendar')", messages: "s.openPanelApp('messages')",
};
const SECTIONS = { display: 'displaySettings', navigation: 'navigationSettings', app: 'appSettings', vehicle: 'vehicleSettings', audio: 'audioSettings' };

const [cmd, ...args] = process.argv.slice(2);
try {
  switch (cmd) {
    case 'status': {
      const v = await evaluate(`(() => { const s = pandaStore.getState(); return JSON.stringify({
        volume: s.volume, masterKnown: PandaAndroid.getMasterVolume(), gear: s.gear, speed: s.speed, lights: s.carState?.lights,
        music: s.currentTrack ? { track: s.currentTrack, artist: s.currentArtist, playing: s.isPlaying, source: s.nowPlayingSource } : null,
        open: { settings: s.isMenuOpen, music: s.isMusicOpen, phone: s.isPhoneOpen, map: s.isMapOpen, panelApp: s.panelApp },
        bluetoothSeen: !!s.btConnectedAddress || (s.btDevices || []).some((d) => d.connected) }, null, 2); })()`);
      console.log(v); break;
    }
    case 'volume':
      console.log(await evaluate(`(pandaStore.getState().setVolume(${Number(args[0])}), 'volume ' + pandaStore.getState().volume)`)); break;
    case 'set': {
      const [path, raw] = args;
      const [section, key] = path.split('.');
      const store = SECTIONS[section];
      if (!store || !key) throw new Error(`Gebruik: set <${Object.keys(SECTIONS).join('|')}>.<naam> <waarde>`);
      let value; try { value = JSON.parse(raw); } catch { value = raw; }
      console.log(await evaluate(`(() => { const s = pandaStore.getState(); pandaStore.setState({ ${store}: { ...s.${store}, ${JSON.stringify(key)}: ${JSON.stringify(value)} } }); return ${JSON.stringify(path)} + ' = ' + JSON.stringify(pandaStore.getState().${store}[${JSON.stringify(key)}]); })()`));
      break;
    }
    case 'open':
      if (!APPS[args[0]]) throw new Error(`Apps: ${Object.keys(APPS).join(', ')}`);
      console.log(await evaluate(`(() => { const s = pandaStore.getState(); ${APPS[args[0]]}; return 'geopend: ${args[0]}'; })()`)); break;
    case 'bluetooth': {
      const out = adb('shell', 'dumpsys', 'bluetooth_manager');
      const keep = out.split('\n').filter((l) => /enabled|state:|ConnectionState|Connected|connected devices|Profile|A2dp|Avrcp|HeadsetClient|PbapClient|MapClient|name:/i.test(l));
      console.log(keep.slice(0, 80).join('\n') || '(geen Bluetooth-gegevens; de radio gebruikt mogelijk een eigen Bluetooth-module)');
      const apps = adb('shell', 'pm', 'list', 'packages').split('\n').filter((l) => /bt|blue|phone|music/i.test(l) && /jancar|syu|fyt|microntek|autochips/i.test(l));
      console.log('\nBluetooth-apps van de fabrikant:\n' + (apps.join('\n') || '(geen gevonden)'));
      break;
    }
    case 'media': {
      const out = adb('shell', 'dumpsys', 'media_session');
      const keep = out.split('\n').filter((l) => /package=|active=|state=PlaybackState|metadata|description=/i.test(l));
      console.log('Mediasessies volgens Android:\n' + keep.slice(0, 60).join('\n'));
      console.log('\nPandaOS toont: ' + await evaluate(`JSON.stringify((s => ({ track: s.currentTrack, artist: s.currentArtist, playing: s.isPlaying, source: s.nowPlayingSource }))(pandaStore.getState()))`));
      break;
    }
    case 'sources':
      console.log(await evaluate(`(() => { const d = JSON.parse(PandaAndroid.getPhoneDataSources()); return JSON.stringify({ contacts: d.contacts, calls: d.calls, calendarEvents: d.calendarEvents, sms: d.sms, providers: d.providers }, null, 2); })()`));
      break;
    case 'log': {
      const needle = (args.join(' ') || '').toLowerCase();
      const lines = adb('logcat', '-d', '-v', 'time').split('\n').filter((l) => !needle || l.toLowerCase().includes(needle));
      console.log(lines.slice(-60).join('\n'));
      break;
    }
    case 'js':
      console.log(await evaluate(args.join(' '))); break;

    case 'setup': {
      console.log(`Apparaat: ${sh('getprop ro.product.model')} (Android ${sh('getprop ro.build.version.release')})`);
      for (const perm of GRANTS) {
        const out = sh(`pm grant ${PKG} ${perm}`);
        ok(!out.startsWith('FOUT') && !/Exception/.test(out), perm.split('.').pop() + (out ? `  (${out.split('\n')[0]})` : ''));
      }
      ok(!sh(`appops set ${PKG} SYSTEM_ALERT_WINDOW allow`).startsWith('FOUT'), 'boven andere apps tonen (menu, volumebalk, knoppen half venster)');
      const freeformBefore = sh('settings get global enable_freeform_support');
      sh('settings put global enable_freeform_support 1');
      sh('settings put global force_resizable_activities 1');
      ok(true, 'vrije vensters aan (apps half naast de auto)' + (freeformBefore !== '1' ? '  -> HERSTART de radio één keer' : ''));
      const listeners = sh('settings get secure enabled_notification_listeners');
      if (!listeners.includes(PKG)) {
        const list = listeners && listeners !== 'null' && !listeners.startsWith('FOUT') ? `${listeners}:` : '';
        sh(`settings put secure enabled_notification_listeners "${list}${PKG}/${PKG}.MediaWatcher"`);
      }
      ok(sh('settings get secure enabled_notification_listeners').includes(PKG), 'meldingen-toegang (muziek van andere apps)');
      console.log('\nKlaar. Controleren: node tools/pandaos.mjs doctor');
      break;
    }

    case 'doctor': {
      console.log(`Apparaat: ${sh('getprop ro.product.model')} · Android ${sh('getprop ro.build.version.release')} (SDK ${sh('getprop ro.build.version.sdk')}) · ${sh('getprop ro.board.platform')}`);
      const pkg = sh(`dumpsys package ${PKG}`);
      ok(/versionName=/.test(pkg), `PandaOS geïnstalleerd ${(pkg.match(/versionName=(\S+)/) || [])[1] || ''}`);
      ok(sh('cmd package resolve-activity -a android.intent.action.MAIN -c android.intent.category.HOME').includes(PKG), 'PandaOS is het startscherm');
      for (const perm of GRANTS) ok(pkg.includes(`${perm}: granted=true`), perm.split('.').pop());
      ok(/allow/.test(sh(`appops get ${PKG} SYSTEM_ALERT_WINDOW`)), 'boven andere apps tonen');
      ok(sh('settings get global enable_freeform_support') === '1', 'vrije vensters (half openen)');
      ok(sh('settings get secure enabled_notification_listeners').includes(PKG), 'meldingen-toegang');
      console.log(`  balken verbergen: ${sh('settings get global policy_control')}`);
      console.log(`  WebView: ${(sh('dumpsys webviewupdate').match(/Current WebView package \(name, version\): \(([^)]+)\)/) || [])[1] || '(onbekend)'}`);
      try {
        const d = JSON.parse(await evaluate(`JSON.stringify({ android: !!window.PandaAndroid, can: !!window.pandaCan,
          audio: window.PandaAndroid && PandaAndroid.getAudioFxState ? JSON.parse(PandaAndroid.getAudioFxState()) : null,
          master: window.PandaAndroid ? PandaAndroid.getMasterVolume() : -1 })`));
        ok(d.android, 'verbinding met PandaOS (DevTools)');
        ok(d.can, 'CAN nadoen mogelijk (deze versie)');
        ok(d.master >= 0, `meestervolume van de radio bekend (${d.master})`);
        ok(!!d.audio?.eq, `equalizer voor al het geluid${d.audio?.bands ? ` (${d.audio.bands} banden)` : ''}`);
        ok(!!d.audio?.radioSoundApp, 'geluidsapp van de radio (balans/fader)');
      } catch (e) { ok(false, `verbinding met PandaOS: ${e.message}`); }
      break;
    }

    case 'apks': {
      const dir = join(TOOLS, 'radio-apks');
      mkdirSync(dir, { recursive: true });
      const pkgs = sh('pm list packages -f').split('\n')
        .map((l) => l.trim().match(/^package:(.+\.apk)=(.+)$/)).filter(Boolean)
        .filter((m) => /jancar|syu|fyt|microntek|autochips|carsetting|canbus|audiosetting/i.test(m[2]));
      if (!pkgs.length) { console.log('Geen apps van de fabrikant gevonden.'); break; }
      for (const [, path, name] of pkgs) {
        try { adb('pull', path, join(dir, `${name}.apk`)); ok(true, name); } catch (e) { ok(false, `${name}: ${e.message.split('\n')[0]}`); }
      }
      console.log(`\nOpgeslagen in ${dir} (staat niet in git). Zet ze niet op GitHub.`);
      break;
    }

    case 'can': {
      if (!args[0] || args[0] === 'list') {
        console.log(await evaluate(`pandaCan.functions.map((f) => f.id.padEnd(14) + (f.kind === 'value' ? '<waarde>' : 'on|off').padEnd(10) + f.label).join('\\n')`));
        break;
      }
      const [func, action] = args;
      const isValue = !['on', 'off'].includes(action);
      console.log(await evaluate(`(() => { ${can(func, isValue ? 'value' : action, isValue ? action : '')}; return 'CAN ' + ${JSON.stringify(`${func} ${action}`)}; })()`));
      break;
    }

    case 'sim': {
      const hold = args.includes('--hold');
      const rest = args.filter((a) => a !== '--hold');
      if (rest[0] === 'reset') {
        console.log(await evaluate(`(() => { const h = window.__pandaSim; if (h) { clearInterval(h.timer); window.__pandaSim = undefined; }
          const s = pandaStore.getState(); s.setGearOverride(null); s.setSpeed(0); return 'nadoen gestopt; PandaOS volgt de auto weer'; })()`));
        break;
      }
      const [what, a, b] = rest;
      const code = what === 'door' ? simDoor(a, b) : simCode(what, a);
      if (!code) throw new Error('Gebruik: sim gear|speed|lights|high|blinker|door|brake|fuel|temp|range|seatbelt|reverse <stand> [--hold]');
      const key = what === 'door' ? `door_${a}` : what;
      console.log(await evaluate(hold ? holdCode(key, code) : `(() => { ${code}; return ${JSON.stringify(`gedaan: ${rest.join(' ')}`)}; })()`));
      break;
    }

    case 'camera':
      console.log(await evaluate(`(() => { const s = pandaStore.getState(); ${args[0] === 'close' ? 's.closeCamera()' : 's.openCamera()'}; return 'camera ' + (pandaStore.getState().isCameraOpen ? 'open' : 'dicht'); })()`));
      break;

    case 'audio': {
      if (args[0] === 'eq') {
        const keys = ['sub', 'bass', 'lowMid', 'mid', 'highMid', 'treble'];
        const vals = args.slice(1).map(Number);
        const patch = Object.fromEntries(keys.map((k, i) => [k, Math.max(-6, Math.min(6, vals[i] || 0))]));
        console.log(await evaluate(`(() => { const s = pandaStore.getState(); pandaStore.setState({ audioSettings: { ...s.audioSettings, ...${JSON.stringify(patch)} } }); return ${JSON.stringify(`klank: ${JSON.stringify(patch)}`)}; })()`));
        break;
      }
      console.log(await evaluate(`JSON.stringify({ kan: JSON.parse(PandaAndroid.getAudioFxState()), bronnen: JSON.parse(PandaAndroid.getAudioSources()) }, null, 2)`));
      break;
    }

    case 'shot': {
      const dir = join(TOOLS, 'radio-shots');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${args[0] || new Date().toISOString().replace(/[:.]/g, '-')}.png`);
      writeFileSync(file, execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));
      console.log(`Opgeslagen: ${file} (niet in git; kan persoonlijke gegevens tonen, deel hem niet zomaar)`);
      break;
    }

    case 'test': {
      // Rondje: elke stap doet iets na en leest terug wat PandaOS ervan maakt. Daarna alles terug.
      const S = 'pandaStore.getState()';
      let passed = 0; let failed = 0;
      const step = async (name, code, expr, test, wait = 700) => {
        try {
          await evaluate(`(() => { ${code}; return 1; })()`);
          await new Promise((r) => setTimeout(r, wait));
          const got = JSON.parse(await evaluate(`JSON.stringify(${expr})`));
          const good = test(got);
          good ? passed++ : failed++;
          ok(good, `${name}  ->  ${JSON.stringify(got)}`);
        } catch (e) { failed++; ok(false, `${name}: ${e.message}`); }
      };
      await step('achteruit (CAN) -> R', can('reverse', 'on'), `${S}.gear`, (v) => v === 'R', 1500);
      await step('uit achteruit', can('reverse', 'off'), `${S}.gear`, (v) => v !== 'R', 1500);
      await step('stadslicht', simCode('lights', 'parking'), `${S}.carState.lights`, (v) => v === 'parking');
      await step('dimlicht', simCode('lights', 'low'), `${S}.carState.lights`, (v) => v === 'low');
      await step('grootlicht', simCode('high', 'on'), `${S}.carState.highBeam`, (v) => v === true);
      await step('knipperlicht links', simCode('blinker', 'left'), `${S}.carState.blinker`, (v) => v === 'left');
      await step('alarmlichten', simCode('blinker', 'hazard'), `${S}.carState.blinker`, (v) => v === 'hazard');
      await step('deur linksvoor open', simDoor('fl', 'open'), `${S}.carState.doors.fl`, (v) => v === true);
      await step('handrem', simCode('brake', 'on'), `${S}.brakeApplied`, (v) => v === true);
      await step('tank 42%', simCode('fuel', 42), `${S}.carState.fuelPercent`, (v) => v === 42);
      await step('buiten 7 °C', simCode('temp', 7), `${S}.carState.outsideTemp`, (v) => v === 7);
      await step('volume 12', `${S}.setVolume(12)`, `${S}.volume`, (v) => v === 12);
      await step('equalizer beschikbaar', `pandaStore.setState({ audioSettings: { ...${S}.audioSettings, bass: 3 } })`,
        `PandaAndroid.getAudioFxState ? JSON.parse(PandaAndroid.getAudioFxState()).eq : 'oude versie'`, (v) => v === true);
      await step('camera open', `${S}.openCamera()`, `${S}.isCameraOpen`, (v) => v === true, 1500);
      await step('camera dicht', `${S}.closeCamera()`, `${S}.isCameraOpen`, (v) => v === false, 800);
      await evaluate(`(() => { ${simCode('lights', 'off')}; ${simCode('high', 'off')}; ${simCode('blinker', 'off')}; ${simDoor('fl', 'closed')}; ${simCode('brake', 'off')};
        pandaStore.setState({ audioSettings: { ...${S}.audioSettings, bass: 0 } }); return 1; })()`);
      console.log(`\n${passed} geslaagd, ${failed} mislukt. Nagedane standen zijn teruggezet (lampen uit, deur dicht, handrem los, bas 0).`);
      break;
    }
    default:
      console.log('Gebruik: node tools/pandaos.mjs <status|volume|set|open|bluetooth|media|sources|log|js|setup|doctor|apks|can|sim|camera|audio|shot|test> ...  (zie bovenaan dit bestand)');
  }
} catch (e) {
  console.error('Fout:', e.message);
  process.exit(1);
}
