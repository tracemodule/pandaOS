import React, { useState, useEffect } from 'react';
import { Search, ThumbsUp, ThumbsDown, Play, Pause, SkipForward, Star, SlidersHorizontal, ChevronDown, X, Music, Disc, Library, ChevronLeft } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useMediaController } from './useMediaController';
import { fetchAlbumTracks, fetchPlaylistTracks } from '../../services/spotify';
import { getEffectiveTheme } from '../../../src/settings';
import { useT } from '../../i18n';

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const MusicApp: React.FC = () => {
  const { 
    isMusicOpen, toggleMusic, toggleAudioSettings, 
    currentTrack, currentArtist, albumArt, mediaPosition, mediaDuration, btAudioState, btDevices, btKnownDevices, btConnectedAddress, screenMode, vehicleLightsOn,
    spotifyItems, searchQuery, setSearchQuery, performSearch, loadSpotifyPlaylists,
    isSpotifyAuthorized, loginSpotify 
  } = useUIStore();
  
  const { isPlaying, togglePlayPause, playNext, mediaSource, changeSource, handleItemClick } = useMediaController();
  
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const t = useT();
  const [activeTab, setActiveTab] = useState<'library' | 'track' | 'album'>('library');
  const [viewContext, setViewContext] = useState<{id: string, name: string, type: string} | null>(null);
  const [contextItems, setContextItems] = useState<any[]>([]);
  const [nowPlayingImg, setNowPlayingImg] = useState<string>('https://placehold.co/60/202124/FFFFFF?text=Music');
  
  const [theme, setTheme] = useState(getEffectiveTheme(screenMode, vehicleLightsOn));

  useEffect(() => {
    setTheme(getEffectiveTheme(screenMode, vehicleLightsOn));
  }, [screenMode, vehicleLightsOn]);

  useEffect(() => {
      if (isMusicOpen && mediaSource === 'spotify' && isSpotifyAuthorized) {
          if (!viewContext) {
            if (activeTab === 'library') {
                loadSpotifyPlaylists();
            } else {
                (performSearch as any)(searchQuery || 'Popular', activeTab);
            }
          }
      }
  }, [isMusicOpen, mediaSource, isSpotifyAuthorized, activeTab, viewContext]);

  useEffect(() => {
      if (searchQuery.length > 1 && !viewContext) {
          const delayDebounceFn = setTimeout(() => {
            (performSearch as any)(searchQuery, activeTab === 'library' ? 'playlist' : activeTab);
          }, 500); 
          return () => clearTimeout(delayDebounceFn);
      }
  }, [searchQuery, activeTab, viewContext]);

  const onPlayItem = (item: any) => {
      if (item.type === 'track') {
          handleItemClick(item.uri);
          setNowPlayingImg(item.imageUrl);
          useUIStore.setState({ 
              currentTrack: item.name, 
              currentArtist: item.artist 
          });
      } else {
          onOpenContext(item);
      }
  };

  const onOpenContext = async (item: any) => {
      setViewContext(item);
      let tracks = [];
      if (item.type === 'album') tracks = await fetchAlbumTracks(item.id);
      else tracks = await fetchPlaylistTracks(item.id);
      setContextItems(tracks);
  };

  // Op de radio: verbonden telefoon volgens de Bluetooth van Android (zelfde bron als Settings > Bluetooth).
  // De PandaOS-server (laptop/Pi) is daar niet, dus btConnectedAddress blijft dan leeg.
  const [androidPhone, setAndroidPhone] = useState<{ name: string; address: string } | null>(null);
  useEffect(() => {
    const bridge = (window as any).PandaAndroid;
    if (!isMusicOpen || !bridge?.getBluetoothState) return;
    const read = () => {
      try {
        const connected = (JSON.parse(bridge.getBluetoothState()).devices ?? []).filter((d: { connected: boolean }) => d.connected);
        setAndroidPhone(connected.find((d: { phone: boolean }) => d.phone) ?? connected[0] ?? null);
      } catch { setAndroidPhone(null); }
    };
    read();
    const timer = setInterval(read, 3000);
    return () => clearInterval(timer);
  }, [isMusicOpen]);

  if (!isMusicOpen) return null;

  // Verbonden telefoon: op de radio via Android; anders ook na herladen bekend via My Devices (scanlijst dan nog leeg)
  const connectedPhone = androidPhone ?? [...btKnownDevices, ...btDevices].find((d) => d.address === btConnectedAddress);

  const isDarkMode = theme === 'dark';
  const bgColor = isDarkMode ? '#1e1e1e' : '#f5f5f5';
  const textColor = isDarkMode ? '#fff' : '#000';
  const borderColor = isDarkMode ? '#333' : '#ddd';
  const inputBgColor = isDarkMode ? '#333' : '#e0e0e0';

  return (
    // Volledig paneel naast de auto (zoals Settings), geen sheet over de kaart: het rechterpaneel in SplashScreen
    // verzorgt de in/uit-animatie.
    <div
      style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
        backgroundColor: bgColor, color: textColor, zIndex: 40, display: 'flex', flexDirection: 'column'
      }}
      onClick={(e) => { e.stopPropagation(); setDropdownOpen(false); }}
    >

      <div style={{ display: 'flex', alignItems: 'center', padding: '16px 24px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ 
                width: '60px', height: '60px', backgroundColor: borderColor, borderRadius: '4px', 
                backgroundImage: `url(${albumArt || nowPlayingImg})`, backgroundSize: 'cover'
            }}></div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: '220px' }}>
              <span style={{ fontWeight: 600, fontSize: 'calc(16px * var(--text-scale, 1))' }}>{currentTrack || t('Nothing playing')}</span>
              <span style={{ color: '#757575', fontSize: 'calc(14px * var(--text-scale, 1))' }}>{currentArtist}</span>
              {/* Voortgang (van Spotify of de Windows-mediabediening) */}
              {mediaDuration > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: 'calc(11px * var(--text-scale, 1))', color: '#757575' }}>
                  <span>{formatTime(mediaPosition)}</span>
                  <div style={{ flex: 1, height: '3px', backgroundColor: borderColor, borderRadius: '2px' }}>
                    <div style={{ width: `${Math.min(100, (mediaPosition / mediaDuration) * 100)}%`, height: '100%', backgroundColor: textColor, borderRadius: '2px' }} />
                  </div>
                  <span>{formatTime(mediaDuration)}</span>
                </div>
              )}
            </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', color: isDarkMode ? '#ccc' : '#555' }}>
            <ThumbsUp size={24} style={{ cursor: 'pointer' }} />
            <ThumbsDown size={24} style={{ cursor: 'pointer' }} />
            <div onClick={togglePlayPause} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: textColor }}>
                {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
            </div>
            <SkipForward size={24} fill="currentColor" style={{ cursor: 'pointer' }} onClick={playNext} />
            <Star size={24} style={{ cursor: 'pointer' }} />
            <SlidersHorizontal size={24} style={{ cursor: 'pointer', color: textColor }} onClick={toggleAudioSettings} />
        </div>
      </div>

      <div style={{ height: '1px', backgroundColor: borderColor, margin: '0 24px' }}></div>

      <header style={{ display: 'flex', alignItems: 'center', padding: '16px 24px' }}>
        {viewContext ? (
            <button 
                onClick={() => setViewContext(null)}
                style={{ background: isDarkMode ? '#333' : '#eee', color: textColor, border: 'none', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
            >
                <ChevronLeft size={20}/> Back
            </button>
        ) : (
            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: inputBgColor, padding: '8px 12px', borderRadius: '8px', flex: 1, maxWidth: '250px' }}>
              <Search size={20} color="#757575" />
              <input 
                 type="text" placeholder={t(activeTab === 'library' ? 'Search library...' : activeTab === 'track' ? 'Search tracks...' : 'Search albums...')} value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 style={{ border: 'none', background: 'transparent', color: textColor, outline: 'none', marginLeft: '8px', width: '100%', fontSize: 'calc(14px * var(--text-scale, 1))' }}
              />
            </div>
        )}
        
        <div style={{ position: 'relative', marginLeft: '16px', borderRight: `1px solid ${borderColor}`, paddingRight: '16px' }}>
          <div onClick={(e) => { e.stopPropagation(); setDropdownOpen(!dropdownOpen); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              {mediaSource === 'spotify' 
                ? <img src="/app-icons/spotify.svg" alt="Spotify" style={{width: 20, height: 20, borderRadius: 4}} /> 
                : <div style={{ width: '20px', height: '20px', backgroundColor: '#E04E3B', borderRadius: '4px' }}></div>
              }
              <ChevronDown size={16} color="#757575" />
          </div>
          {dropdownOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', backgroundColor: isDarkMode ? '#2c2c2c' : '#fff', color: textColor, borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.3)', overflow: 'hidden', width: '160px', zIndex: 100 }}>
              <div style={{ padding: '12px 16px', fontWeight: 500, cursor: 'pointer', borderBottom: `1px solid ${borderColor}` }} onClick={() => { changeSource('local'); setDropdownOpen(false); }}>{t('Local / Bluetooth')}</div>
              <div style={{ padding: '12px 16px', fontWeight: 500, cursor: 'pointer' }} onClick={() => { changeSource('spotify'); setDropdownOpen(false); }}>Spotify Web</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '24px', marginLeft: '24px', flex: 1 }}>
          {!viewContext && (
            <>
                <button 
                  onClick={() => setActiveTab('library')} 
                  style={{ background: 'none', border: 'none', color: activeTab === 'library' ? textColor : '#757575', fontWeight: 600, borderBottom: activeTab === 'library' ? `2px solid ${textColor}` : 'none', paddingBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Library size={16} /> {t('Library')}
                </button>
                <button 
                  onClick={() => setActiveTab('track')} 
                  style={{ background: 'none', border: 'none', color: activeTab === 'track' ? textColor : '#757575', fontWeight: 600, borderBottom: activeTab === 'track' ? `2px solid ${textColor}` : 'none', paddingBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Music size={16} /> {t('Tracks')}
                </button>
                <button 
                  onClick={() => setActiveTab('album')} 
                  style={{ background: 'none', border: 'none', color: activeTab === 'album' ? textColor : '#757575', fontWeight: 600, borderBottom: activeTab === 'album' ? `2px solid ${textColor}` : 'none', paddingBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Disc size={16} /> {t('Albums')}
                </button>
            </>
          )}
          {viewContext && <span style={{ fontWeight: 700, fontSize: 'calc(18px * var(--text-scale, 1))' }}>{viewContext.name}</span>}
        </div>
        <button onClick={toggleMusic} style={{ background: 'none', border: 'none', color: textColor, cursor: 'pointer' }}><X size={24} /></button>
      </header>

      <main style={{ 
          padding: '0 24px 24px', overflowY: 'auto', display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: '20px' 
      }}>
        {mediaSource === 'spotify' && !isSpotifyAuthorized ? (
            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '60px' }}>
                <h3 style={{ color: textColor, marginBottom: '16px' }}>{t('Spotify requires login')}</h3>
                <button onClick={loginSpotify} style={{ backgroundColor: '#1DB954', color: 'white', padding: '12px 32px', borderRadius: '24px', border: 'none', fontWeight: 'bold', fontSize: 'calc(16px * var(--text-scale, 1))', cursor: 'pointer' }}>{t('Log in with Spotify')}</button>
            </div>
        ) : (viewContext ? contextItems : spotifyItems).length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', marginTop: '60px', color: '#757575' }}>
                {mediaSource === 'spotify' ? (
                  <>
                    <h3 style={{ color: textColor, margin: '0 0 8px' }}>{t('No music found')}</h3>
                    <span style={{ fontSize: 'calc(14px * var(--text-scale, 1))' }}>{t('Search for a song, album or playlist.')}</span>
                  </>
                ) : connectedPhone ? (
                  // Telefoon verbonden: muziek komt binnen via Bluetooth, de telefoon is de bibliotheek
                  <>
                    <h3 style={{ color: textColor, margin: '0 0 8px' }}>
                      {connectedPhone.name} {btAudioState === 'Success' || btAudioState === 'Opened' ? t('is playing through PandaOS') : t('is connected')}
                    </h3>
                    <span style={{ fontSize: 'calc(14px * var(--text-scale, 1))' }}>
                      {btAudioState === 'Unavailable'
                        ? t('This phone cannot send audio to PandaOS.')
                        : isSpotifyAuthorized
                          ? t('Start music in Spotify on your phone. Title, cover and controls appear above.')
                          : t('Audio is coming in. Log in with Spotify for title, cover and controls.')}
                    </span>
                    {!isSpotifyAuthorized && (
                      <button onClick={loginSpotify} style={{ display: 'block', margin: '16px auto 0', backgroundColor: '#1DB954', color: 'white', padding: '10px 28px', borderRadius: '24px', border: 'none', fontWeight: 'bold', fontSize: 'calc(14px * var(--text-scale, 1))', cursor: 'pointer' }}>
                        {t('Log in with Spotify')}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <h3 style={{ color: textColor, margin: '0 0 8px' }}>{t('No phone connected')}</h3>
                    <span style={{ fontSize: 'calc(14px * var(--text-scale, 1))' }}>{t('Connect your phone in Settings → Bluetooth, or choose Spotify Web in the menu above.')}</span>
                  </>
                )}
            </div>
        ) : (
            (viewContext ? contextItems : spotifyItems).map((item) => (
            <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer' }} onClick={() => onPlayItem(item)}>
              <div style={{ 
                  aspectRatio: '1/1', backgroundColor: borderColor, borderRadius: '8px', 
                  backgroundImage: `url(${item.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' 
              }}></div>
              <span style={{ fontWeight: 600, fontSize: 'calc(13px * var(--text-scale, 1))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
              <span style={{ color: '#757575', fontSize: 'calc(11px * var(--text-scale, 1))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.artist}</span>
            </div>
            ))
        )}
      </main>
    </div>
  );
};

export default MusicApp;