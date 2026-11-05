// PandaOS-paneel: veeg vanaf de bovenrand omlaag (op de radio, in plaats van het Android-paneel).
// Snelknoppen (wifi, Bluetooth, weergave, instellingen), helderheid, volume en de meldingen van Android-apps
// (via de meldingen-luisteraar van de launcher). Sluiten: omhoog vegen of naast het paneel tikken.
// Of dit paneel of dat van Android verschijnt: Settings > Apps > Paneel (appSettings.panel).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff, Bluetooth, BluetoothOff, SunMoon, Settings, Sun, Volume2, X, Smartphone, Gauge } from 'lucide-react';
import { useUIStore, VOLUME_MAX } from '../../store/uiStore';
import { getEffectiveTheme } from '../../settings';
import { getAndroidAppIcon, isAndroidLauncher, launchAndroidPackage } from '../../store/appLinks';
import TeslaSlider from '../settings/TeslaSlider';
import { useT } from '../../i18n';
import './_panda-panel.scss';

interface PanelNotification { key: string; app: string; package: string; title: string; text: string; time: number; clearable: boolean }

const bridge = () => (window as any).PandaAndroid;
const OPEN_DISTANCE = 40; // px omlaag vegen om te openen
const EDGE_HEIGHT = 48; // bovenste strook (px) waar een veeg omlaag het paneel opent

const formatTime = (time: number) => new Date(time).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

// overlay: het menu boven een andere app (OverlayApp); sluiten = onClose, Instellingen = PandaOS naar voren
const PandaPanel: React.FC<{ overlay?: boolean; onClose?: () => void }> = ({ overlay = false, onClose }) => {
  const t = useT();
  const {
    appSettings, screenMode, setScreenMode, vehicleLightsOn, displaySettings, updateDisplaySetting,
    volume, setVolume, openSettingsTab,
  } = useUIStore();
  const [open, setOpenState] = useState(overlay); // boven een andere app: meteen open (OverlayApp toont het pas bij 'panel')
  const setOpen = useCallback((value: boolean) => { setOpenState(value); if (!value) onClose?.(); }, [onClose]);
  const [notifications, setNotifications] = useState<PanelNotification[]>([]);
  const [wifi, setWifi] = useState<{ enabled: boolean; ssid?: string | null } | null>(null);
  const [bt, setBt] = useState<{ enabled?: boolean; devices?: { name: string; connected: boolean }[] } | null>(null);
  const dragStart = useRef<number | null>(null);
  // Optimalisatie: vrij werkgeheugen en de uitkomst van 'Apps sluiten'
  const [memory, setMemory] = useState<{ totalMb: number; availableMb: number } | null>(null);
  const [optimized, setOptimized] = useState<{ closed: number; freedMb: number } | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const enabled = isAndroidLauncher() && (appSettings.panel ?? 'pandaos') === 'pandaos';

  const read = useCallback(() => {
    const b = bridge();
    if (!b) return;
    try { setNotifications(JSON.parse(b.getNotifications?.() ?? '[]')); } catch { setNotifications([]); }
    try { setWifi(JSON.parse(b.getWifiState?.() ?? 'null')); } catch { /* geen wifi-status */ }
    try { setBt(JSON.parse(b.getBluetoothState?.() ?? 'null')); } catch { /* geen Bluetooth-status */ }
    try { setMemory(JSON.parse(b.getMemoryInfo?.() ?? 'null')); } catch { /* geen geheugeninfo */ }
  }, []);

  // Bijwerken bij openen, elke 2 s zolang open, en meteen bij een nieuwe melding (launcher -> notificationsChanged)
  useEffect(() => {
    if (!open) return;
    read();
    const timer = setInterval(read, 2000);
    window.addEventListener('pandaos-notifications', read);
    return () => { clearInterval(timer); window.removeEventListener('pandaos-notifications', read); };
  }, [open, read]);

  // Veeg van bovenaf die Android zelf afving: de launcher vraagt het paneel te openen
  useEffect(() => {
    if (!enabled) return;
    const openFromLauncher = () => setOpen(true);
    window.addEventListener('pandaos-open-panel', openFromLauncher);
    return () => window.removeEventListener('pandaos-open-panel', openFromLauncher);
  }, [enabled, setOpen]);

  // Android-paneel blokkeren als het PandaOS-paneel gekozen is (alleen als PandaOS apparaateigenaar is)
  useEffect(() => {
    if (isAndroidLauncher() && !overlay) bridge()?.setSystemPanelBlocked?.(enabled);
  }, [enabled, overlay]);

  // Veeg omlaag vanaf de bovenste 48 px, over de hele breedte. Geen onzichtbare laag erboven: een tik op
  // P R N D, het slot of het profiel gaat gewoon door. Pas als de vinger echt omlaag sleept, opent het paneel
  // (en de klik die daarna nog zou komen wordt tegengehouden).
  useEffect(() => {
    if (!enabled || open || overlay) return; // boven een andere app veegt Android (PandaOverlay) zelf
    let start: { x: number; y: number } | null = null;
    const swallowClick = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); };
    const down = (x: number, y: number) => { start = y <= EDGE_HEIGHT ? { x, y } : null; };
    const move = (x: number, y: number) => {
      if (!start) return;
      const dy = y - start.y;
      if (dy > OPEN_DISTANCE && dy > Math.abs(x - start.x)) {
        start = null;
        window.addEventListener('click', swallowClick, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallowClick, { capture: true }), 400);
        setOpen(true);
      }
    };
    // Aanraken via touch-gebeurtenissen: die lopen door, ook als de WebView de veeg als scrollen overneemt
    // (dan stoppen de pointer-gebeurtenissen met pointercancel). Muis (laptop) via pointer-gebeurtenissen.
    const onTouchStart = (e: TouchEvent) => down(e.touches[0].clientX, e.touches[0].clientY);
    const onTouchMove = (e: TouchEvent) => move(e.touches[0].clientX, e.touches[0].clientY);
    const onPointerDown = (e: PointerEvent) => { if (e.pointerType === 'mouse') down(e.clientX, e.clientY); };
    const onPointerMove = (e: PointerEvent) => { if (e.pointerType === 'mouse') move(e.clientX, e.clientY); };
    const onEnd = () => { start = null; };
    const opts = { capture: true, passive: true };
    window.addEventListener('touchstart', onTouchStart, opts);
    window.addEventListener('touchmove', onTouchMove, opts);
    window.addEventListener('touchend', onEnd, opts);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onEnd, true);
    return () => {
      window.removeEventListener('touchstart', onTouchStart, opts);
      window.removeEventListener('touchmove', onTouchMove, opts);
      window.removeEventListener('touchend', onEnd, opts);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onEnd, true);
    };
  }, [enabled, open, overlay, setOpen]);

  if (!enabled) return null;

  // Omhoog vegen op het paneel sluit het
  const onPanelDown = (e: React.PointerEvent) => { dragStart.current = e.clientY; };
  const onPanelUp = (e: React.PointerEvent) => {
    if (dragStart.current !== null && dragStart.current - e.clientY > OPEN_DISTANCE) setOpen(false);
    dragStart.current = null;
  };

  // Helderheid: bij Auto de stand die nu geldt (dag of nacht), anders de vaste helderheid
  const brightnessKey = displaySettings.autoBrightness ? (isDarkMode ? 'nightBrightness' : 'dayBrightness') : 'brightness';
  const brightness = displaySettings[brightnessKey] ?? (brightnessKey === 'nightBrightness' ? 60 : 100);
  const connectedPhone = bt?.devices?.find((d) => d.connected);
  const nextScreenMode = screenMode === 'light' ? 'dark' : screenMode === 'dark' ? 'auto' : 'light';

  return (
    <>
      {open && (
        <div className="panda-panel-backdrop" onClick={() => setOpen(false)}>
          <div className={`panda-panel tsl-ui ${isDarkMode ? 'dark-mode' : ''}`} onClick={(e) => e.stopPropagation()}
            onPointerDown={onPanelDown} onPointerUp={onPanelUp}>

            {/* Snelknoppen */}
            <div className="panel-tiles">
              <button className={`panel-tile ${wifi?.enabled ? 'is-on' : ''}`}
                onClick={() => { bridge()?.setWifiEnabled(!wifi?.enabled); setTimeout(read, 800); }}>
                {wifi?.enabled ? <Wifi size={22} /> : <WifiOff size={22} />}
                <span className="tile-title">{t('Wi-Fi')}</span>
                <span className="tile-sub">{wifi?.enabled ? (wifi.ssid || t('Not connected')) : t('Off')}</span>
              </button>
              <button className={`panel-tile ${bt?.enabled ? 'is-on' : ''}`}
                onClick={() => { bridge()?.setBluetoothEnabled(!bt?.enabled); setTimeout(read, 1000); }}>
                {bt?.enabled ? <Bluetooth size={22} /> : <BluetoothOff size={22} />}
                <span className="tile-title">{t('Bluetooth')}</span>
                <span className="tile-sub">{bt?.enabled ? (connectedPhone?.name || t('Not connected')) : t('Off')}</span>
              </button>
              <button className="panel-tile is-on" onClick={() => setScreenMode(nextScreenMode)}>
                <SunMoon size={22} />
                <span className="tile-title">{t('Appearance')}</span>
                <span className="tile-sub">{t(screenMode === 'light' ? 'Light' : screenMode === 'dark' ? 'Dark' : 'Auto')}</span>
              </button>
              <button className="panel-tile" onClick={() => {
                if (overlay) bridge()?.openPandaOS('Display'); else { openSettingsTab('Display'); setOpen(false); }
              }}>
                <Settings size={22} />
                <span className="tile-title">{t('Settings')}</span>
                <span className="tile-sub">PandaOS</span>
              </button>
              <button className="panel-tile" onClick={() => { launchAndroidPackage('com.android.settings'); setOpen(false); }}>
                <Smartphone size={22} />
                <span className="tile-title">{t('Android Settings')}</span>
                <span className="tile-sub">Android</span>
              </button>
            </div>

            {/* Helderheid en volume */}
            <div className="panel-sliders">
              <TeslaSlider value={brightness} min={10} max={100} step={5} format={(v) => `${v}%`}
                iconLeft={<Sun size={18} />} iconRight={<Sun size={24} />}
                onChange={(v) => updateDisplaySetting(brightnessKey, v)} />
              <TeslaSlider value={volume} min={0} max={VOLUME_MAX} step={1} format={(v) => `${v}`}
                iconLeft={<Volume2 size={18} />} iconRight={<Volume2 size={24} />}
                onChange={(v) => setVolume(v)} />
            </div>

            {/* Optimalisatie: apps op de achtergrond sluiten (nooit PandaOS, het toetsenbord of de apps van de radio
                voor auto, Bluetooth en CarPlay). Spelende muziek blijft spelen. */}
            {bridge()?.closeBackgroundApps && (
              <div className="panel-optimize">
                <Gauge size={22} />
                <div className="panel-optimize-text">
                  <span className="tile-title">{t('Optimization')}</span>
                  <span className="tile-sub">
                    {optimized
                      ? `${t('Background apps closed')} · ${optimized.freedMb} MB ${t('freed')}`
                      : memory ? `${(memory.availableMb / 1024).toFixed(1)} ${t('of')} ${(memory.totalMb / 1024).toFixed(1)} GB ${t('memory free')}` : t('Close apps running in the background')}
                  </span>
                  {memory && (
                    <div className="panel-memory-bar">
                      <div style={{ width: `${Math.round((1 - memory.availableMb / memory.totalMb) * 100)}%` }} />
                    </div>
                  )}
                </div>
                <button className="tsl-btn is-small" disabled={optimizing} onClick={() => {
                  setOptimizing(true);
                  // even wachten zodat de knop eerst 'bezig' toont; het sluiten zelf duurt kort
                  setTimeout(() => {
                    try { setOptimized(JSON.parse(bridge().closeBackgroundApps())); } catch { /* niet gelukt */ }
                    setOptimizing(false);
                    read();
                  }, 50);
                }}>{optimizing ? t('Closing…') : t('Close apps')}</button>
              </div>
            )}

            {/* Meldingen van Android-apps */}
            <div className="panel-notifications">
              <div className="tsl-title-row">
                <span className="tsl-title">{t('Notifications')}</span>
                {notifications.some((n) => n.clearable) && (
                  <button className="tsl-link" onClick={() => { bridge()?.dismissAllNotifications(); setTimeout(read, 300); }}>{t('Clear all')}</button>
                )}
              </div>
              {notifications.length === 0 ? (
                <small className="tsl-hint">{bridge()?.hasMediaAccess?.() === false
                  ? t('Allow notification access in Settings > Apps to see notifications here.')
                  : t('No notifications.')}</small>
              ) : (
                <div className="tsl-list">
                  {notifications.map((n) => (
                    <div key={n.key} className="tsl-list-row panel-notification"
                      onClick={() => { bridge()?.openNotification(n.key); setOpen(false); }}>
                      <img src={getAndroidAppIcon(n.package)} alt="" />
                      <div className="tsl-list-text">
                        <span className="tsl-field-text">{n.title}</span>
                        <small className="tsl-hint">{n.app} · {formatTime(n.time)}{n.text ? ` · ${n.text}` : ''}</small>
                      </div>
                      {n.clearable && (
                        <button className="panel-dismiss" aria-label={t('Close')}
                          onClick={(e) => { e.stopPropagation(); bridge()?.dismissNotification(n.key); setTimeout(read, 300); }}>
                          <X size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel-handle" />
          </div>
        </div>
      )}
    </>
  );
};

export default PandaPanel;
