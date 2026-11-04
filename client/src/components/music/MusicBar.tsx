import React, { useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, SlidersHorizontal, Search, Star, Radio } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useMediaController } from './useMediaController';
import './_music-bar.scss';

const MusicBar: React.FC = () => {
  const [isFavorite, setIsFavorite] = useState(false);
  
  // Track info en de instellingen toggler komen direct uit de UI store
  const { currentTrack, currentArtist, albumArt, mediaPosition, mediaDuration, toggleAudioSettings } = useUIStore();
  const progress = mediaDuration > 0 ? Math.min(100, (mediaPosition / mediaDuration) * 100) : 0;
  
  // Functies komen uit de nieuwe Media Controller!
  const { isPlaying, togglePlayPause, playNext, playPrev } = useMediaController();

  return (
    <div className="tsl-music-bar">
      <div className="music-info">
        <div className="album-art" style={{ backgroundImage: albumArt ? `url(${albumArt})` : 'none', backgroundSize: 'cover' }}></div>
        <div className="track-details">
          <span className="track-name">{currentTrack || 'Niets aan het afspelen'}</span>
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