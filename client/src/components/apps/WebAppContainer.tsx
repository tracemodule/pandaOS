import React from 'react';
import { useUIStore } from '../../store/uiStore';
import { X, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { getEffectiveTheme } from '../../settings';

const WebAppContainer: React.FC = () => {
  const { activeWebApp, closeWebApp, screenMode } = useUIStore();
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  const theme = getEffectiveTheme(screenMode);
  const isDarkMode = theme === 'dark';

  if (!activeWebApp) return null;

  // URLs voor de web players
  const appUrls = {
    // Optie A: De officiële, volledige Web Player.
    // LET OP: In een normale browser (Chrome/Edge) krijg je hier waarschijnlijk een "Refused to connect" 
    // error omdat Spotify iframes blokkeert. Zodra je dit in Electron stopt, kun je die blokkade uitzetten!
    // spotify: 'https://open.spotify.com', 

    // Optie B: Een werkende Embed link (Top 50 Global playlist).
    // Gebruik deze om NU in je browser te testen of de container visueel goed werkt.
    spotify: 'https://open.spotify.com/',
    
    youtube: 'https://www.youtube.com',
    netflix: 'https://www.netflix.com'
  };

  const currentUrl = appUrls[activeWebApp];

  return (
    <div 
      style={{ 
        position: 'absolute', 
        top: isFullscreen ? 0 : '60px', // Als fullscreen, bedek de top bar
        bottom: 0, 
        left: isFullscreen ? '-400px' : 0, // Schuif naar links over de sidebar als fullscreen
        right: 0, 
        backgroundColor: isDarkMode ? '#121212' : '#ffffff', 
        zIndex: 50, // Zorg dat het boven de kaart ligt
        display: 'flex', 
        flexDirection: 'column',
        transform: activeWebApp ? 'translateY(0)' : 'translateY(100%)',
        visibility: activeWebApp ? 'visible' : 'hidden',
        pointerEvents: activeWebApp ? 'auto' : 'none',
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
      onClick={(e) => e.stopPropagation()} // Voorkom dat klikken in de app de closeAll triggert
    >
      {/* Custom Title Bar met Controls */}
      <header style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '10px 24px', 
          backgroundColor: isDarkMode ? '#1e1e1e' : '#f5f5f5',
          borderBottom: `1px solid ${isDarkMode ? '#333' : '#ddd'}`,
          color: isDarkMode ? '#fff' : '#000'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'capitalize', fontWeight: 'bold' }}>
          {activeWebApp === 'spotify' && <img src="/assets/icons/spotify.png" width="20" alt="Spotify" />}
          {activeWebApp === 'youtube' && <img src="/assets/icons/youtube.png" width="20" alt="YouTube" />}
          {activeWebApp === 'netflix' && <img src="/assets/icons/netflix.png" width="20" alt="Netflix" />}
          {activeWebApp} Web Player
        </div>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
           <button 
             onClick={() => {
                // Forceer een reload van het iframe
                if (iframeRef.current) iframeRef.current.src = iframeRef.current.src;
             }} 
             style={{ background: 'none', border: 'none', color: isDarkMode ? '#ccc' : '#555', cursor: 'pointer' }}
           >
             <RefreshCw size={20} />
           </button>
           
           <button 
             onClick={() => setIsFullscreen(!isFullscreen)} 
             style={{ background: 'none', border: 'none', color: isDarkMode ? '#ccc' : '#555', cursor: 'pointer' }}
           >
             {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
           </button>
           
           <button 
             onClick={() => {
               setIsFullscreen(false);
               closeWebApp();
             }} 
             style={{ background: 'none', border: 'none', color: isDarkMode ? '#ccc' : '#555', cursor: 'pointer' }}
           >
             <X size={24} />
           </button>
        </div>
      </header>

      {/* Het daadwerkelijke iFrame */}
      <div style={{ flex: 1, backgroundColor: '#000', position: 'relative' }}>
        <iframe
          ref={iframeRef}
          src={currentUrl}
          title={`${activeWebApp} player`}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      </div>
    </div>
  );
};

export default WebAppContainer;