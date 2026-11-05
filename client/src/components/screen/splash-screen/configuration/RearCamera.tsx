import React, { useEffect, useRef, useState } from 'react';
import { X, SwitchCamera, FlipHorizontal2, CameraOff, Settings2, Check, Loader } from 'lucide-react';
import { useUIStore } from '../../../../store/uiStore';
import { PANDA_CONFIG } from '../../../../settings';
import { useT } from '../../../../i18n';

// Achteruitrijcamera: automatisch in R, of geopend via het Camera-pictogram (app-menu/dock).
// Eén camera, beeld over de volle hoogte. Het beeld komt via getUserMedia; op de radio geeft de launcher
// de cameratoegang door (MainActivity.onPermissionRequest). Welke camera en spiegelen worden onthouden.
const STORAGE_KEY = 'pandaos-rear-camera';

interface CameraPrefs { deviceId?: string; mirrored: boolean }
const loadPrefs = (): CameraPrefs => {
    try { return { mirrored: false, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; } catch { return { mirrored: false }; }
};
const savePrefs = (prefs: CameraPrefs) => localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));

// De radio (Jancar UJC201) gebruikt camera 8 voor achteruit ("startRVC … Rear camera: 8"); camera 12 geeft
// "Function not implemented". Chromium noemt camera's "camera2 8, facing back".
const PREFERRED_REAR_CAMERA = '8';
const cameraNumber = (d: MediaDeviceInfo) => d.label.match(/camera2?\s*(\d+)/i)?.[1];
const listCameras = async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
const openCamera = (deviceId?: string) => navigator.mediaDevices.getUserMedia({
    video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false,
});

const RearCamera: React.FC = () => {
    const { gear, isCameraOpen, closeCamera } = useUIStore();
    const t = useT();
    const inReverse = gear === 'R' && PANDA_CONFIG.REAR_CAMERA_PARKING;
    const visible = inReverse || isCameraOpen;

    const videoRef = useRef<HTMLVideoElement>(null);
    const [prefs, setPrefs] = useState<CameraPrefs>(loadPrefs);
    const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
    const [status, setStatus] = useState<'starting' | 'live' | 'none'>('starting');
    const updatePrefs = (next: CameraPrefs) => { setPrefs(next); savePrefs(next); };
    // Camera kiezen: lijst van alle camera's van de radio; 'Zoeken' probeert ze één voor één
    const [pickerOpen, setPickerOpen] = useState(false);
    const [probe, setProbe] = useState<Record<string, 'testing' | 'ok' | 'fail'>>({});

    // Camera starten zolang het scherm open is; bij sluiten of wisselen de oude stream stoppen
    useEffect(() => {
        if (!visible || pickerOpen) return; // tijdens kiezen/zoeken staat de camera dicht
        let stream: MediaStream | null = null;
        let cancelled = false;
        setStatus('starting');
        const start = async () => {
            try {
                if (!navigator.mediaDevices?.getUserMedia) throw new Error('geen camera-API');
                const tried = new Set<string>();
                // Volgorde: eerder gekozen camera, dan camera 8, dan de rest (dubbelen en al geprobeerde eruit)
                const tryAll = async (list: MediaDeviceInfo[]) => {
                    const order = [
                        ...list.filter((d) => d.deviceId === prefs.deviceId),
                        ...list.filter((d) => cameraNumber(d) === PREFERRED_REAR_CAMERA),
                        ...list,
                    ].filter((d, i, all) => all.findIndex((x) => x.deviceId === d.deviceId) === i);
                    for (const d of order) {
                        if (cancelled || stream || tried.has(d.deviceId)) continue;
                        tried.add(d.deviceId);
                        try { stream = await openCamera(d.deviceId || undefined); } catch { /* werkt niet (bijv. 12): volgende */ }
                    }
                };
                let devices = await listCameras();
                await tryAll(devices);
                if (cancelled) { stream?.getTracks().forEach((track) => track.stop()); return; }
                // Vóór de eerste toestemming zijn id's en namen leeg: lijst opnieuw ophalen (ook voor de wisselknop)
                // en de camera's die nog niet geprobeerd zijn alsnog proberen
                devices = await listCameras().catch(() => devices);
                if (!stream) await tryAll(devices);
                if (!cancelled) setCameras(devices);
                if (!stream) throw new Error('geen werkende camera');
                // Zonder namen kon camera 8 niet herkend worden: alsnog naar 8 als die er is en nog niet open
                const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
                const eight = devices.find((d) => cameraNumber(d) === PREFERRED_REAR_CAMERA);
                if (!prefs.deviceId && eight && eight.deviceId && eight.deviceId !== current) {
                    stream.getTracks().forEach((track) => track.stop());
                    stream = null;
                    if (!cancelled) updatePrefs({ ...prefs, deviceId: eight.deviceId }); // effect start opnieuw met camera 8
                    return;
                }
                if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => undefined);
                }
                if (!cancelled) setStatus('live');
            } catch {
                if (!cancelled) setStatus('none');
            }
        };
        start();
        return () => {
            cancelled = true;
            stream?.getTracks().forEach((track) => track.stop());
            if (videoRef.current) videoRef.current.srcObject = null;
        };
    }, [visible, prefs.deviceId, pickerOpen]);

    if (!visible) return null;

    // Volgende camera (als de radio er meerdere heeft)
    const nextCamera = () => {
        if (cameras.length < 2) return;
        const current = videoRef.current?.srcObject instanceof MediaStream
            ? (videoRef.current.srcObject as MediaStream).getVideoTracks()[0]?.getSettings().deviceId : prefs.deviceId;
        const index = cameras.findIndex((c) => c.deviceId === current);
        updatePrefs({ ...prefs, deviceId: cameras[(index + 1) % cameras.length].deviceId });
    };

    // Alle camera's één voor één openen en weer sluiten: welke werkt er?
    // Let op: 'werkt' betekent dat de camera opent; of er beeld op zit, zie je pas na het kiezen.
    const findCameras = async () => {
        let list = cameras;
        try { list = await listCameras(); setCameras(list); } catch { /* oude lijst */ }
        for (const d of list) {
            setProbe((p) => ({ ...p, [d.deviceId]: 'testing' }));
            try {
                const s = await openCamera(d.deviceId || undefined);
                s.getTracks().forEach((track) => track.stop());
                setProbe((p) => ({ ...p, [d.deviceId]: 'ok' }));
            } catch {
                setProbe((p) => ({ ...p, [d.deviceId]: 'fail' }));
            }
        }
    };
    const choose = (deviceId?: string) => { updatePrefs({ ...prefs, deviceId }); setPickerOpen(false); };
    const pickerRow: React.CSSProperties = {
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', border: 'none', borderRadius: 8,
        background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', textAlign: 'left', fontSize: 'calc(15px * var(--text-scale, 1))',
    };

    const roundButton: React.CSSProperties = {
        display: 'flex', padding: 8, border: 'none', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer',
    };

    return (
        // Klikken binnen de camera niet laten doorgaan naar het hoofdvlak (SplashScreen sluit dan alle apps)
        <div className="rear-camera-overlay" onClick={(e) => e.stopPropagation()} style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: '#000', zIndex: 10, display: 'flex', padding: '20px'
        }}>
            <div style={{ flex: 1, backgroundColor: '#222', borderRadius: '12px', position: 'relative', overflow: 'hidden' }}>
                {/* Camerabeeld, over het hele vak; spiegelen voor camera's die een gespiegeld beeld geven */}
                <video ref={videoRef} muted playsInline autoPlay
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                        transform: prefs.mirrored ? 'scaleX(-1)' : 'none', opacity: status === 'live' ? 1 : 0, transition: 'opacity 0.3s' }} />

                {status === 'none' && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', gap: 10, color: '#aaa', fontSize: 'calc(15px * var(--text-scale, 1))' }}>
                        <CameraOff size={36} />
                        {t('No camera found. Connect the reversing camera to the radio.')}
                    </div>
                )}

                {/* Knoppen rechtsboven: andere camera, spiegelen, sluiten (alleen als je hem zelf opende) */}
                <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1, display: 'flex', gap: 8 }}>
                    {cameras.length > 1 && !pickerOpen && (
                        <button style={roundButton} onClick={nextCamera} aria-label={t('Switch camera')}><SwitchCamera size={22} /></button>
                    )}
                    <button style={{ ...roundButton, background: pickerOpen ? 'rgba(62,106,225,0.85)' : roundButton.background }}
                        onClick={() => setPickerOpen(!pickerOpen)} aria-label={t('Choose camera')}><Settings2 size={22} /></button>
                    {status === 'live' && (
                        <button style={{ ...roundButton, background: prefs.mirrored ? 'rgba(62,106,225,0.85)' : roundButton.background }}
                            onClick={() => updatePrefs({ ...prefs, mirrored: !prefs.mirrored })} aria-label={t('Mirror')}>
                            <FlipHorizontal2 size={22} />
                        </button>
                    )}
                    {!inReverse && (
                        <button style={roundButton} onClick={closeCamera} aria-label={t('Close')}><X size={22} /></button>
                    )}
                </div>

                {pickerOpen && (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 2, background: 'rgba(20,20,20,0.96)', padding: '16px 20px',
                        display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', color: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: 'calc(17px * var(--text-scale, 1))', flex: 1 }}>{t('Choose camera')}</span>
                            <button onClick={findCameras} style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: 'rgba(255,255,255,0.12)',
                                color: '#fff', cursor: 'pointer', fontSize: 'calc(14px * var(--text-scale, 1))', fontWeight: 500 }}>{t('Search')}</button>
                            <button style={roundButton} onClick={() => setPickerOpen(false)} aria-label={t('Close')}><X size={22} /></button>
                        </div>
                        <small style={{ color: '#aaa' }}>{t('Search tries every camera of the radio. The radio itself uses camera 8 for reversing.')}</small>
                        <button style={pickerRow} onClick={() => choose(undefined)}>
                            <span style={{ flex: 1 }}>{t('Automatic (camera 8 first)')}</span>
                            {!prefs.deviceId && <Check size={20} color="#3e6ae1" />}
                        </button>
                        {cameras.length === 0 && <small style={{ color: '#aaa' }}>{t('No cameras found yet. Tap Search.')}</small>}
                        {cameras.map((c, i) => {
                            const state = probe[c.deviceId];
                            return (
                                <button key={c.deviceId || i} style={pickerRow} onClick={() => choose(c.deviceId)}>
                                    <span style={{ flex: 1 }}>
                                        {t('Camera')} {cameraNumber(c) ?? i + 1}
                                        {c.label && <span style={{ color: '#888' }}> · {c.label}</span>}
                                    </span>
                                    {state === 'testing' && <Loader size={18} />}
                                    {state === 'ok' && <span style={{ color: '#25cb55' }}>{t('Works')}</span>}
                                    {state === 'fail' && <span style={{ color: '#ed4e3b' }}>{t('Does not open')}</span>}
                                    {prefs.deviceId === c.deviceId && <Check size={20} color="#3e6ae1" />}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Hulplijnen: viewBox in procenten (SVG-paden kennen geen %) */}
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
                    <path d="M 22 100 L 38 45" stroke="#25cb55" strokeWidth="0.8" fill="none" vectorEffect="non-scaling-stroke" />
                    <path d="M 78 100 L 62 45" stroke="#25cb55" strokeWidth="0.8" fill="none" vectorEffect="non-scaling-stroke" />
                    <path d="M 29 76 L 71 76" stroke="#ffcc00" strokeWidth="0.8" fill="none" vectorEffect="non-scaling-stroke" />
                    <path d="M 25 88 L 75 88" stroke="#ed4e3b" strokeWidth="0.8" fill="none" vectorEffect="non-scaling-stroke" />
                </svg>
            </div>
        </div>
    );
};

export default RearCamera;
