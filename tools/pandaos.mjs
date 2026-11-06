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
//   node tools/pandaos.mjs apks              APK's van de fabrikant (com.jancar.*, systemui, canbus, Android Auto, CarPlay)
//                                            ophalen naar tools/radio-apks/ (staat niet in git)
//   node tools/pandaos.mjs volumes           de 4 Jancar-volumes (meester, Bluetooth, media, navigatie) + Android-muziekvolume
//   node tools/pandaos.mjs volumes music100  Android-muziekvolume (STREAM_MUSIC) op 100 zetten
//   node tools/pandaos.mjs carplay-auto on|off|status    CarPlay automatisch verbinden (CarplayAutoConnectSwitch)
//   node tools/pandaos.mjs immersive on|off|status       systeembalken verbergen (policy_control immersive.full=*)
//   node tools/pandaos.mjs overscan hide|reset|status    onderste balk wegschuiven (wm overscan 0,-110,0,0)
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
// DevTools (status, js, sim, can, audio, camera, test en een deel van doctor) werkt alleen als WebView-debugging aan staat:
// in debug-builds altijd, vanaf 1.4.0 ook via PandaOS Instellingen -> Software -> Build -> 'Ontwikkelaar'.
//
// adb zoeken: $ADB, dan adb op het PATH, dan %LOCALAPPDATA%\Android\Sdk\platform-tools, C:\pandaos-test\platform-tools,
// platform-tools naast tools/ of de repo, en platform-tools in Downloads.
//
// Privacy: geen enkel commando toont contacten, nummers of berichten; "sources" geeft alleen aantallen.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const PKG = 'nl.pandaos.launcher';

// adb zoeken (zie bovenaan). Geeft { path, searched } terug; path is null als er niets gevonden is.
function findAdb() {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const searched = [];
  if (process.env.ADB) {
    searched.push(`$ADB (${process.env.ADB})`);
    if (existsSync(process.env.ADB)) return { path: process.env.ADB, searched };
  }
  searched.push('adb op het PATH');
  try {
    const found = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['adb'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    if (found && existsSync(found)) return { path: found, searched };
  } catch { /* niet op het PATH */ }
  const dirs = [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools'),
    process.platform === 'win32' && 'C:\\pandaos-test\\platform-tools',
    join(TOOLS, 'platform-tools'),
    join(TOOLS, '..', 'platform-tools'),
    join(homedir(), 'Downloads', 'platform-tools'),
    join(homedir(), 'Downloads', 'platform-tools-latest-windows', 'platform-tools'),
  ].filter(Boolean);
  for (const d of dirs) {
    const p = join(d, exe);
    searched.push(p);
    if (existsSync(p)) return { path: p, searched };
  }
  return { path: null, searched };
}
const ADB_FOUND = findAdb();
const ADB = ADB_FOUND.path;
const adbMissing = () => new Error(`adb niet gevonden. Gezocht in:\n  - ${ADB_FOUND.searched.join('\n  - ')}\n`
  + 'Download "SDK Platform-Tools" van developer.android.com, pak uit (bijv. naar C:\\pandaos-test\\platform-tools)\n'
  + 'of wijs adb aan met: $env:ADB = "C:\\pad\\naar\\adb.exe"');
const PORT = 9333;
const adb = (...args) => {
  if (!ADB) throw adbMissing();
  return execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
};
const DEVTOOLS_HINT = 'Geen WebView-DevTools in PandaOS. Zet in PandaOS Instellingen → Software → Build op \'Ontwikkelaar\' (vanaf 1.4.0) en probeer opnieuw.';
const devtoolsError = (detail) => Object.assign(new Error(`${DEVTOOLS_HINT}${detail ? `\n  (${detail})` : ''}`), { devtools: true });
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
  const socket = `webview_devtools_remote_${pid.split(/\s+/)[0]}`;
  // Staat WebView-debugging uit, dan bestaat de DevTools-socket niet (release-build zonder 'Ontwikkelaar').
  const sockets = sh('cat /proc/net/unix');
  if (!sockets.startsWith('FOUT') && !sockets.includes(socket)) throw devtoolsError(`socket @${socket} niet gevonden`);
  try { adb('forward', `tcp:${PORT}`, `localabstract:${socket}`); } catch (e) { throw devtoolsError(`adb forward: ${(e.stderr || e.message || '').toString().trim().split('\n')[0]}`); }
  let pages;
  try { pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch (e) { throw devtoolsError(`DevTools antwoordt niet: ${e.cause?.code || e.message}`); }
  const page = pages.find((p) => p.url.endsWith('/index.html')) || pages[0];
  if (!page?.webSocketDebuggerUrl) throw devtoolsError('geen PandaOS-pagina in DevTools');
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

// Een instelling via adb lezen/zetten met een korte stand-melding (carplay-auto, immersive)
const showSetting = (label, ns, key) => console.log(`${label}: ${sh(`settings get ${ns} ${key}`)}`);

const COMMANDS = ['status', 'volume', 'volumes', 'set', 'open', 'bluetooth', 'media', 'sources', 'log', 'js', 'setup', 'doctor', 'apks',
  'bt-check', 'carplay-auto', 'immersive', 'overscan', 'can', 'sim', 'camera', 'audio', 'shot', 'test'];
const [cmd, ...args] = process.argv.slice(2);
try {
  if (COMMANDS.includes(cmd) && !ADB) throw adbMissing();
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
      const LISTENER = `${PKG}/${PKG}.MediaListenerService`;
      if (!listeners.split(':').includes(LISTENER)) {
        // Oude, verkeerde PandaOS-vermelding (…MediaWatcher uit eerdere versies van dit script) weghalen
        const others = listeners && listeners !== 'null' && !listeners.startsWith('FOUT') ? listeners.split(':').filter((l) => l && !l.startsWith(`${PKG}/`)) : [];
        sh(`settings put secure enabled_notification_listeners "${[...others, LISTENER].join(':')}"`);
      }
      ok(sh('settings get secure enabled_notification_listeners').split(':').includes(LISTENER), 'meldingen-toegang (muziek van andere apps)');
      console.log('\nKlaar. Controleren: node tools/pandaos.mjs doctor');
      break;
    }

    case 'doctor': {
      console.log(`adb: ${ADB}`);
      const state = sh('echo ok');
      ok(state === 'ok', state === 'ok' ? 'radio verbonden via adb' : `geen radio via adb: ${state}`);
      if (state !== 'ok') break;
      console.log(`Apparaat: ${sh('getprop ro.product.model')} · Android ${sh('getprop ro.build.version.release')} (SDK ${sh('getprop ro.build.version.sdk')}) · ${sh('getprop ro.board.platform')}`);
      const pkg = sh(`dumpsys package ${PKG}`);
      ok(/versionName=/.test(pkg), `PandaOS geïnstalleerd ${(pkg.match(/versionName=(\S+)/) || [])[1] || ''}`);
      ok(sh('cmd package resolve-activity -a android.intent.action.MAIN -c android.intent.category.HOME').includes(PKG), 'PandaOS is het startscherm');
      for (const perm of GRANTS) ok(pkg.includes(`${perm}: granted=true`), perm.split('.').pop());
      ok(/allow/.test(sh(`appops get ${PKG} SYSTEM_ALERT_WINDOW`)), 'boven andere apps tonen');
      ok(sh('settings get global enable_freeform_support') === '1', 'vrije vensters (half openen)');
      ok(sh('settings get secure enabled_notification_listeners').includes(`${PKG}/${PKG}.MediaListenerService`), 'meldingen-toegang (MediaListenerService)');
      console.log(`  balken verbergen: ${sh('settings get global policy_control')}`);
      console.log(`  CarPlay automatisch verbinden: ${sh('settings get global CarplayAutoConnectSwitch')}`);
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
      } catch (e) {
        if (e.devtools) { ok(false, 'verbinding met PandaOS (DevTools)'); console.log(`  ${e.message.replace(/\n/g, '\n  ')}`); console.log('  (de adb-controles hierboven gelden wel)'); }
        else ok(false, `verbinding met PandaOS: ${e.message}`);
      }
      break;
    }

    case 'apks': {
      const dir = join(TOOLS, 'radio-apks');
      mkdirSync(dir, { recursive: true });
      // Naast de naam-filter ook apps van de fabrikant met een algemene naam: Jancar ivi-systemui, ivi-canbus,
      // de Android Auto-ontvanger en CarPlay (com.autochips.*).
      const EXTRA = ['com.android.systemui', 'com.can.activity', 'com.google.android.projection.sink'];
      const pkgs = sh('pm list packages -f').split('\n')
        .map((l) => l.trim().match(/^package:(.+)=([^=\s]+)$/)).filter(Boolean)
        .filter((m) => EXTRA.includes(m[2]) || m[2].startsWith('com.autochips.')
          || /jancar|syu|fyt|microntek|autochips|carplay|carsetting|canbus|audiosetting/i.test(m[2]));
      for (const name of EXTRA) if (!pkgs.some((m) => m[2] === name)) console.log(`- ${name}: niet op deze radio`);
      if (!pkgs.length) { console.log('Geen apps van de fabrikant gevonden.'); break; }
      for (const [, path, name] of pkgs) {
        try { adb('pull', path, join(dir, `${name}.apk`)); ok(true, name); } catch (e) { ok(false, `${name}: ${e.message.split('\n')[0]}`); }
      }
      console.log(`\nOpgeslagen in ${dir} (staat niet in git). Zet ze niet op GitHub.`);
      break;
    }

    case 'volumes': {
      if (args[0] === 'music100') {
        const out = sh('media volume --stream 3 --set 100');
        ok(!out.startsWith('FOUT') && !/Exception|Error/i.test(out), 'Android-muziekvolume (STREAM_MUSIC) op 100');
      } else if (args[0]) throw new Error('Gebruik: volumes [music100]');
      // De Jancar-volumes staan alleen in het logboek; de laatste regel telt. Ontbreekt hij, dan is het volume sinds opstarten niet gewijzigd.
      const log = adb('logcat', '-d').split('\n');
      const MARKERS = [['meester', 'onVolumeChanged: VOLUME_MASTER :'], ['Bluetooth', 'onVolumeChanged: VOLUME_BLUETOOTH :'],
        ['media', 'setParam: VOLUME_MEDIA_CCD to'], ['navigatie', 'setParam: VOLUME_NAVIGATION to']];
      for (const [label, marker] of MARKERS) {
        let value = null;
        for (let i = log.length - 1; i >= 0 && value === null; i--) {
          const at = log[i].lastIndexOf(marker);
          if (at >= 0) value = (log[i].slice(at + marker.length).match(/-?\d+/) || [])[0] ?? null;
        }
        console.log(`  ${label.padEnd(10)} ${value ?? 'onbekend (nog niet gewijzigd sinds opstarten)'}`);
      }
      const music = sh('media volume --stream 3 --get');
      const m = music.match(/volume is (\d+) in range \[(\d+)\.\.(\d+)\]/);
      console.log(`  Android STREAM_MUSIC: ${m ? `${m[1]} (bereik ${m[2]}-${m[3]})` : music.split('\n').pop()}`);
      break;
    }

    // Bluetooth: telefoon en OBD2-dongle tegelijk? Alleen aantallen en profielnamen, nooit adressen of namen van mensen.
    case 'bt-check': {
      const dump = sh('dumpsys bluetooth_manager');
      const lines = dump.split('\n');
      const pick = (re) => lines.filter((l) => re.test(l)).map((l) => l.trim().replace(/([0-9A-F]{2}:){5}[0-9A-F]{2}/gi, 'XX:XX:XX:XX:XX:XX'));
      console.log('Bluetooth-stack van de radio (dumpsys bluetooth_manager, adressen gemaskeerd):');
      for (const l of pick(/^\s*(enabled|state|name):/i).slice(0, 4)) console.log('  ' + l);
      console.log('Profielen met een verbinding:');
      for (const l of pick(/(A2dpSink|HeadsetClient|AvrcpController|PbapClient|MapClient|Sap|Hid|Pan).*(Connected|STATE_CONNECTED|state=2)/i).slice(0, 12)) console.log('  ' + l);
      console.log('RFCOMM / SPP (OBD2-dongles gebruiken SPP):');
      for (const l of pick(/rfcomm|spp|serial port/i).slice(0, 8)) console.log('  ' + l);
      const max = sh('getprop persist.bluetooth.maxconnectedaudiodevices').trim();
      console.log(`Max. audio-apparaten tegelijk (persist.bluetooth.maxconnectedaudiodevices): ${max || 'niet gezet (standaard 1 voor audio)'}`);
      console.log('Let op: dit gaat over AUDIO. Een OBD2-dongle is geen audio (SPP), die telt hier niet mee.');
      // In PandaOS zelf (Ontwikkelaar-stand): wat ziet de launcher?
      try {
        const info = await evaluate('JSON.stringify(window.PandaAndroid && PandaAndroid.obdBluetoothInfo ? JSON.parse(PandaAndroid.obdBluetoothInfo()) : null)');
        console.log('PandaOS (obdBluetoothInfo): ' + info);
      } catch { console.log('PandaOS: niet bereikbaar (Instellingen > Software > Build op Ontwikkelaar?)'); }
      break;
    }

    case 'carplay-auto': {
      if (['on', 'off'].includes(args[0])) sh(`settings put global CarplayAutoConnectSwitch ${args[0] === 'on' ? 1 : 0}`);
      else if (args[0] && args[0] !== 'status') throw new Error('Gebruik: carplay-auto on|off|status');
      showSetting('CarPlay automatisch verbinden (CarplayAutoConnectSwitch)', 'global', 'CarplayAutoConnectSwitch');
      break;
    }

    case 'immersive': {
      if (args[0] === 'on') sh('settings put global policy_control immersive.full=*');
      else if (args[0] === 'off') sh('settings put global policy_control null');
      else if (args[0] && args[0] !== 'status') throw new Error('Gebruik: immersive on|off|status');
      showSetting('systeembalken verbergen (policy_control)', 'global', 'policy_control');
      break;
    }

    case 'overscan': {
      if (args[0] === 'hide') sh('wm overscan 0,-110,0,0');
      else if (args[0] === 'reset') sh('wm overscan reset');
      else if (args[0] && args[0] !== 'status') throw new Error('Gebruik: overscan hide|reset|status');
      const dump = sh('dumpsys window displays');
      console.log(`overscan: ${(dump.match(/overscan=\[[^\]]*\]|mOverscan[^\n]*/i) || [])[0] || '(niet in dumpsys; hide = 0,-110,0,0, reset = 0,0,0,0)'}`);
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
      console.log(`Gebruik: node tools/pandaos.mjs <${COMMANDS.join('|')}> ...  (zie bovenaan dit bestand)
  volumes [music100]              Jancar-volumes uit het logboek + Android-muziekvolume (music100 = op 100)
  bt-check                        Bluetooth: telefoon + OBD2 tegelijk? Profielen en SPP (adressen gemaskeerd)
  carplay-auto on|off|status      CarPlay automatisch verbinden
  immersive on|off|status         systeembalken verbergen
  overscan hide|reset|status      onderste balk wegschuiven / terugzetten
Commando's met DevTools (status, js, sim, can, audio, camera, test) vragen WebView-debugging:
  PandaOS Instellingen → Software → Build op 'Ontwikkelaar' (vanaf 1.4.0).
adb: ${ADB || 'niet gevonden (zet $env:ADB of zie bovenaan dit bestand)'}`);
  }
} catch (e) {
  console.error('Fout:', e.message);
  process.exit(1);
}
