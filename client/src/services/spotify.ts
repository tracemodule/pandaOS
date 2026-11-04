// src/services/spotify.ts
import SpotifyWebApi from 'spotify-web-api-js';

export const spotifyApi = new SpotifyWebApi();
// Eigen Spotify-app instellen via VITE_SPOTIFY_CLIENT_ID in client/.env.local (developer.spotify.com/dashboard)
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '4f67d0fd2f784efda1b27169fb7d14ba';
// Spotify accepteert geen "localhost" als terugkeer-adres, wel 127.0.0.1. De poort volgt de dev-server (bijv. 5000).
// Dit adres moet exact zo in de Spotify-app staan bij Redirect URIs.
export const REDIRECT_URI = `${window.location.protocol}//127.0.0.1:${window.location.port}/`;

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read'
];

let currentToken = '';

// PKCE Helpers
const generateRandomString = (length: number) => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
};

const sha256 = async (plain: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
};

const base64encode = (input: ArrayBuffer) => {
  const uint8Array = new Uint8Array(input);
  let str = '';
  for (let i = 0; i < uint8Array.length; i++) str += String.fromCharCode(uint8Array[i]);
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

export const loginWithSpotify = async () => {
  const codeVerifier = generateRandomString(64);
  window.localStorage.setItem('code_verifier', codeVerifier);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    scope: SCOPES.join(' '),
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
};

export const exchangeCodeForToken = async (code: string) => {
  const codeVerifier = localStorage.getItem('code_verifier');
  if (!codeVerifier) return null;
  const payload = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload
  });
  const data = await response.json();
  if (data.access_token) {
    localStorage.removeItem('code_verifier');
    storeTokens(data);
    return data.access_token;
  }
  return null;
};

// Access-token (1 uur geldig) + refresh-token bewaren, zodat we zonder opnieuw inloggen kunnen verlengen
const storeTokens = (data: { access_token: string; refresh_token?: string; expires_in?: number }) => {
  localStorage.setItem('spotify_token', data.access_token);
  if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
  localStorage.setItem('spotify_expires_at', String(Date.now() + (data.expires_in || 3600) * 1000));
};

export const isSpotifyTokenExpired = () =>
  Date.now() > Number(localStorage.getItem('spotify_expires_at') || 0) - 60_000;

export const refreshSpotifyToken = async () => {
  const refreshToken = localStorage.getItem('spotify_refresh_token');
  if (!refreshToken) return null;
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const data = await response.json();
  if (!data.access_token) return null;
  storeTokens(data);
  setSpotifyToken(data.access_token);
  return data.access_token;
};

export const setSpotifyToken = (token: string) => {
  currentToken = token;
  spotifyApi.setAccessToken(token);
};

export interface NowPlaying {
  title: string;
  artist: string;
  albumArt: string | null;
  position: number; // seconden
  duration: number;
  isPlaying: boolean;
}

// Wat er nu op je Spotify-account speelt, ook op je telefoon (null = niets of geen actief apparaat)
export const fetchNowPlaying = async (): Promise<NowPlaying | null> => {
  if (isSpotifyTokenExpired()) await refreshSpotifyToken();
  const state: any = await spotifyApi.getMyCurrentPlaybackState();
  const item = state?.item;
  if (!item) return null;
  return {
    title: item.name,
    artist: (item.artists || item.show && [item.show] || []).map((a: any) => a.name).join(', '),
    albumArt: item.album?.images?.[0]?.url || item.images?.[0]?.url || null,
    position: Math.round((state.progress_ms || 0) / 1000),
    duration: Math.round((item.duration_ms || 0) / 1000),
    isPlaying: !!state.is_playing
  };
};

// --- DATA OPHALEN ---

export const fetchUserPlaylists = async () => {
  if (!currentToken) return [];
  try {
    const response = await spotifyApi.getUserPlaylists();
    return response.items.map(item => ({
      id: item.id,
      name: item.name,
      imageUrl: (item.images && item.images.length > 0) ? item.images[0].url : 'https://placehold.co/150/202124/FFFFFF?text=Playlist',
      uri: item.uri,
      artist: 'Afspeellijst',
      type: 'playlist'
    }));
  } catch (e) { return []; }
};

export const fetchAlbumTracks = async (albumId: string) => {
    try {
        const album = await spotifyApi.getAlbum(albumId);
        const tracks = await spotifyApi.getAlbumTracks(albumId);
        return tracks.items.map(track => ({
            id: track.id,
            name: track.name,
            artist: track.artists[0].name,
            imageUrl: album.images[0].url,
            uri: track.uri,
            type: 'track'
        }));
    } catch (e) { return []; }
};

export const fetchPlaylistTracks = async (playlistId: string) => {
    try {
        const data = await spotifyApi.getPlaylistTracks(playlistId);
        return data.items.map(item => {
            const t = item.track as SpotifyApi.TrackObjectFull; 
            return {
                id: t.id,
                name: t.name,
                artist: t.artists ? t.artists[0].name : 'Unknown Artist',
                imageUrl: (t.album && t.album.images.length > 0) ? t.album.images[0].url : 'https://placehold.co/150/202124/FFFFFF?text=Track',
                uri: t.uri,
                type: 'track'
            };
        });
    } catch (e) { return []; }
};

export const searchSpotify = async (query: string, type: 'track' | 'album' | 'playlist' = 'track') => {
    if (!currentToken || !query || query.length < 2) return [];
    
    const options = { limit: 15 }; // Limit verlaagd voor stabiliteit
    
    try {
        // We gebruiken hier de directe methodes ipv de generieke .search om de 400 error te omzeilen
        if (type === 'track') {
            const res = await spotifyApi.searchTracks(query, options);
            return res.tracks.items.map(t => ({
                id: t.id,
                name: t.name,
                artist: t.artists[0].name,
                imageUrl: t.album.images[0]?.url || 'https://placehold.co/150/202124/FFFFFF?text=Track',
                uri: t.uri,
                type: 'track'
            }));
        } else if (type === 'album') {
            const res = await spotifyApi.searchAlbums(query, options);
            return res.albums.items.map(a => ({
                id: a.id,
                name: a.name,
                artist: (a as any).artists ? (a as any).artists[0].name : 'Unknown Artist',
                imageUrl: a.images[0]?.url || 'https://placehold.co/150/202124/FFFFFF?text=Album',
                uri: a.uri,
                type: 'album'
            }));
        } else {
            const res = await spotifyApi.searchPlaylists(query, options);
            return res.playlists.items.map(p => ({
                id: p.id,
                name: p.name,
                artist: p.owner.display_name || 'Spotify',
                imageUrl: p.images[0]?.url || 'https://placehold.co/150/202124/FFFFFF?text=Playlist',
                uri: p.uri,
                type: 'playlist'
            }));
        }
    } catch (error) { 
        console.error("Search API Error details:", error);
        return []; 
    }
};

export const playUri = async (uri: string) => {
    if (!currentToken) return;
    try {
        const devices = await spotifyApi.getMyDevices();
        const activeDevice = devices.devices.find(d => d.is_active) || devices.devices[0];
        if (!activeDevice) return;

        const options: any = { device_id: activeDevice.id };
        if (uri.includes('track')) options.uris = [uri];
        else options.context_uri = uri;
        await spotifyApi.play(options);
    } catch (err) { console.error(err); }
};

export const spotifyPlay = () => spotifyApi.play();
export const spotifyPause = () => spotifyApi.pause();
export const spotifyNext = () => spotifyApi.skipToNext();
export const spotifyPrev = () => spotifyApi.skipToPrevious();