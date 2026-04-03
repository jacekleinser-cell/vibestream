import { useState, useEffect, useRef, useCallback, ChangeEvent } from 'react';
import { 
  Shuffle, Sun, Moon, X, Search, Play, Pause, SkipBack, SkipForward, 
  Menu, Heart, Plus, Music, ListMusic, Home, Library, MoreVertical,
  Volume2, VolumeX, Repeat, LayoutGrid, List
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Song {
  id: string;
  title: string;
  thumbnail: string;
  uploaderName: string;
  duration: string | number;
}

interface Playlist {
  name: string;
  songs: Song[];
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface SongRowProps {
  song: Song;
  index?: number;
  isQueue?: boolean;
  currentIndex: number;
  playSong: (song: Song, fromQueue?: boolean) => void;
  viewArtist: (artistName: string) => void | Promise<void>;
  likedSongs: Song[];
  toggleLikeSong: (song: Song) => void;
  setSongToAddToPlaylist: (song: Song | null) => void;
  setIsAddToPlaylistOpen: (isOpen: boolean) => void;
  key?: string | number;
}

const SongRow = ({ 
  song, 
  index, 
  isQueue = false, 
  currentIndex, 
  playSong, 
  viewArtist, 
  likedSongs, 
  toggleLikeSong, 
  setSongToAddToPlaylist, 
  setIsAddToPlaylistOpen,
  removeFromPlaylist,
  playlistName
}: SongRowProps & { removeFromPlaylist?: (song: Song, playlistName: string) => void, playlistName?: string }) => (
  <div 
    className={`group flex items-center gap-4 p-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer ${isQueue && index === currentIndex ? 'bg-white/10' : ''}`}
    onClick={() => playSong(song, isQueue)}
  >
    <div className="relative w-12 h-12 flex-shrink-0">
      <img src={song.thumbnail} className="w-full h-full object-cover rounded" referrerPolicy="no-referrer" />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
        <Play size={16} className="fill-white" />
      </div>
    </div>
    <div className="flex-1 min-w-0">
      <h4 className={`text-sm font-medium truncate ${isQueue && index === currentIndex ? 'text-white' : 'text-white/90'}`}>{song.title}</h4>
      <p className="text-xs text-white/50 truncate hover:underline" onClick={(e) => { e.stopPropagation(); viewArtist(song.uploaderName); }}>{song.uploaderName}</p>
    </div>
    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <button 
        className={`p-2 hover:bg-white/10 rounded-full transition-colors ${likedSongs.some(s => s.id === song.id) ? 'text-white' : 'text-white/40'}`}
        onClick={(e) => { e.stopPropagation(); toggleLikeSong(song); }}
      >
        <Heart size={16} className={likedSongs.some(s => s.id === song.id) ? 'fill-white' : ''} />
      </button>
      <button 
        className="p-2 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-colors"
        onClick={(e) => { e.stopPropagation(); setSongToAddToPlaylist(song); setIsAddToPlaylistOpen(true); }}
      >
        <Plus size={16} />
      </button>
      {removeFromPlaylist && playlistName && (
        <button 
          className="p-2 hover:bg-white/10 rounded-full text-white/40 hover:text-red-500 transition-colors"
          onClick={(e) => { e.stopPropagation(); removeFromPlaylist(song, playlistName); }}
        >
          <X size={16} />
        </button>
      )}
    </div>
    <span className="text-xs text-white/30 w-12 text-right">{song.duration}</span>
  </div>
);

export default function App() {
  // --- State ---
  const [playlist, setPlaylist] = useState<Song[]>(JSON.parse(localStorage.getItem('unlimitedPlaylist') || '[]'));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ songs: Song[], artists: Song[], playlists: Song[], albums: Song[] }>({ songs: [], artists: [], playlists: [], albums: [] });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [viewingSection, setViewingSection] = useState<'home' | 'liked' | 'playlist' | 'artist'>('home');
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [artistSongs, setArtistSongs] = useState<Song[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isQueueVisible, setIsQueueVisible] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [discoverySongs, setDiscoverySongs] = useState<Song[]>([]);
  const [discoveryCategory, setDiscoveryCategory] = useState('Trending');
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false);
  const [likedSongs, setLikedSongs] = useState<Song[]>(JSON.parse(localStorage.getItem('likedSongs') || '[]'));
  const [favoriteArtists, setFavoriteArtists] = useState<string[]>(JSON.parse(localStorage.getItem('favoriteArtists') || '[]'));
  const [playlists, setPlaylists] = useState<Playlist[]>(JSON.parse(localStorage.getItem('userPlaylists') || '[]'));
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [playerStatus, setPlayerStatus] = useState('Initializing...');
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [songToAddToPlaylist, setSongToAddToPlaylist] = useState<Song | null>(null);
  const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<any[]>([]);
  const [selectedSpotifyPlaylist, setSelectedSpotifyPlaylist] = useState<any | null>(null);
  const [spotifyTracks, setSpotifyTracks] = useState<any[]>([]);
  const [isSpotifyAuthenticated, setIsSpotifyAuthenticated] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const playerRef = useRef<any>(null);
  const progressInterval = useRef<any>(null);
  const playlistRef = useRef(playlist);
  const currentIndexRef = useRef(currentIndex);
  const isPlayingRef = useRef(isPlaying);
  const likedSongsRef = useRef(likedSongs);
  const discoverySongsRef = useRef(discoverySongs);
  const isRepeatRef = useRef(isRepeat);
  const isShuffleRef = useRef(isShuffle);
  const isMutedRef = useRef(isMuted);
  const pendingSongRef = useRef<Song | null>(null);
  const nextSongRef = useRef<() => void>(() => {});
  const prevSongRef = useRef<() => void>(() => {});
  const playRecommendationRef = useRef<() => void>(() => {});

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    likedSongsRef.current = likedSongs;
  }, [likedSongs]);

  useEffect(() => {
    discoverySongsRef.current = discoverySongs;
  }, [discoverySongs]);

  useEffect(() => {
    isRepeatRef.current = isRepeat;
  }, [isRepeat]);

  useEffect(() => {
    isShuffleRef.current = isShuffle;
  }, [isShuffle]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
  }, [likedSongs]);

  useEffect(() => {
    localStorage.setItem('favoriteArtists', JSON.stringify(favoriteArtists));
  }, [favoriteArtists]);

  useEffect(() => {
    localStorage.setItem('userPlaylists', JSON.stringify(playlists));
  }, [playlists]);

  // --- Initialization ---
  const initPlayer = useCallback(() => {
    if (playerRef.current || !window.YT || !window.YT.Player) {
      console.log("Player init skipped:", { exists: !!playerRef.current, yt: !!window.YT, ytPlayer: !!window.YT?.Player });
      return;
    }
    
    console.log("Initializing YouTube Player...");
    try {
      playerRef.current = new window.YT.Player('player', {
        height: '100%', width: '100%',
        playerVars: { 
          'autoplay': 1, 
          'rel': 0, 
          'controls': 0, 
          'showinfo': 0,
          'origin': window.location.origin,
          'enablejsapi': 1,
          'widget_referrer': window.location.origin,
          'mute': 0
        },
        events: { 
          'onReady': () => {
            console.log("Player Ready Event");
            setIsPlayerReady(true);
            setPlayerStatus('Ready');
            
            const songToPlay = pendingSongRef.current || playlistRef.current[currentIndexRef.current];
            if (songToPlay && isPlayingRef.current) {
              playerRef.current.loadVideoById(songToPlay.id);
              playerRef.current.playVideo();
              pendingSongRef.current = null;
            } else if (songToPlay) {
              playerRef.current.cueVideoById(songToPlay.id);
            }
          },
          'onStateChange': (e: any) => { 
            const states: Record<number, string> = {
              [-1]: 'Unstarted',
              [0]: 'Ended',
              [1]: 'Playing',
              [2]: 'Paused',
              [3]: 'Buffering',
              [5]: 'Cued'
            };
            const statusText = states[e.data] || 'Unknown';
            console.log("Player State Change:", statusText, e.data);
            setPlayerStatus(statusText);

            if(e.data === window.YT.PlayerState.ENDED) {
              nextSongRef.current();
            } 
            if(e.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              setDuration(playerRef.current.getDuration());
              startProgressTimer();
            }
            if(e.data === 5 && isPlayingRef.current) {
              playerRef.current.playVideo();
            }
            if(e.data === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false);
              stopProgressTimer();
            }
          },
          'onError': (e: any) => {
            console.error("Player Error:", e.data);
            setPlayerStatus(`Error: ${e.data}`);
            // 2: Invalid parameter, 100: Not found, 101/150: Restricted
            if ([2, 100, 101, 150].includes(e.data)) {
              console.log("Critical error, skipping song...");
              setTimeout(() => nextSongRef.current(), 2000);
            }
          }
        }
      });
    } catch (err) {
      console.error("Failed to create YT Player:", err);
      setPlayerStatus("Init Failed");
    }
  }, []); // Remove currentIndex dependency

  useEffect(() => {
    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }
  }, [initPlayer]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SPOTIFY_AUTH_SUCCESS') {
        setIsSpotifyAuthenticated(true);
        fetchSpotifyPlaylists();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      stopProgressTimer();
    };
  }, []);

  // Sync player when it becomes ready or song changes
  useEffect(() => {
    if (isPlayerReady && playerRef.current && playlist[currentIndex]) {
      const currentVideoId = playerRef.current.getVideoData?.()?.video_id;
      if (currentVideoId !== playlist[currentIndex].id) {
        playerRef.current.loadVideoById(playlist[currentIndex].id);
      }
      
      if (isPlaying) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    }
  }, [isPlayerReady, currentIndex, isPlaying, playlist]);

  const startProgressTimer = () => {
    stopProgressTimer();
    progressInterval.current = setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime) {
        setCurrentTime(playerRef.current.getCurrentTime());
      }
    }, 1000);
  };

  const stopProgressTimer = () => {
    if (progressInterval.current) clearInterval(progressInterval.current);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('unlimitedPlaylist', JSON.stringify(playlist));
    localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
    localStorage.setItem('favoriteArtists', JSON.stringify(favoriteArtists));
    localStorage.setItem('userPlaylists', JSON.stringify(playlists));
  }, [playlist, likedSongs, favoriteArtists, playlists]);

  // --- Actions ---
  const handleSpotifyConnect = async () => {
    try {
      const response = await fetch('/api/auth/spotify');
      const { url } = await response.json();
      window.open(url, 'spotify_auth', 'width=600,height=800');
    } catch (err) {
      console.error("Spotify connect error:", err);
    }
  };

  const fetchSpotifyPlaylists = async () => {
    try {
      const response = await fetch('/api/spotify/playlists');
      if (response.status === 401) {
        setIsSpotifyAuthenticated(false);
        return;
      }
      const data = await response.json();
      setSpotifyPlaylists(data.items || []);
      setIsSpotifyAuthenticated(true);
    } catch (err) {
      console.error("Fetch Spotify playlists error:", err);
    }
  };

  const viewSpotifyPlaylist = async (pl: any) => {
    setSelectedSpotifyPlaylist(pl);
    try {
      const response = await fetch(`/api/spotify/playlists/${pl.id}/tracks`);
      const data = await response.json();
      setSpotifyTracks(data.items || []);
    } catch (err) {
      console.error("Fetch Spotify tracks error:", err);
    }
  };

  const importSpotifyTrack = async (track: any) => {
    setIsTransferring(true);
    try {
      const query = `${track.name} ${track.artists[0].name}`;
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      const firstVideo = data.items.find((i: any) => i.type === 'video');
      if (firstVideo) {
        playSong(firstVideo);
      }
    } catch (err) {
      console.error("Import Spotify track error:", err);
    } finally {
      setIsTransferring(false);
    }
  };

  const importSpotifyPlaylist = async (pl: any) => {
    setIsTransferring(true);
    setImportProgress({ current: 0, total: pl.tracks.total });
    
    try {
      const response = await fetch(`/api/spotify/playlists/${pl.id}/tracks`);
      const data = await response.json();
      const tracks = data.items || [];
      
      const importedSongs: Song[] = [];
      
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i].track;
        setImportProgress({ current: i + 1, total: tracks.length });
        
        const query = `${track.name} ${track.artists[0].name}`;
        const searchRes = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const searchData = await searchRes.json();
        const firstVideo = searchData.items.find((item: any) => item.type === 'video');
        
        if (firstVideo) {
          importedSongs.push(firstVideo);
        }
      }

      if (importedSongs.length > 0) {
        const newPlName = `Spotify: ${pl.name}`;
        setPlaylists(prev => [...prev, { name: newPlName, songs: importedSongs }]);
        alert(`Successfully imported ${importedSongs.length} songs to playlist "${newPlName}"`);
      }
    } catch (err) {
      console.error("Bulk import error:", err);
      alert("Failed to import playlist. Check console for details.");
    } finally {
      setIsTransferring(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  const resetPlayer = () => {
    setPlayerStatus('Resetting...');
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch (e) {}
      playerRef.current = null;
    }
    setIsPlayerReady(false);
    
    // Re-trigger initialization
    setTimeout(() => {
      initPlayer();
    }, 100);
  };

  useEffect(() => {
    fetchDiscoverySongs(discoveryCategory);
  }, [discoveryCategory]);

  const fetchDiscoverySongs = async (category: string) => {
    setIsDiscoveryLoading(true);
    try {
      const query = category === 'Trending' ? 'trending music 2024' : `${category} hits 2024`;
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      setDiscoverySongs(data.items.filter((i: any) => i.type === 'video').slice(0, 12));
    } catch (err) {
      console.error("Discovery fetch error:", err);
    } finally {
      setIsDiscoveryLoading(false);
    }
  };

  const removeFromPlaylist = (song: Song, playlistName: string) => {
    if (playlistName === 'Liked Songs') {
      toggleLikeSong(song);
    } else {
      setPlaylists(prev => prev.map(pl => 
        pl.name === playlistName 
          ? { ...pl, songs: pl.songs.filter(s => s.id !== song.id) } 
          : pl
      ));
    }
  };

  const searchMusic = async () => {
    if (!searchQuery) return;
    setIsSearchOpen(true);
    setViewingSection('home');
    setSelectedArtist(null);
    setSelectedPlaylist(null);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      const items = data.items || [];
      setSearchResults({
        songs: items.filter((i: any) => i.type === 'video'),
        artists: items.filter((i: any) => i.type === 'channel'),
        playlists: items.filter((i: any) => i.type === 'playlist'),
        albums: []
      });
    } catch (err) {
      console.error("Search error:", err);
      setSearchResults({ songs: [], artists: [], playlists: [], albums: [] });
    }
  };

  const viewArtist = async (artistName: string) => {
    setViewingSection('artist');
    setSelectedArtist(artistName);
    setSelectedPlaylist(null);
    setIsSearchOpen(false);
    try {
      const response = await fetch(`/api/artist/${encodeURIComponent(artistName)}`);
      const data = await response.json();
      setArtistSongs(data.items || []);
    } catch (err) {
      console.error("Artist search error:", err);
      setArtistSongs([]);
    }
  };

  const viewPlaylist = (pl: Playlist) => {
    setViewingSection('playlist');
    setSelectedPlaylist(pl);
    setSelectedArtist(null);
    setIsSearchOpen(false);
  };

  const createPlaylist = () => {
    if (newPlaylistName) {
      setPlaylists(prev => [...prev, { name: newPlaylistName, songs: [] }]);
      setNewPlaylistName('');
      setIsCreatePlaylistOpen(false);
    }
  };

  const toggleLikeSong = (song: Song) => {
    setLikedSongs(prev => prev.some(s => s.id === song.id) ? prev.filter(s => s.id !== song.id) : [...prev, song]);
  };

  const addToPlaylist = (song: Song, playlistName: string) => {
    setPlaylists(prev => prev.map(pl => pl.name === playlistName ? { ...pl, songs: [...pl.songs, song] } : pl));
    setIsAddToPlaylistOpen(false);
    setSongToAddToPlaylist(null);
  };

  const playSong = (song: Song, fromQueue: boolean = false) => {
    let newIndex = currentIndex;
    if (!fromQueue) {
      const newPlaylist = [...playlist];
      const existingIndex = newPlaylist.findIndex(s => s.id === song.id);
      
      if (existingIndex !== -1) {
        newIndex = existingIndex;
      } else {
        newIndex = currentIndex + 1;
        newPlaylist.splice(newIndex, 0, song);
        setPlaylist(newPlaylist);
      }
    } else {
      newIndex = playlist.findIndex(s => s.id === song.id);
    }
    
    setCurrentIndex(newIndex);
    setIsPlaying(true);
    
    if (playerRef.current && isPlayerReady) {
      try {
        playerRef.current.loadVideoById(song.id);
        playerRef.current.playVideo();
      } catch (e) {
        console.error("Direct play error:", e);
      }
    } else {
      pendingSongRef.current = song;
      if (!playerRef.current) {
        initPlayer();
      }
    }
  };

  useEffect(() => {
    const syncInterval = setInterval(() => {
      if (isPlayerReady && playerRef.current && isPlaying) {
        try {
          const state = playerRef.current.getPlayerState?.();
          // If supposed to be playing but is Cued (5) or Unstarted (-1)
          // We force play. This overcomes browser autoplay blocks after the first user interaction.
          // We no longer force play on Paused (2) to allow the user to pause.
          if (state === 5 || state === -1) {
            console.log("Sync loop: Force playing (state: " + state + ")...");
            playerRef.current.playVideo();
          }
        } catch (err) {
          console.error("Sync loop error:", err);
        }
      }
    }, 1000); // More aggressive sync (1s)
    return () => clearInterval(syncInterval);
  }, [isPlaying, isPlayerReady]);

  // Backup poller to ensure continuous playback even if ENDED event is missed
  useEffect(() => {
    const checkEnded = setInterval(() => {
      if (isPlayerReady && playerRef.current && isPlaying) {
        try {
          const state = playerRef.current.getPlayerState?.();
          if (state === 0) { // ENDED
            console.log("Polling: Detected ENDED state, skipping...");
            nextSongRef.current();
          }
        } catch (e) {}
      }
    }, 1000);
    return () => clearInterval(checkEnded);
  }, [isPlayerReady, isPlaying]);

  const togglePlay = () => {
    if (!playerRef.current || !isPlayerReady) {
      setPlayerStatus('Player not ready...');
      return;
    }
    const state = playerRef.current.getPlayerState();
    if (state === 1) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const prevSong = () => {
    const currentPlaylist = playlistRef.current;
    if (currentPlaylist.length === 0) return;
    const newIndex = (currentIndexRef.current - 1 + currentPlaylist.length) % currentPlaylist.length;
    setCurrentIndex(newIndex);
    setIsPlaying(true);
    if (playerRef.current && isPlayerReady) {
      playerRef.current.loadVideoById(currentPlaylist[newIndex].id);
      playerRef.current.playVideo();
    }
  };

  const nextSong = () => {
    const currentPlaylist = playlistRef.current;
    const currentIdx = currentIndexRef.current;
    
    if (currentPlaylist.length === 0) {
      playRecommendation();
      return;
    }
    
    const isAtEnd = currentIdx === currentPlaylist.length - 1;
    
    // In both normal and shuffle mode, if we reach the end of the current playlist,
    // we pull a recommendation to keep the music going forever.
    if (isAtEnd && !isRepeatRef.current) {
      playRecommendation();
    } else {
      let newIndex;
      if (isRepeatRef.current) {
        newIndex = currentIdx;
      } else if (isShuffleRef.current) {
        // Pick a random index that isn't the current one
        if (currentPlaylist.length > 1) {
          do {
            newIndex = Math.floor(Math.random() * currentPlaylist.length);
          } while (newIndex === currentIdx);
        } else {
          newIndex = 0;
        }
      } else {
        newIndex = (currentIdx + 1) % currentPlaylist.length;
      }
      
      setCurrentIndex(newIndex);
      setIsPlaying(true);
      if (playerRef.current && isPlayerReady) {
        playerRef.current.loadVideoById(currentPlaylist[newIndex].id);
        playerRef.current.playVideo();
      }
    }
  };

  const playRecommendation = () => {
    const currentLiked = likedSongsRef.current;
    const currentDiscovery = discoverySongsRef.current;
    const currentPlaylist = playlistRef.current;
    
    let sourcePool = currentLiked.length > 0 ? currentLiked : currentDiscovery;
    if (sourcePool.length === 0) return;
    
    // Pick a random song from the pool
    const randomSong = sourcePool[Math.floor(Math.random() * sourcePool.length)];
    
    // Add to playlist and play
    const newPlaylist = [...currentPlaylist, randomSong];
    setPlaylist(newPlaylist);
    setCurrentIndex(newPlaylist.length - 1);
    setIsPlaying(true);
    
    if (playerRef.current && isPlayerReady) {
      playerRef.current.loadVideoById(randomSong.id);
      playerRef.current.playVideo();
    }
  };

  const toggleShuffle = () => {
    setIsShuffle(!isShuffle);
  };

  const toggleMute = () => {
    if (isMuted) {
      playerRef.current?.unMute();
      setIsMuted(false);
    } else {
      playerRef.current?.mute();
      setIsMuted(true);
    }
  };

  const toggleFavoriteArtist = (artist: string) => {
    setFavoriteArtists(prev => prev.includes(artist) ? prev.filter(a => a !== artist) : [...prev, artist]);
  };

  const handleVolumeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value);
    setVolume(v);
    playerRef.current?.setVolume(v);
  };

  const shuffleQueue = (songs: Song[]) => {
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    setPlaylist(shuffled);
    setCurrentIndex(0);
    setIsPlaying(true);
    if (playerRef.current && shuffled.length > 0) {
      playerRef.current.loadVideoById(shuffled[0].id);
      playerRef.current.playVideo();
    }
  };

  useEffect(() => {
    nextSongRef.current = nextSong;
  }, [nextSong]);

  useEffect(() => {
    prevSongRef.current = prevSong;
  }, [prevSong]);

  useEffect(() => {
    playRecommendationRef.current = playRecommendation;
  }, [playRecommendation]);

  const currentSong = playlist[currentIndex];

  return (
    <div className="flex h-screen bg-bg-main text-white overflow-hidden">
      {/* Sidebar */}
      <aside className={`flex flex-col bg-bg-sidebar border-r border-border transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tighter flex items-center gap-2">
            <Music className="text-white" />
            STUDYSTREAM
          </h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-6 overflow-y-auto custom-scrollbar">
          <div className="space-y-1">
            <h3 className="px-2 text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Menu</h3>
            <button 
              onClick={() => { setViewingSection('home'); setIsSearchOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${viewingSection === 'home' && !isSearchOpen ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
            >
              <Home size={18} /> Home
            </button>
            <button 
              onClick={() => { setViewingSection('liked'); setIsSearchOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${viewingSection === 'liked' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
            >
              <Heart size={18} /> Liked Songs
            </button>
            <button 
              onClick={() => { setViewingSection('transfer'); setIsSearchOpen(false); if (isSpotifyAuthenticated) fetchSpotifyPlaylists(); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${viewingSection === 'transfer' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
            >
              <Library size={18} /> Transfer
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 mb-2">
              <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Playlists</h3>
              <button onClick={() => setIsCreatePlaylistOpen(true)} className="text-white/40 hover:text-white transition-colors">
                <Plus size={14} />
              </button>
            </div>
            {playlists.map((pl, i) => (
              <button 
                key={`${pl.name}-${i}`}
                onClick={() => viewPlaylist(pl)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors truncate ${viewingSection === 'playlist' && selectedPlaylist?.name === pl.name ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
              >
                <Music size={18} /> {pl.name}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <h3 className="px-2 text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Favorite Artists</h3>
            {favoriteArtists.map((artist, i) => (
              <button 
                key={`${artist}-${i}`}
                onClick={() => viewArtist(artist)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors truncate ${viewingSection === 'artist' && selectedArtist === artist ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
              >
                <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[8px]">{artist[0]}</div> {artist}
              </button>
            ))}
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-16 flex items-center justify-between px-8 border-b border-border z-10 glass-effect sticky top-0">
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-white/60 hover:text-white">
              <Menu size={20} />
            </button>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchMusic()}
                placeholder="Search for lectures, tutorials, or study media..."
                className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-white/30 transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsQueueVisible(!isQueueVisible)} className={`p-2 rounded-full transition-colors ${isQueueVisible ? 'bg-white text-black' : 'hover:bg-white/10'}`}>
              <ListMusic size={20} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pb-32">
          <AnimatePresence mode="wait">
            {isSearchOpen ? (
              <motion.div 
                key="search"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-12"
              >
                <section>
                  <h2 className="text-2xl font-bold mb-6">Search Results</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {searchResults.songs.map((song, i) => (
                      <SongRow 
                        key={`${song.id}-${i}`} 
                        song={song}
                        currentIndex={currentIndex}
                        playSong={playSong}
                        viewArtist={viewArtist}
                        likedSongs={likedSongs}
                        toggleLikeSong={toggleLikeSong}
                        setSongToAddToPlaylist={setSongToAddToPlaylist}
                        setIsAddToPlaylistOpen={setIsAddToPlaylistOpen}
                        removeFromPlaylist={removeFromPlaylist}
                        playlistName="Search Results"
                      />
                    ))}
                  </div>
                </section>

                {searchResults.artists.length > 0 && (
                  <section>
                    <h3 className="text-lg font-semibold mb-4 text-white/60">Artists</h3>
                    <div className="flex flex-wrap gap-6">
                      {searchResults.artists.map((artist, i) => (
                        <div 
                          key={`${artist.id}-${i}`} 
                          className="flex flex-col items-center gap-3 group cursor-pointer"
                          onClick={() => viewArtist(artist.uploaderName)}
                        >
                          <div className="w-32 h-32 rounded-full overflow-hidden border border-white/10 group-hover:border-white/30 transition-all">
                            <img src={artist.thumbnail} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                          <span className="text-sm font-medium group-hover:underline">{artist.uploaderName}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </motion.div>
            ) : viewingSection === 'liked' ? (
              <motion.div 
                key="liked"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8"
              >
                <div className="flex items-end gap-6">
                  <div className="w-48 h-48 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-lg shadow-2xl flex items-center justify-center">
                    <Heart size={64} className="fill-white" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest mb-2">Playlist</h4>
                    <h1 className="text-6xl font-black mb-4">Liked Songs</h1>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => shuffleQueue(likedSongs)}
                        className="bg-white text-black px-8 py-3 rounded-full font-bold hover:scale-105 transition-transform flex items-center gap-2"
                      >
                        <Shuffle size={18} />
                        Shuffle Play
                      </button>
                      <p className="text-white/60 text-sm">{likedSongs.length} songs</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  {likedSongs.map((song, i) => (
                    <SongRow 
                      key={`${song.id}-${i}`} 
                      song={song}
                      currentIndex={currentIndex}
                      playSong={playSong}
                      viewArtist={viewArtist}
                      likedSongs={likedSongs}
                      toggleLikeSong={toggleLikeSong}
                      setSongToAddToPlaylist={setSongToAddToPlaylist}
                      setIsAddToPlaylistOpen={setIsAddToPlaylistOpen}
                      removeFromPlaylist={removeFromPlaylist}
                      playlistName="Liked Songs"
                    />
                  ))}
                </div>
              </motion.div>
            ) : viewingSection === 'artist' ? (
              <motion.div 
                key="artist"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8"
              >
                <div className="flex items-end gap-6">
                  <div className="w-48 h-48 bg-white/10 rounded-full overflow-hidden shadow-2xl">
                    {artistSongs[0] && <img src={artistSongs[0].thumbnail} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest mb-2">Artist</h4>
                    <h1 className="text-6xl font-black mb-4">{selectedArtist}</h1>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => shuffleQueue(artistSongs)}
                        className="bg-white text-black px-8 py-3 rounded-full font-bold hover:scale-105 transition-transform"
                      >
                        Shuffle Play
                      </button>
                      <button 
                        onClick={() => selectedArtist && toggleFavoriteArtist(selectedArtist)}
                        className={`p-3 rounded-full border border-white/20 hover:border-white transition-colors ${favoriteArtists.includes(selectedArtist || '') ? 'bg-white/10' : ''}`}
                      >
                        <Heart size={20} className={favoriteArtists.includes(selectedArtist || '') ? 'fill-white' : ''} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold mb-4">Popular Content</h3>
                  {artistSongs.map((song, i) => (
                    <SongRow 
                      key={`${song.id}-${i}`} 
                      song={song}
                      currentIndex={currentIndex}
                      playSong={playSong}
                      viewArtist={viewArtist}
                      likedSongs={likedSongs}
                      toggleLikeSong={toggleLikeSong}
                      setSongToAddToPlaylist={setSongToAddToPlaylist}
                      setIsAddToPlaylistOpen={setIsAddToPlaylistOpen}
                      removeFromPlaylist={removeFromPlaylist}
                      playlistName="Liked Songs"
                    />
                  ))}
                </div>
              </motion.div>
            ) : viewingSection === 'playlist' ? (
              <motion.div 
                key="playlist"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8"
              >
                <div className="flex items-end gap-6">
                  <div className="w-48 h-48 bg-white/5 rounded-lg shadow-2xl flex items-center justify-center border border-white/10">
                    <Music size={64} className="text-white/20" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-xs font-bold uppercase tracking-widest mb-2">Playlist</h4>
                    <h1 className="text-6xl font-black mb-4">{selectedPlaylist?.name}</h1>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => selectedPlaylist && shuffleQueue(selectedPlaylist.songs)}
                        className="bg-white text-black px-8 py-3 rounded-full font-bold hover:scale-105 transition-transform flex items-center gap-2"
                      >
                        <Shuffle size={18} />
                        Shuffle Play
                      </button>
                      <button 
                        onClick={() => {
                          setViewingSection('home');
                          setIsSearchOpen(true);
                          setSearchQuery(selectedPlaylist?.name || '');
                        }}
                        className="text-sm font-bold text-white/60 hover:text-white transition-colors"
                      >
                        Add more songs
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  {selectedPlaylist?.songs.map((song, i) => (
                    <SongRow 
                      key={`${song.id}-${i}`} 
                      song={song}
                      currentIndex={currentIndex}
                      playSong={playSong}
                      viewArtist={viewArtist}
                      likedSongs={likedSongs}
                      toggleLikeSong={toggleLikeSong}
                      setSongToAddToPlaylist={setSongToAddToPlaylist}
                      setIsAddToPlaylistOpen={setIsAddToPlaylistOpen}
                      removeFromPlaylist={removeFromPlaylist}
                      playlistName={selectedPlaylist.name}
                    />
                  ))}
                  {selectedPlaylist?.songs.length === 0 && (
                    <div className="py-20 text-center space-y-4">
                      <p className="text-white/40">This playlist is empty.</p>
                      <button 
                        onClick={() => { setViewingSection('home'); setIsSearchOpen(false); }}
                        className="px-6 py-2 border border-white/20 rounded-full hover:bg-white/5 transition-colors"
                      >
                        Find content to add
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : viewingSection === 'transfer' ? (
              <motion.div 
                key="transfer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8"
              >
                <div className="flex items-end gap-6">
                  <div className="w-48 h-48 bg-[#1DB954] rounded-lg shadow-2xl flex items-center justify-center">
                    <Music size={64} className="text-white" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest mb-2">Import</h4>
                    <h1 className="text-6xl font-black mb-4">Spotify Transfer</h1>
                    <p className="text-white/60 text-sm">Connect your Spotify account to import your playlists and tracks.</p>
                  </div>
                </div>

                {!isSpotifyAuthenticated ? (
                  <div className="py-20 text-center space-y-8 max-w-2xl mx-auto">
                    <div className="space-y-4">
                      <p className="text-xl font-medium">Connect to Spotify to get started</p>
                      <p className="text-white/40 text-sm leading-relaxed">
                        Because StudyStream is your own private instance, you'll need to provide your own Spotify API credentials. 
                        This ensures your data stays private and your app has its own dedicated connection.
                      </p>
                    </div>
                    <button 
                      onClick={handleSpotifyConnect}
                      className="bg-[#1DB954] text-white px-10 py-4 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-xl"
                    >
                      Connect Spotify
                    </button>
                    <div className="pt-8 border-t border-white/5 text-left">
                      <h5 className="text-xs font-bold uppercase tracking-widest mb-4 text-white/60">How to get your credentials:</h5>
                      <ol className="text-xs text-white/40 space-y-2 list-decimal pl-4">
                        <li>Go to the <a href="https://developer.spotify.com/dashboard" target="_blank" className="text-[#1DB954] hover:underline">Spotify Developer Dashboard</a>.</li>
                        <li>Create a new App and name it "StudyStream".</li>
                        <li>In Settings, add this Redirect URI: <code className="bg-white/5 px-1 rounded text-white/80">{window.location.origin}/api/auth/spotify/callback</code></li>
                        <li>Copy your <b>Client ID</b> and <b>Client Secret</b> into the app's Secrets panel.</li>
                      </ol>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold">Your Spotify Playlists</h3>
                        {isTransferring && importProgress.total > 0 && (
                          <span className="text-xs text-[#1DB954] font-bold animate-pulse">
                            Importing: {importProgress.current}/{importProgress.total}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                        {spotifyPlaylists.map((pl, i) => (
                          <div 
                            key={`${pl.id}-${i}`}
                            className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors group ${selectedSpotifyPlaylist?.id === pl.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
                          >
                            <div className="flex-1 flex items-center gap-4 min-w-0" onClick={() => viewSpotifyPlaylist(pl)}>
                              <img src={pl.images?.[0]?.url} className="w-12 h-12 rounded object-cover" referrerPolicy="no-referrer" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{pl.name}</p>
                                <p className="text-xs text-white/50">{pl.tracks?.total} tracks</p>
                              </div>
                            </div>
                            <button 
                              onClick={(e) => { e.stopPropagation(); importSpotifyPlaylist(pl); }}
                              disabled={isTransferring}
                              className="opacity-0 group-hover:opacity-100 p-2 bg-[#1DB954] text-white rounded-full transition-all hover:scale-110 disabled:opacity-50"
                              title="Import entire playlist"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xl font-bold">
                        {selectedSpotifyPlaylist ? `Tracks in ${selectedSpotifyPlaylist.name}` : 'Select a playlist'}
                      </h3>
                      <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                        {spotifyTracks.map((item, i) => {
                          const track = item.track;
                          return (
                            <div 
                              key={`${track.id}-${i}`}
                              className="flex items-center gap-4 p-3 rounded-lg bg-white/5 group"
                            >
                              <img src={track.album?.images?.[0]?.url} className="w-10 h-10 rounded object-cover" referrerPolicy="no-referrer" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{track.name}</p>
                                <p className="text-xs text-white/50 truncate">{track.artists.map((a: any) => a.name).join(', ')}</p>
                              </div>
                              <button 
                                onClick={() => importSpotifyTrack(track)}
                                disabled={isTransferring}
                                className="opacity-0 group-hover:opacity-100 p-2 bg-white text-black rounded-full transition-all hover:scale-110 disabled:opacity-50"
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          );
                        })}
                        {selectedSpotifyPlaylist && spotifyTracks.length === 0 && (
                          <p className="text-center py-20 text-white/40">No tracks found in this playlist.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="home"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-12"
              >
                <section>
                  <h2 className="text-3xl font-black mb-6">Good afternoon</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {playlists.slice(0, 6).map((pl, i) => (
                      <div 
                        key={`${pl.name}-${i}`}
                        onClick={() => viewPlaylist(pl)}
                        className="flex items-center gap-4 bg-white/5 rounded-md overflow-hidden hover:bg-white/10 transition-colors cursor-pointer group"
                      >
                        <div className="w-20 h-20 bg-white/5 flex items-center justify-center">
                          <Music size={24} className="text-white/20" />
                        </div>
                        <span className="font-bold flex-1 truncate">{pl.name}</span>
                        <button className="mr-4 w-12 h-12 bg-white text-black rounded-full shadow-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center translate-y-2 group-hover:translate-y-0 duration-300">
                          <Play size={20} className="fill-black" />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">Recommended for You</h2>
                    <p className="text-sm text-white/40">Based on your liked songs</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {(likedSongs.length > 0 ? likedSongs.sort(() => Math.random() - 0.5).slice(0, 6) : discoverySongs.slice(0, 6)).map((song, i) => (
                      <SongRow 
                        key={`rec-${song.id}-${i}`} 
                        song={song}
                        currentIndex={currentIndex}
                        playSong={playSong}
                        viewArtist={viewArtist}
                        likedSongs={likedSongs}
                        toggleLikeSong={toggleLikeSong}
                        setSongToAddToPlaylist={setSongToAddToPlaylist}
                        setIsAddToPlaylistOpen={setIsAddToPlaylistOpen}
                        removeFromPlaylist={removeFromPlaylist}
                        playlistName="Recommendations"
                      />
                    ))}
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-black">Discovery</h3>
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                      {['Trending', 'Pop', 'Hip Hop', 'Rock', 'Electronic', 'Country'].map(cat => (
                        <button
                          key={cat}
                          onClick={() => setDiscoveryCategory(cat)}
                          className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all whitespace-nowrap ${discoveryCategory === cat ? 'bg-white text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {isDiscoveryLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {discoverySongs.map((song, i) => (
                        <SongRow 
                          key={`${song.id}-${i}`} 
                          song={song}
                          currentIndex={currentIndex}
                          playSong={playSong}
                          viewArtist={viewArtist}
                          likedSongs={likedSongs}
                          toggleLikeSong={toggleLikeSong}
                          setSongToAddToPlaylist={setSongToAddToPlaylist}
                          setIsAddToPlaylistOpen={setIsAddToPlaylistOpen}
                          removeFromPlaylist={removeFromPlaylist}
                          playlistName="Search Results"
                        />
                      ))}
                    </div>
                  )}
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Queue Sidebar Overlay */}
        <AnimatePresence>
          {isQueueVisible && (
            <motion.div 
              key="queue-sidebar"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="absolute top-0 right-0 w-80 h-full bg-bg-sidebar border-l border-border z-20 flex flex-col shadow-2xl"
            >
              <div className="p-6 flex items-center justify-between border-b border-border">
                <h3 className="font-bold">Queue</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPlaylist([])} className="text-xs text-white/40 hover:text-white">Clear</button>
                  <button onClick={() => setIsQueueVisible(false)} className="p-1 hover:bg-white/10 rounded-full">
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-1 select-none">
                {playlist.map((song, i) => (
                  <SongRow 
                    key={`${song.id}-${i}`} 
                    song={song} 
                    index={i} 
                    isQueue 
                    currentIndex={currentIndex}
                    playSong={playSong}
                    viewArtist={viewArtist}
                    likedSongs={likedSongs}
                    toggleLikeSong={toggleLikeSong}
                    setSongToAddToPlaylist={setSongToAddToPlaylist}
                    setIsAddToPlaylistOpen={setIsAddToPlaylistOpen}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Player Bar */}
      <footer className="fixed bottom-0 left-0 right-0 h-24 bg-black border-t border-border px-4 flex items-center justify-between z-50">
        <div className="flex items-center gap-4 w-1/3 min-w-0">
          {currentSong ? (
            <>
              <img src={currentSong.thumbnail} className="w-14 h-14 rounded object-cover" referrerPolicy="no-referrer" />
              <div className="min-w-0">
                <h4 className="text-sm font-medium truncate">{currentSong.title}</h4>
                <p className="text-xs text-white/50 truncate hover:underline cursor-pointer" onClick={() => viewArtist(currentSong.uploaderName)}>{currentSong.uploaderName}</p>
              </div>
              <button 
                className={`ml-2 transition-colors ${likedSongs.some(s => s.id === currentSong.id) ? 'text-white' : 'text-white/40 hover:text-white'}`}
                onClick={() => toggleLikeSong(currentSong)}
              >
                <Heart size={18} className={likedSongs.some(s => s.id === currentSong.id) ? 'fill-white' : ''} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/5 rounded" />
              <div className="space-y-2">
                <div className="w-32 h-3 bg-white/5 rounded" />
                <div className="w-20 h-2 bg-white/5 rounded" />
              </div>
            </div>
          )}
        </div>

          <div className="flex flex-col items-center gap-2 w-1/3">
            <div className="flex items-center gap-6">
              <button 
                onClick={toggleShuffle}
                className={`transition-colors ${isShuffle ? 'text-white' : 'text-white/40 hover:text-white'}`}
              >
                <Shuffle size={18} />
              </button>
              <button onClick={prevSong} className="text-white/60 hover:text-white transition-colors"><SkipBack size={24} className="fill-current" /></button>
              <button 
                onClick={togglePlay}
                className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform"
              >
                {isPlaying ? <Pause size={20} className="fill-black" /> : <Play size={20} className="fill-black ml-1" />}
              </button>
              <button onClick={nextSong} className="text-white/60 hover:text-white transition-colors"><SkipForward size={24} className="fill-current" /></button>
              <button 
                onClick={() => setIsRepeat(!isRepeat)}
                className={`transition-colors ${isRepeat ? 'text-white' : 'text-white/40 hover:text-white'}`}
              >
                <Repeat size={18} />
              </button>
            </div>
            <div className="w-full max-w-md flex items-center gap-2">
              <span className="text-[10px] text-white/40 w-8 text-right">{formatTime(currentTime)}</span>
              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden relative">
                <div 
                  className="absolute inset-y-0 left-0 bg-white transition-all duration-1000" 
                  style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-white/40 w-8">{formatTime(duration)}</span>
              <button 
                onClick={() => { 
                  if(playerStatus.includes('Error') || playerStatus === 'Unstarted' || playerStatus === 'Resetting...') {
                    resetPlayer();
                  } else if(playerRef.current) {
                    try {
                      playerRef.current.playVideo(); 
                    } catch (e) {
                      resetPlayer();
                    }
                  }
                }}
                className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] text-white/60 uppercase tracking-widest transition-colors flex items-center gap-2 border border-white/10"
                title="Click to Force Play or Reset Player"
              >
                <div className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-white/20'}`} />
                {playerStatus}
                <span className="text-[8px] opacity-40 ml-1">Fix</span>
              </button>
            </div>
          </div>

        <div className="flex items-center justify-end gap-4 w-1/3">
          <button onClick={toggleMute} className="text-white/60 hover:text-white transition-colors">
            {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <input 
            type="range" 
            min="0" max="100" 
            value={volume}
            onChange={handleVolumeChange}
            className="w-24 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
          />
        </div>
      </footer>

      {/* Player - Kept visible but small to prevent browser throttling and allow manual click if blocked */}
      <div className="fixed bottom-24 right-4 w-[160px] h-[90px] bg-black rounded-lg overflow-hidden shadow-2xl border border-white/10 z-[50] group transition-all hover:scale-105">
        <div id="player" className="w-full h-full"></div>
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          <p className="text-[10px] font-bold text-white uppercase tracking-tighter">YouTube Engine</p>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isCreatePlaylistOpen && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
            <motion.div 
              key="create-playlist-modal"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-bg-card p-8 rounded-2xl w-full max-w-md border border-border shadow-2xl"
            >
              <h2 className="text-2xl font-bold mb-6">New Playlist</h2>
              <input 
                autoFocus
                className="w-full p-4 rounded-lg bg-black border border-border mb-6 focus:outline-none focus:border-white/30"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
                placeholder="Playlist name"
              />
              <div className="flex justify-end gap-4">
                <button onClick={() => setIsCreatePlaylistOpen(false)} className="px-6 py-2 text-white/50 hover:text-white font-medium">Cancel</button>
                <button onClick={createPlaylist} className="bg-white text-black px-8 py-2 rounded-full font-bold">Create</button>
              </div>
            </motion.div>
          </div>
        )}

        {isAddToPlaylistOpen && songToAddToPlaylist && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
            <motion.div 
              key="add-to-playlist-modal"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-bg-card p-8 rounded-2xl w-full max-w-md border border-border shadow-2xl flex flex-col max-h-[80vh]"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Add to Playlist</h2>
                <button onClick={() => setIsAddToPlaylistOpen(false)} className="text-white/50 hover:text-white"><X /></button>
              </div>
              <div className="flex items-center gap-4 p-4 bg-white/5 rounded-lg mb-6">
                <img src={songToAddToPlaylist.thumbnail} className="w-12 h-12 rounded object-cover" referrerPolicy="no-referrer" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{songToAddToPlaylist.title}</p>
                  <p className="text-xs text-white/50 truncate">{songToAddToPlaylist.uploaderName}</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                {playlists.map((pl, i) => (
                  <button 
                    key={`${pl.name}-${i}`}
                    onClick={() => addToPlaylist(songToAddToPlaylist, pl.name)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-white/5 rounded flex items-center justify-center">
                      <Music size={18} className="text-white/40" />
                    </div>
                    <span className="font-medium">{pl.name}</span>
                  </button>
                ))}
                {playlists.length === 0 && (
                  <p className="text-center py-8 text-white/40">No playlists found.</p>
                )}
              </div>
              <button 
                onClick={() => { setIsAddToPlaylistOpen(false); setIsCreatePlaylistOpen(true); }}
                className="mt-6 w-full py-3 border border-dashed border-white/20 rounded-lg text-white/60 hover:text-white hover:border-white/40 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={18} /> Create new playlist
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
