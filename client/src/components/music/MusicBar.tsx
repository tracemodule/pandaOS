import React, { useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, SlidersHorizontal, Search, Star, Radio } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useT } from '../../i18n';
import { useMediaController } from './useMediaController';
import { getEffectiveTheme } from '../../settings';
import './_music-bar.scss';

const MusicBar: React.FC = () => {
  const t = useT();
  const [isFavorite, setIsFavorite] = useState(false);
  
  // Track info en de instellingen toggler komen direct uit de UI store
  const { currentTrack, currentArtist, albumArt, mediaPosition, mediaDuration, toggleAudioSettings, screenMode, vehicleLightsOn } = useUIStore();
  const projection = useUIStore((s) => s.nowPlayingSource === 'android' ? s.nowPlayingProjection : null);
  const isDarkMode = getEffectiveTheme(screenMode, vehicleLightsOn) === 'dark';
  const progress = mediaDuration > 0 ? Math.min(100, (mediaPosition / mediaDuration) * 100) : 0;
  
  // Functies komen uit de nieuwe Media Controller!
  const { isPlaying, togglePlayPause, playNext, playPrev } = useMediaController();

  return (
    <div className={`tsl-music-bar ${isDarkMode ? 'dark-mode' : ''}`}>
      <div className="music-info">
        <div className="album-art" style={{ backgroundImage: albumArt ? `url(${albumArt})` : 'none', backgroundSize: 'cover' }}></div>
        {/* Speelt via CarPlay/Android Auto: een tik op de naam opent CarPlay of Android Auto */}
        <div className="track-details" style={projection ? { cursor: 'pointer' } : undefined}
          onClick={projection ? () => (window as any).PandaAndroid?.openProjection?.() : undefined}>
          <span className="track-name">{currentTrack || t('Nothing playing')}</span>
          <span className="artist-name">
            <Radio size={12} style={{ marginRight: '4px' }} /> {currentArtist}
          </span>
        </div>
        <div className="favorite-btn" onClick={() => setIsFavorite(!isFavorite)}>
          <Star size={20} fill={isFavorite ? "currentColor" : "none"} strokeWidth={isFavorite ? 0 : 2} />
        </div>
      </div>
      
      <div className="progress-bar-container">
        <div className="progress-fill" style={{ width: `${progress}%` }}></div>
      </div>
      
      <div className="music-controls">
        <button onClick={playPrev}><SkipBack /></button>
        
        <button className="play-btn" onClick={togglePlayPause}>
          {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </button>
        
        <button onClick={playNext}><SkipForward /></button>
        
        {/* AUDIO SETTINGS OPENEN (Equalizer Icon) */}
        <button onClick={toggleAudioSettings}><SlidersHorizontal /></button>
        
        <button><Search /></button>
      </div>
    </div>
  );
};

export default MusicBar;