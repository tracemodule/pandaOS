import { playUri } from '../../services/spotify';
import { useUIStore } from '../../store/uiStore';

export { setSpotifyToken } from '../../services/spotify';

export const useMediaController = () => {
  const isPlaying = useUIStore((state) => state.isPlaying);
  const mediaSource = useUIStore((state) => state.mediaSource || 'local');
  const setMediaSource = useUIStore((state) => state.setMediaSource);
  // De store kiest zelf of een knop naar Spotify (ook muziek op je telefoon) of als mediatoets naar de server gaat
  const togglePlayPause = useUIStore((state) => state.togglePlayPause);
  const playNext = useUIStore((state) => state.playNext);
  const playPrev = useUIStore((state) => state.playPrev);

  const changeSource = (source: 'local' | 'spotify') => {
    if (setMediaSource) {
      setMediaSource(source);
    } else {
      useUIStore.setState({ mediaSource: source });
    }
  };

  // FIX: Expliciet de parameter als string getypeerd
  const handleItemClick = (uri: string) => {
      if (mediaSource !== 'spotify') changeSource('spotify');
      playUri(uri);
      useUIStore.setState({ isPlaying: true });
  };

  return {
    isPlaying,
    mediaSource,
    togglePlayPause,
    playNext,
    playPrev,
    changeSource,
    handleItemClick
  };
};