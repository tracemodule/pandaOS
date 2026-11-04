import React, { useEffect, useRef, useState } from 'react';
import JMuxer from 'jmuxer';
import { useUIStore } from '../../../src/store/uiStore';

const CarPlayApp: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const jmuxerRef = useRef<any>(null);
    const { isCarPlayOpen } = useUIStore();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isCarPlayOpen) return;

        // Initialiseer Jmuxer
        jmuxerRef.current = new JMuxer({
            node: videoRef.current,
            mode: 'video',
            flushingTime: 0,
            fps: 30,
            debug: false
        });

        // VERBIND MET DE CARPLAY POORT (5005), NIET DE SYSTEEM POORT (8080)
        wsRef.current = new WebSocket('ws://localhost:5005');
        wsRef.current.binaryType = 'arraybuffer';

        wsRef.current.onopen = () => {
            console.log("[CarPlay] Verbonden met video stream op poort 5005");
            setLoading(false);
        };

        wsRef.current.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer && jmuxerRef.current) {
                jmuxerRef.current.feed({
                    video: new Uint8Array(event.data)
                });
            }
        };

        wsRef.current.onclose = () => {
            console.log("[CarPlay] Stream gesloten");
        };

        return () => {
            if (wsRef.current) wsRef.current.close();
            if (jmuxerRef.current) jmuxerRef.current.destroy();
        };
    }, [isCarPlayOpen]);

    const handleTouch = (action: number, e: React.MouseEvent | React.TouchEvent) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const rect = videoRef.current?.getBoundingClientRect();
        if (!rect) return;

        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;

        wsRef.current.send(JSON.stringify({ type: 'touch', action, x, y }));
    };

    if (!isCarPlayOpen) return null;

    return (
        <div style={{ 
            position: 'absolute', 
            top: 0, left: 0, 
            width: '100%', height: '100%', 
            background: '#000', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            zIndex: 100 
        }}>
            {loading && <div style={{color: 'white'}}>CarPlay laden...</div>}
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'contain',
                    display: loading ? 'none' : 'block' 
                }}
                onMouseDown={(e) => handleTouch(14, e)}
                onMouseMove={(e) => e.buttons === 1 && handleTouch(15, e)}
                onMouseUp={(e) => handleTouch(16, e)}
                onTouchStart={(e) => handleTouch(14, e)}
                onTouchMove={(e) => handleTouch(15, e)}
                onTouchEnd={(e) => handleTouch(16, e)}
            />
        </div>
    );
};

export default CarPlayApp;