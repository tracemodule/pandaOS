import React, { useEffect, useRef, useState } from 'react';
import { X, SwitchCamera, FlipHorizontal2, CameraOff } from 'lucide-react';
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

const RearCamera: React.FC = () => {
    const { gear, isCameraOpen, closeCamera } = useUIStore();
    const t = useT();
    const inReverse = gear === 'R' && PANDA_CONFIG.REAR_CAMERA_PARKING;
    const visible = inReverse || isCameraOpen;

    const videoRef = useRef<HTMLVideoElement>(null);
    const [prefs, setPrefs] = useState<CameraPrefs>(loadPrefs);
    const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
    const [status, setStatus] = useState<'starting' | 'live' | 'none'>('starting');

    // Camera starten zolang het scherm open is; bij sluiten of wisselen de oude stream stoppen
    useEffect(() => {
        if (!visible) return;
        let stream: MediaStream | null = null;
        let cancelled = false;
        setStatus('starting');
        const start = async () => {
            try {
                if (!navigator.mediaDevices?.getUserMedia) throw new Error('geen camera-API');
                const video: MediaTrackConstraints = prefs.deviceId
                    ? { deviceId: { exact: prefs.deviceId } }
                    : { facingMode: { ideal: 'environment' } };
                stream = await navigator.mediaDevices.getUserMedia({ video, audio: false })
                    .catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false })); // gekozen camera weg: neem er een
                if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => undefined);
                }
                // Namen van de camera's zijn pas bekend na toestemming
                const devices = await navigator.mediaDevices.enumerateDevices();
                if (!cancelled) setCameras(devices.filter((d) => d.kind === 'videoinput'));
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
    }, [visible, prefs.deviceId]);

    if (!visible) return null;

    const updatePrefs = (next: CameraPrefs) => { setPrefs(next); savePrefs(next); };
    // Volgende camera (als de radio er meerdere heeft)
    const nextCamera = () => {
        if (cameras.length < 2) return;
        const current = videoRef.current?.srcObject instanceof MediaStream
            ? (videoRef.current.srcObject as MediaStream).getVideoTracks()[0]?.getSettings().deviceId : prefs.deviceId;
        const index = cameras.findIndex((c) => c.deviceId === current);
        updatePrefs({ ...prefs, deviceId: cameras[(index + 1) % cameras.length].deviceId });
    };

    const roundButton: React.CSSProperties = {
        display: 'flex', padding: 8, border: 'none', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer',
    };

    return (
        <div className="rear-camera-overlay" style={{
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
                    {cameras.length > 1 && (
                        <button style={roundButton} onClick={nextCamera} aria-label={t('Switch camera')}><SwitchCamera size={22} /></button>
                    )}
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
