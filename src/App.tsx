import { useState, useEffect, useRef, useCallback, ChangeEvent, FormEvent } from 'react';
import { 
  Shuffle, Sun, Moon, X, Search, Play, Pause, SkipBack, SkipForward, 
  Menu, Heart, Plus, Music, ListMusic, Home, Library, MoreVertical,
  Volume2, VolumeX, Repeat, LayoutGrid, List, RefreshCw, AlertTriangle, Download, User, LogOut, Globe, Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  auth, db, googleProvider, signInWithPopup, onAuthStateChanged, signOut, 
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  doc, setDoc, getDoc, collection, query as queryFirestore, where, getDocs, onSnapshot, 
  Timestamp, deleteDoc, handleFirestoreError, OperationType, FirebaseUser 
} from './firebase';

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

interface Artist {
  name: string;
  thumbnail: string;
}

interface SongDetails {
  history: string;
  shows: string[];
  similarSongs: string[];
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
  playlistName,
  onShowDetails
}: SongRowProps & { 
  removeFromPlaylist?: (song: Song, playlistName: string) => void, 
  playlistName?: string,
  onShowDetails?: (song: Song) => void
}) => (
  <div 
    className={`group flex items-center gap-4 p-3 rounded-xl hover:bg-white/10 transition-all cursor-pointer border border-transparent hover:border-white/5 ${isQueue && index === currentIndex ? 'bg-white/10 border-white/10' : ''}`}
    onClick={() => playSong(song, isQueue)}
  >
    <div className="relative w-14 h-14 flex-shrink-0 shadow-lg">
      <img src={song.thumbnail} className="w-full h-full object-cover rounded-lg" referrerPolicy="no-referrer" />
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all rounded-lg" onClick={(e) => { e.stopPropagation(); playSong(song, isQueue); }}>
        <Play size={20} className="fill-white text-white" />
      </div>
    </div>
    <div className="flex-1 min-w-0 py-1">
      <h4 className={`text-sm font-bold leading-tight mb-1 ${isQueue && index === currentIndex ? 'text-[#1DB954]' : 'text-white'}`}>
        {song.title}
      </h4>
      <div className="flex items-center gap-2">
        <p className="text-xs text-white/40 truncate hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); viewArtist(song.uploaderName); }}>
          {song.uploaderName}
        </p>
        <span className="text-[10px] text-white/20">•</span>
        <span className="text-[10px] text-white/20 font-mono uppercase">{song.duration}</span>
      </div>
    </div>
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
      <button 
        className={`p-2 hover:bg-white/10 rounded-full transition-all ${likedSongs.some(s => s.id === song.id) ? 'text-[#1DB954]' : 'text-white/40 hover:text-white'}`}
        onClick={(e) => { e.stopPropagation(); toggleLikeSong(song); }}
        title={likedSongs.some(s => s.id === song.id) ? "Remove from Liked" : "Save to Liked"}
      >
        <Heart size={16} className={likedSongs.some(s => s.id === song.id) ? 'fill-[#1DB954]' : ''} />
      </button>
      <button 
        className="p-2 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-all"
        onClick={(e) => { e.stopPropagation(); setSongToAddToPlaylist(song); setIsAddToPlaylistOpen(true); }}
        title="Add to Playlist"
      >
        <Plus size={16} />
      </button>
      {removeFromPlaylist && playlistName && (
        <button 
          className="p-2 hover:bg-white/10 rounded-full text-white/40 hover:text-red-500 transition-all"
          onClick={(e) => { e.stopPropagation(); removeFromPlaylist(song, playlistName); }}
          title="Remove from Playlist"
        >
          <X size={16} />
        </button>
      )}
    </div>
  </div>
);

export default function App() {
  // --- State ---
  const [playlist, setPlaylist] = useState<Song[]>(JSON.parse(localStorage.getItem('unlimitedPlaylist') || '[]'));
  const [currentSong, setCurrentSong] = useState<Song | null>(JSON.parse(localStorage.getItem('currentSong') || 'null'));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ songs: Song[], artists: Song[], playlists: Song[], albums: Song[] }>({ songs: [], artists: [], playlists: [], albums: [] });
  const [activeSearchTab, setActiveSearchTab] = useState<'songs' | 'artists' | 'playlists'>('songs');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [viewingSection, setViewingSection] = useState<'home' | 'liked' | 'playlist' | 'artist' | 'transfer'>('home');
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [artistSongs, setArtistSongs] = useState<Song[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isQueueVisible, setIsQueueVisible] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [discoverySongs, setDiscoverySongs] = useState<Song[]>([]);
  const [discoveryCategory, setDiscoveryCategory] = useState('Trending');
  const [communityPlaylists, setCommunityPlaylists] = useState<any[]>([]);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false);
  const [featuredDiscoverySong, setFeaturedDiscoverySong] = useState<Song | null>(null);

  useEffect(() => {
    if (discoverySongs.length > 0 && !featuredDiscoverySong) {
      setFeaturedDiscoverySong(discoverySongs[Math.floor(Math.random() * discoverySongs.length)]);
    }
  }, [discoverySongs]);

  useEffect(() => {
    setFeaturedDiscoverySong(null);
  }, [discoveryCategory]);
  const [likedSongs, setLikedSongs] = useState<Song[]>(JSON.parse(localStorage.getItem('likedSongs') || '[]'));
  const [favoriteArtists, setFavoriteArtists] = useState<Artist[]>(JSON.parse(localStorage.getItem('favoriteArtists') || '[]'));
  const [playlists, setPlaylists] = useState<Playlist[]>(JSON.parse(localStorage.getItem('userPlaylists') || '[]'));
  const [transferDestination, setTransferDestination] = useState<'new' | 'existing' | 'liked'>('new');
  const [selectedExistingPlaylist, setSelectedExistingPlaylist] = useState('');
  const [selectedSongDetails, setSelectedSongDetails] = useState<Song | null>(null);
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
  const [isSpotifyPlaylistsLoading, setIsSpotifyPlaylistsLoading] = useState(false);
  const [isSpotifyTracksLoading, setIsSpotifyTracksLoading] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const localUpdateTimestamp = useRef<number>(0);
  const [hasLoadedFromFirestore, setHasLoadedFromFirestore] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [publicPlaylists, setPublicPlaylists] = useState<any[]>([]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Auth & Sync Logic ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Consolidated User Data Listener
  useEffect(() => {
    if (!user) {
      setLikedSongs([]);
      setPlaylists([]);
      setFavoriteArtists([]);
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      // CRITICAL: If we have pending local writes, OR we just updated locally, DO NOT overwrite local state
      const timeSinceLocalUpdate = Date.now() - localUpdateTimestamp.current;
      if (docSnap.metadata.hasPendingWrites || timeSinceLocalUpdate < 3000) {
        console.log("Firestore Sync: Skipping update to protect local changes", { 
          hasPendingWrites: docSnap.metadata.hasPendingWrites, 
          timeSinceLocalUpdate 
        });
        return;
      }

      if (docSnap.exists()) {
        const data = docSnap.data();
        
        // Only update if the data is actually different to avoid unnecessary re-renders and potential race conditions
        if (data.likedSongs && JSON.stringify(data.likedSongs) !== JSON.stringify(likedSongsRef.current)) {
          setLikedSongs(data.likedSongs);
        }
        if (data.playlists && JSON.stringify(data.playlists) !== JSON.stringify(userPlaylistsRef.current)) {
          setPlaylists(data.playlists);
        }
        if (data.favoriteArtists && JSON.stringify(data.favoriteArtists) !== JSON.stringify(favoriteArtistsRef.current)) {
          setFavoriteArtists(data.favoriteArtists);
        }
      } else {
        // Initialize user doc if it doesn't exist
        setDoc(userDocRef, {
          uid: user.uid,
          username: user.displayName || user.email?.split('@')[0] || 'User',
          likedSongs: [],
          playlists: [],
          favoriteArtists: [],
          updatedAt: Timestamp.now()
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
      }
      setHasLoadedFromFirestore(true);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      setHasLoadedFromFirestore(true);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'public_playlists'), (snapshot) => {
      const playlists = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCommunityPlaylists(playlists);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'public_playlists');
    });
    return () => unsubscribe();
  }, []);
  const syncUserData = useCallback(async () => {
    if (!user || !hasLoadedFromFirestore) return;
    
    try {
      const userDocRef = doc(db, 'users', user.uid);
      
      // Update local storage as a fallback
      localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
      localStorage.setItem('userPlaylists', JSON.stringify(playlists));
      localStorage.setItem('favoriteArtists', JSON.stringify(favoriteArtists));

      await setDoc(userDocRef, {
        likedSongs,
        playlists,
        favoriteArtists,
        updatedAt: Timestamp.now()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }
  }, [user, hasLoadedFromFirestore, likedSongs, playlists, favoriteArtists]);

  useEffect(() => {
    const timer = setTimeout(() => {
      syncUserData();
    }, 500); // Much faster sync (500ms) to prevent race conditions with onSnapshot
    return () => clearTimeout(timer);
  }, [syncUserData]);

  const handleGoogleLogin = async () => {
    try {
      setIsAuthLoading(true);
      setAuthError('');
      await signInWithPopup(auth, googleProvider);
      setIsAuthModalOpen(false);
      showToast('Logged in with Google', 'success');
    } catch (err: any) {
      console.error("Login error:", err);
      setAuthError(err.message);
      showToast(`Login failed: ${err.message}`, 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError('');
    try {
      if (authMode === 'register') {
        await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
        showToast('Account created successfully!', 'success');
      } else {
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
        showToast('Logged in successfully!', 'success');
      }
      setIsAuthModalOpen(false);
      setAuthForm({ email: '', password: '' });
    } catch (err: any) {
      console.error("Auth error:", err);
      setAuthError(err.message);
      showToast(err.message, 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      showToast('Logged out', 'info');
    } catch (err: any) {
      showToast(`Logout failed: ${err.message}`, 'error');
    }
  };
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [manualSpotifyUrl, setManualSpotifyUrl] = useState('');
  const [manualYoutubeUrl, setManualYoutubeUrl] = useState('');
  const [textImportValue, setTextImportValue] = useState('');
  const [isTextImportOpen, setIsTextImportOpen] = useState(true);
  const [importPreviewSongs, setImportPreviewSongs] = useState<{ originalQuery: string, song: Song | null }[]>([]);
  const [isImportPreviewMode, setIsImportPreviewMode] = useState(false);
  const [importPlaylistName, setImportPlaylistName] = useState('');
  const [importArtistName, setImportArtistName] = useState('');
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  const [replaceSearchQuery, setReplaceSearchQuery] = useState('');
  const [replaceSearchResults, setReplaceSearchResults] = useState<Song[]>([]);
  const [isReplaceSearching, setIsReplaceSearching] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Song[]>(JSON.parse(localStorage.getItem('recentlyPlayed') || '[]'));
  const [playStats, setPlayStats] = useState<Record<string, { count: number, lastPlayed: number }>>(JSON.parse(localStorage.getItem('playStats') || '{}'));
  const [recommendations, setRecommendations] = useState<Song[]>([]);

  const playerRef = useRef<any>(null);
  const progressInterval = useRef<any>(null);
  const playlistRef = useRef(playlist);
  const currentSongRef = useRef(currentSong);
  const currentIndexRef = useRef(currentIndex);
  const isPlayingRef = useRef(isPlaying);
  const likedSongsRef = useRef(likedSongs);
  const userPlaylistsRef = useRef(playlists);
  const favoriteArtistsRef = useRef(favoriteArtists);
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
    currentSongRef.current = currentSong;
  }, [currentSong]);

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
    userPlaylistsRef.current = playlists;
  }, [playlists]);

  useEffect(() => {
    favoriteArtistsRef.current = favoriteArtists;
  }, [favoriteArtists]);

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

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // --- Initialization ---
  const initPlayer = useCallback(() => {
    if (playerRef.current || !window.YT || !window.YT.Player) {
      console.log("Player init skipped:", { exists: !!playerRef.current, yt: !!window.YT, ytPlayer: !!window.YT?.Player });
      return;
    }

    if (!document.getElementById('player')) {
      console.error("Player element #player not found in DOM");
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
          'enablejsapi': 1,
          'mute': 0
        },
        events: { 
          'onReady': () => {
            console.log("Player Ready Event");
            setIsPlayerReady(true);
            setPlayerStatus('Ready');
            
            // Ensure volume and mute state are synced
            if (playerRef.current) {
              playerRef.current.setVolume(volume);
              if (isMuted) playerRef.current.mute(); else playerRef.current.unMute();
            }
            
            const songToPlay = pendingSongRef.current || currentSongRef.current || playlistRef.current[currentIndexRef.current];
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
    const checkAuth = async () => {
      try {
        const data = await safeFetch('/api/spotify/playlists');
        setIsSpotifyAuthenticated(true);
        setSpotifyPlaylists(data.items || []);
      } catch (e) {
        // Not authenticated or error, ignore silently for initial check
      }
    };
    checkAuth();

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
        playerRef.current.setVolume(volume);
        if (isMuted) playerRef.current.mute(); else playerRef.current.unMute();
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    }
  }, [isPlayerReady, currentIndex, isPlaying, playlist, volume, isMuted]);

  useEffect(() => {
    if (isPlayerReady && playerRef.current) {
      playerRef.current.setVolume(volume);
    }
  }, [volume, isPlayerReady]);

  useEffect(() => {
    if (isPlayerReady && playerRef.current) {
      if (isMuted) playerRef.current.mute();
      else playerRef.current.unMute();
    }
  }, [isMuted, isPlayerReady]);

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
    const fetchSuggestions = async () => {
      if (searchQuery.length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        const res = await fetch(`/api/suggestions?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSuggestions(data);
      } catch (err) {
        console.error("Suggestions error:", err);
      }
    };

    const timer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    localStorage.setItem('unlimitedPlaylist', JSON.stringify(playlist));
    localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
    localStorage.setItem('favoriteArtists', JSON.stringify(favoriteArtists));
    localStorage.setItem('userPlaylists', JSON.stringify(playlists));
  }, [playlist, likedSongs, favoriteArtists, playlists]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.search-container')) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Actions ---
  const safeFetch = async (url: string, options?: RequestInit) => {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");
    
    if (contentType && contentType.includes("text/html")) {
      const text = await response.text();
      console.error("HTML response received instead of JSON:", text.substring(0, 200));
      
      if (text.includes("Active preview") || text.includes("Loading")) {
        throw new Error("The server is still starting up. Please wait 10-15 seconds and try again.");
      } else if (text.includes("404") || text.includes("Not Found")) {
        throw new Error("The API endpoint was not found. Please refresh the page.");
      } else if (response.status === 403) {
        throw new Error("Access Forbidden (403). This often means Spotify API keys are invalid or your Spotify Developer account lacks the required Premium subscription.");
      } else {
        throw new Error(`Unexpected server response (${response.status} HTML). The server might be restarting or misconfigured.`);
      }
    }
    
    const data = await response.json();
    if (!response.ok) {
      const message = data.error?.message || data.error || `Request failed with status ${response.status}`;
      if (message.includes("premium subscription")) {
        throw new Error("Spotify Premium Required: The owner of the Spotify Developer App must have an active Premium subscription to use this feature.");
      }
      throw new Error(message);
    }
    return data;
  };

  const [serverRedirectUri, setServerRedirectUri] = useState<string>("");
  const [isSpotifyConfigured, setIsSpotifyConfigured] = useState<boolean>(true);

  useEffect(() => {
    safeFetch("/api/config")
      .then(data => {
        if (data.redirectUri) setServerRedirectUri(data.redirectUri);
        const configured = data.spotifyClientId === "Set" && data.spotifyClientSecret === "Set";
        setIsSpotifyConfigured(configured);
        if (!configured) {
          console.warn("Spotify API keys are missing. Please add them to the Secrets panel.");
        }
      })
      .catch(err => console.error("Failed to fetch config:", err));
  }, []);

  const handleSpotifyConnect = async () => {
    try {
      const data = await safeFetch('/api/auth/spotify');
      window.open(data.url, 'spotify_auth', 'width=600,height=800');
    } catch (err: any) {
      console.error("Spotify connect error:", err);
      showToast(err.message, 'error');
    }
  };

  const fetchSpotifyPlaylists = async () => {
    setIsSpotifyPlaylistsLoading(true);
    try {
      const data = await safeFetch('/api/spotify/playlists');
      setSpotifyPlaylists(data.items || []);
      setIsSpotifyAuthenticated(true);
    } catch (err: any) {
      console.error("Fetch Spotify playlists error:", err);
      if (err.message.includes("premium subscription")) {
        showToast("Spotify Premium required for automatic sync. Try manual import below!", 'error');
      } else if (err.message.includes("401")) {
        setIsSpotifyAuthenticated(false);
        showToast("Spotify session expired. Please reconnect.", 'info');
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      setIsSpotifyPlaylistsLoading(false);
    }
  };

  const viewSpotifyPlaylist = async (pl: any) => {
    setSelectedSpotifyPlaylist(pl);
    setIsSpotifyTracksLoading(true);
    try {
      const data = await safeFetch(`/api/spotify/playlists/${pl.id}/tracks`);
      setSpotifyTracks(data.items || []);
    } catch (err: any) {
      console.error("Fetch Spotify tracks error:", err);
      showToast(err.message, 'error');
    } finally {
      setIsSpotifyTracksLoading(false);
    }
  };

  const importManualPlaylist = async () => {
    if (!manualSpotifyUrl) return;
    
    const match = manualSpotifyUrl.match(/playlist\/([a-zA-Z0-9]+)/);
    if (!match) {
      showToast("Invalid Spotify Playlist URL", 'error');
      return;
    }
    
    const playlistId = match[1];
    setIsSpotifyPlaylistsLoading(true);
    
    try {
      const data = await safeFetch(`/api/spotify/playlists/${playlistId}`);
      
      setSpotifyPlaylists(prev => {
        if (prev.some(p => p.id === data.id)) return prev;
        return [data, ...prev];
      });
      
      viewSpotifyPlaylist(data);
      setManualSpotifyUrl('');
      showToast("Playlist found!", 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSpotifyPlaylistsLoading(false);
    }
  };

  const importSpotifyTrack = async (track: any) => {
    setIsTransferring(true);
    try {
      const query = `${track.name} ${track.artists[0].name}`;
      const data = await safeFetch(`/api/search?q=${encodeURIComponent(query)}`);
      const firstVideo = data.items.find((i: any) => i.type === 'video');
      if (firstVideo) {
        playSong(firstVideo);
        showToast(`Playing: ${track.name}`, 'success');
      } else {
        showToast(`Could not find "${track.name}" on YouTube`, 'error');
      }
    } catch (err: any) {
      console.error("Import Spotify track error:", err);
      showToast(`Failed to import track: ${err.message}`, 'error');
    } finally {
      setIsTransferring(false);
    }
  };

  const importSpotifyPlaylist = async (pl: any) => {
    setIsTransferring(true);
    setImportProgress({ current: 0, total: pl.tracks.total });
    
    try {
      let allTracks: any[] = [];
      let offset = 0;
      const limit = 100;
      let hasMore = true;
      
      while (hasMore) {
        const data = await safeFetch(`/api/spotify/playlists/${pl.id}/tracks?offset=${offset}&limit=${limit}`);
        const pageTracks = data.items || [];
        allTracks = [...allTracks, ...pageTracks];
        
        if (data.next && allTracks.length < 1000) { // Safety cap at 1000 songs
          offset += limit;
        } else {
          hasMore = false;
        }
      }
      
      const tracks = allTracks;
      const importedSongs: Song[] = [];
      
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i].track;
        if (!track) continue;
        
        setImportProgress({ current: i + 1, total: tracks.length });
        
        const query = `${track.name} ${track.artists[0].name}`;
        try {
          const searchData = await safeFetch(`/api/search?q=${encodeURIComponent(query)}`);
          const firstVideo = searchData.items.find((item: any) => item.type === 'video');
          
          if (firstVideo) {
            importedSongs.push(firstVideo);
          }
          
          // Small delay to prevent rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (e) {
          console.error(`Error importing track ${track.name}:`, e);
        }
      }

      if (importedSongs.length > 0) {
        const newPlName = `Spotify: ${pl.name}`;
        setPlaylists(prev => [...prev, { name: newPlName, songs: importedSongs }]);
        showToast(`Successfully imported ${importedSongs.length} songs to playlist "${newPlName}"`, 'success');
      } else {
        showToast("No songs were found on YouTube to import", 'error');
      }
    } catch (err: any) {
      console.error("Bulk import error:", err);
      showToast(`Failed to import playlist: ${err.message}`, 'error');
    } finally {
      setIsTransferring(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  const importYoutubePlaylist = async () => {
    if (!manualYoutubeUrl.trim()) return;
    
    try {
      let playlistId = '';
      try {
        const url = new URL(manualYoutubeUrl);
        playlistId = url.searchParams.get('list') || '';
      } catch (e) {
        // Not a URL, maybe it's just the ID
        playlistId = manualYoutubeUrl;
      }
      
      if (!playlistId) {
        showToast("Invalid YouTube Playlist. Please provide a full URL or a Playlist ID.", 'error');
        return;
      }

      setIsTransferring(true);
      const data = await safeFetch(`/api/playlist/${playlistId}`);
      const songs = data.items || [];
      
      if (songs.length > 0) {
        const newPlName = `YT Import: ${playlistId.substring(0, 8)}...`;
        setPlaylists(prev => [...prev, { name: newPlName, songs }]);
        showToast(`Successfully imported ${songs.length} songs from YouTube playlist`, 'success');
        setManualYoutubeUrl('');
      } else {
        showToast("No songs found in this YouTube playlist", 'error');
      }
    } catch (err: any) {
      console.error("YouTube playlist import error:", err);
      showToast(`Failed to import YouTube playlist: ${err.message}`, 'error');
    } finally {
      setIsTransferring(false);
    }
  };

  const startTextImportPreview = async () => {
    if (!textImportValue.trim()) return;
    
    setIsTransferring(true);
    const lines = textImportValue.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    setImportProgress({ current: 0, total: lines.length });
    
    try {
      const previewItems: { originalQuery: string, song: Song | null }[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const query = lines[i];
        setImportProgress({ current: i + 1, total: lines.length });
        
        try {
          const artistParam = importArtistName.trim() ? `&artist=${encodeURIComponent(importArtistName.trim())}` : '';
          const searchData = await safeFetch(`/api/search?q=${encodeURIComponent(query)}${artistParam}`);
          const items = searchData.items || [];
          const bestMatch = items.find((item: any) => item.type === 'video');
          previewItems.push({ originalQuery: query, song: bestMatch || null });
          
          if (i < lines.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (e) {
          previewItems.push({ originalQuery: query, song: null });
        }
      }

      setImportPreviewSongs(previewItems);
      setIsImportPreviewMode(true);
      setImportPlaylistName(`Imported ${new Date().toLocaleDateString()}`);
    } catch (err: any) {
      console.error("Import error:", err);
      showToast(`Import failed: ${err.message}`, 'error');
    } finally {
      setIsTransferring(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setTextImportValue(content);
      showToast("File loaded! Click 'Import' to start.", 'success');
    };
    reader.readAsText(file);
  };

  const finalizeImport = () => {
    const songsToImport = importPreviewSongs.map(item => item.song).filter((s): s is Song => s !== null);
    if (songsToImport.length === 0) {
      showToast("No valid songs to import", 'error');
      return;
    }
    const name = importPlaylistName.trim() || `Imported Playlist ${new Date().toLocaleDateString()}`;
    localUpdateTimestamp.current = Date.now();
    setPlaylists(prev => [...prev, { name, songs: songsToImport }]);
    showToast(`Successfully created playlist "${name}" with ${songsToImport.length} songs`, 'success');
    setIsImportPreviewMode(false);
    setImportPreviewSongs([]);
    setTextImportValue('');
    setViewingSection('home');
  };

  const handleReplaceSearch = async (e: any) => {
    e.preventDefault();
    if (!replaceSearchQuery.trim()) return;
    
    setIsReplaceSearching(true);
    try {
      const data = await safeFetch(`/api/search?q=${encodeURIComponent(replaceSearchQuery)}`);
      setReplaceSearchResults(data.items.filter((i: any) => i.type === 'video'));
    } catch (err) {
      showToast("Search failed", 'error');
    } finally {
      setIsReplaceSearching(false);
    }
  };

  const selectReplacement = (song: Song) => {
    if (replacingIndex === null) return;
    setImportPreviewSongs(prev => {
      const next = [...prev];
      next[replacingIndex] = { ...next[replacingIndex], song };
      return next;
    });
    setReplacingIndex(null);
    setReplaceSearchQuery('');
    setReplaceSearchResults([]);
    showToast("Song updated!", 'success');
  };

  const deletePlaylist = (name: string) => {
    localUpdateTimestamp.current = Date.now();
    setPlaylists(prev => {
      const next = prev.filter(p => p.name !== name);
      localStorage.setItem('userPlaylists', JSON.stringify(next));
      return next;
    });
    setViewingSection('home');
    showToast(`Playlist "${name}" deleted`, 'info');
  };

  const generateRecommendations = useCallback(async () => {
    if (recentlyPlayed.length === 0 && likedSongs.length === 0) {
      setRecommendations(discoverySongs.slice(0, 6));
      return;
    }

    // Get top artists from playStats
    const topArtists = Object.entries(playStats)
      .sort((a, b) => (b[1] as any).count - (a[1] as any).count)
      .slice(0, 3)
      .map(([name]) => name);

    // Get some liked artists
    const likedArtists = Array.from(new Set(likedSongs.map(s => s.uploaderName))).slice(0, 3);
    
    const seedArtists = Array.from(new Set([...topArtists, ...likedArtists, ...favoriteArtists])).slice(0, 5);
    
    if (seedArtists.length > 0) {
      const randomArtist = seedArtists[Math.floor(Math.random() * seedArtists.length)];
      try {
        const data = await safeFetch(`/api/artist?name=${encodeURIComponent(randomArtist)}`);
        if (data.items && data.items.length > 0) {
          setRecommendations(data.items.slice(0, 6));
        }
      } catch (err) {
        console.error("Recommendation fetch error:", err);
      }
    }
  }, [recentlyPlayed, likedSongs, playStats, favoriteArtists, discoverySongs]);

  useEffect(() => {
    generateRecommendations();
  }, [generateRecommendations]);

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
    if (category === 'Community') return;
    setIsDiscoveryLoading(true);
    try {
      const query = category === 'Trending' ? 'popular songs 2026' : `${category} hits 2026`;
      const data = await safeFetch(`/api/search?q=${encodeURIComponent(query)}`);
      setDiscoverySongs(data.items.filter((i: any) => i.type === 'video').slice(0, 12));
    } catch (err: any) {
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
      if (selectedPlaylist?.name === playlistName) {
        setSelectedPlaylist(prev => prev ? { ...prev, songs: prev.songs.filter(s => s.id !== song.id) } : null);
      }
    }
  };

  const searchMusic = async (queryOverride?: string) => {
    const query = queryOverride || searchQuery;
    if (!query) return;
    setIsSearchOpen(true);
    setViewingSection('home');
    setSelectedArtist(null);
    setSelectedPlaylist(null);
    try {
      const data = await safeFetch(`/api/search?q=${encodeURIComponent(query)}`);
      const items = data.items || [];
      
      // Search Firestore for public playlists
      const publicPlaylistsQuery = queryFirestore(
        collection(db, 'public_playlists'),
        where('title', '>=', query),
        where('title', '<=', query + '\uf8ff')
      );
      const publicPlaylistsSnap = await getDocs(publicPlaylistsQuery);
      const firestorePlaylists = publicPlaylistsSnap.docs.map(doc => ({
        ...doc.data(),
        type: 'public_playlist',
        thumbnail: doc.data().songs?.[0]?.thumbnail || ''
      }));

      setSearchResults({
        songs: items.filter((i: any) => i.type === 'video'),
        artists: items.filter((i: any) => i.type === 'channel'),
        playlists: [
          ...items.filter((i: any) => i.type === 'playlist'),
          ...firestorePlaylists
        ],
        albums: []
      });
    } catch (err: any) {
      console.error("Search error:", err);
      showToast(`Search failed: ${err.message}`, 'error');
      setSearchResults({ songs: [], artists: [], playlists: [], albums: [] });
    }
  };

  const viewArtist = async (artistName: string) => {
    setViewingSection('artist');
    setSelectedArtist(artistName);
    setSelectedPlaylist(null);
    setIsSearchOpen(false);
    try {
      const data = await safeFetch(`/api/artist?name=${encodeURIComponent(artistName)}`);
      setArtistSongs(data.items || []);
    } catch (err: any) {
      console.error("Artist search error:", err);
      showToast(`Failed to load artist: ${err.message}`, 'error');
      setArtistSongs([]);
    }
  };

  const viewPlaylist = (pl: Playlist) => {
    setViewingSection('playlist');
    setSelectedPlaylist(pl);
    setSelectedArtist(null);
    setIsSearchOpen(false);
  };

  const fetchYouTubePlaylist = async (id: string, title: string) => {
    try {
      const data = await safeFetch(`/api/playlist/${id}`);
      if (data.items) {
        viewPlaylist({ name: title, songs: data.items });
      }
    } catch (err: any) {
      console.error("Failed to fetch YouTube playlist:", err);
      showToast(`Failed to load playlist: ${err.message}`, 'error');
    }
  };

  const handleSpotifyLogout = async () => {
    try {
      await safeFetch('/api/auth/spotify/logout');
      setIsSpotifyAuthenticated(false);
      setSpotifyPlaylists([]);
      setSpotifyTracks([]);
      setSelectedSpotifyPlaylist(null);
      showToast("Spotify session cleared", 'info');
    } catch (err: any) {
      console.error("Logout error:", err);
      showToast("Failed to logout from Spotify", 'error');
    }
  };
  const createPlaylist = () => {
    if (newPlaylistName) {
      localUpdateTimestamp.current = Date.now();
      setPlaylists(prev => [...prev, { name: newPlaylistName, songs: [] }]);
      setNewPlaylistName('');
      setIsCreatePlaylistOpen(false);
    }
  };

  const toggleLikeSong = (song: Song) => {
    localUpdateTimestamp.current = Date.now();
    setLikedSongs(prev => {
      const isLiked = prev.some(s => s.id === song.id);
      if (isLiked) {
        showToast(`Removed "${song.title}" from Liked Songs`, 'info');
        return prev.filter(s => s.id !== song.id);
      } else {
        showToast(`Added "${song.title}" to Liked Songs`, 'success');
        return [...prev, song];
      }
    });
  };

  const addToPlaylist = (song: Song, playlistName: string) => {
    localUpdateTimestamp.current = Date.now();
    setPlaylists(prev => prev.map(pl => pl.name === playlistName ? { ...pl, songs: [...pl.songs, song] } : pl));
    setIsAddToPlaylistOpen(false);
    setSongToAddToPlaylist(null);
  };

  const trackPlay = (song: Song) => {
    // Update recently played
    setRecentlyPlayed(prev => {
      const filtered = prev.filter(s => s.id !== song.id);
      const next = [song, ...filtered].slice(0, 50);
      localStorage.setItem('recentlyPlayed', JSON.stringify(next));
      return next;
    });

    // Update play stats
    setPlayStats(prev => {
      const next = { ...prev };
      const artist = song.uploaderName || 'Unknown';
      if (!next[artist]) {
        next[artist] = { count: 0, lastPlayed: 0 };
      }
      next[artist].count += 1;
      next[artist].lastPlayed = Date.now();
      localStorage.setItem('playStats', JSON.stringify(next));
      return next;
    });
  };

  const playSong = (song: Song, context?: Song[] | boolean) => {
    trackPlay(song);
    setCurrentSong(song);
    localStorage.setItem('currentSong', JSON.stringify(song));
    
    if (Array.isArray(context)) {
      setPlaylist(context);
      const index = context.findIndex(s => s.id === song.id);
      setCurrentIndex(index !== -1 ? index : 0);
    } else {
      const index = playlist.findIndex(s => s.id === song.id);
      if (index !== -1) {
        setCurrentIndex(index);
      } else {
        // Add to current playlist after current song
        const nextPlaylist = [...playlist];
        nextPlaylist.splice(currentIndex + 1, 0, song);
        setPlaylist(nextPlaylist);
        setCurrentIndex(currentIndex + 1);
      }
    }
    
    setIsPlaying(true);
    
    if (playerRef.current && isPlayerReady) {
      try {
        // Force load and play to ensure transition
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

  const nextSong = () => {
    const currentPlaylist = playlistRef.current;
    const currentIdx = currentIndexRef.current;
    
    if (currentPlaylist.length === 0) {
      playRecommendation();
      return;
    }
    
    const isAtEnd = currentIdx === currentPlaylist.length - 1;
    
    if (isAtEnd && !isRepeatRef.current) {
      playRecommendation();
    } else {
      let newIndex;
      if (isRepeatRef.current) {
        newIndex = currentIdx;
      } else if (isShuffleRef.current) {
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
      
      const nextS = currentPlaylist[newIndex];
      playSong(nextS, true);
    }
  };

  const prevSong = () => {
    const currentPlaylist = playlistRef.current;
    const currentIdx = currentIndexRef.current;
    
    if (currentPlaylist.length === 0) return;
    
    let newIndex;
    if (isRepeatRef.current) {
      newIndex = currentIdx;
    } else if (isShuffleRef.current) {
      if (currentPlaylist.length > 1) {
        do {
          newIndex = Math.floor(Math.random() * currentPlaylist.length);
        } while (newIndex === currentIdx);
      } else {
        newIndex = 0;
      }
    } else {
      newIndex = (currentIdx - 1 + currentPlaylist.length) % currentPlaylist.length;
    }
    
    const prevS = currentPlaylist[newIndex];
    playSong(prevS, true);
  };

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


  const publishPlaylist = async (pl: Playlist) => {
    if (!user) {
      setIsAuthModalOpen(true);
      showToast('Please sign in to publish playlists', 'info');
      return;
    }
    
    try {
      const playlistId = `pl_${Date.now()}`;
      const playlistDocRef = doc(db, 'public_playlists', playlistId);
      
      await setDoc(playlistDocRef, {
        id: playlistId,
        userId: user.uid,
        username: user.displayName || user.email?.split('@')[0] || 'User',
        title: pl.name,
        description: `A playlist by ${user.displayName || user.email?.split('@')[0]}`,
        songs: pl.songs,
        createdAt: Timestamp.now()
      });

      showToast('Playlist published successfully!', 'success');
    } catch (err: any) {
      console.error("Publish error:", err);
      handleFirestoreError(err, OperationType.WRITE, 'public_playlists');
      showToast(`Failed to publish playlist: ${err.message}`, 'error');
    }
  };


  const togglePlay = () => {
    if (!playerRef.current || !isPlayerReady || typeof playerRef.current.getPlayerState !== 'function') {
      setPlayerStatus('Player not ready...');
      // Try to re-init if it's really stuck
      if (!playerRef.current) initPlayer();
      return;
    }
    const state = playerRef.current.getPlayerState();
    if (state === window.YT.PlayerState.PLAYING || state === window.YT.PlayerState.BUFFERING) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    } else {
      if (typeof playerRef.current.unMute === 'function') playerRef.current.unMute();
      playerRef.current.playVideo();
      setIsPlaying(true);
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

  const toggleFavoriteArtist = (artist: any) => {
    const artistName = typeof artist === 'string' ? artist : artist.name;
    const artistThumb = typeof artist === 'string' ? '' : artist.thumbnail;
    
    setFavoriteArtists(prev => {
      const exists = prev.some(a => a.name === artistName);
      let next;
      if (exists) {
        next = prev.filter(a => a.name !== artistName);
        showToast(`Removed ${artistName} from favorites`, 'info');
      } else {
        next = [...prev, { name: artistName, thumbnail: artistThumb }];
        showToast(`Added ${artistName} to favorites`, 'success');
      }
      localStorage.setItem('favoriteArtists', JSON.stringify(next));
      return next;
    });
  };

  const removeFavoriteArtist = (artistName: string) => {
    setFavoriteArtists(prev => {
      const next = prev.filter(a => a.name !== artistName);
      localStorage.setItem('favoriteArtists', JSON.stringify(next));
      showToast(`Removed ${artistName} from favorites`, 'info');
      return next;
    });
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

  if (!isAuthReady) {
    return (
      <div className="fixed inset-0 bg-bg-main flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-700 flex items-center justify-center animate-pulse shadow-2xl shadow-indigo-500/20">
            <Music className="text-white fill-white" size={32} />
          </div>
          <p className="text-white/40 text-xs font-bold uppercase tracking-widest animate-pulse">TuneTrail</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-bg-main text-white overflow-hidden">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-28 left-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border ${
              toast.type === 'success' ? 'bg-green-600 border-green-500' : 
              toast.type === 'error' ? 'bg-red-600 border-red-500' : 
              'bg-indigo-600 border-indigo-500'
            }`}
          >
            <p className="text-sm font-bold">{toast.message}</p>
            <button onClick={() => setToast(null)} className="text-white/60 hover:text-white">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      {!isMobile && (
        <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-bg-sidebar border-r border-border transition-all duration-300 lg:relative ${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
          <div className="p-6 flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tighter flex items-center gap-3 group cursor-pointer" onClick={() => setViewingSection('home')}>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 via-red-600 to-purple-700 flex items-center justify-center shadow-lg shadow-orange-500/20 group-hover:scale-110 transition-transform relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://picsum.photos/seed/mountain/100/100')] opacity-20 bg-cover bg-center" />
                <Music className="text-white fill-white relative z-10" size={20} />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-lg font-black bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">TuneTrail</span>
                <span className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em] mt-0.5">Music for your journey</span>
              </div>
            </h1>
          </div>
        
        <div className="px-4 mb-6">
          {!user && (
            <button 
              onClick={() => { setAuthMode('login'); setIsAuthModalOpen(true); }}
              className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold transition-all"
            >
              <User size={14} /> Sign In
            </button>
          )}
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
              onClick={() => { setViewingSection('transfer'); setIsSearchOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${viewingSection === 'transfer' ? 'bg-[#1DB954]/10 text-[#1DB954]' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
            >
              <RefreshCw size={18} />
              Importer
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
            <h3 className="px-2 text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Artists</h3>
            {favoriteArtists.map((artist, i) => (
              <div key={`${artist.name}-${i}`} className="group relative">
                <button 
                  onClick={() => viewArtist(artist.name)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors truncate pr-10 ${viewingSection === 'artist' && selectedArtist === artist.name ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                >
                  {artist.thumbnail ? (
                    <img src={artist.thumbnail} className="w-6 h-6 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                      <Library size={12} />
                    </div>
                  )}
                  <span className="truncate">{artist.name}</span>
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); removeFavoriteArtist(artist.name); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
                  title="Remove from favorites"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </nav>

        <div className="p-4 border-t border-border">
          {user ? (
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                  <User size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{user.displayName || user.email?.split('@')[0] || 'User'}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">User</p>
                </div>
              </div>
              <button onClick={logout} className="p-2 text-white/40 hover:text-red-500 transition-colors" title="Logout">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => { setAuthMode('login'); setIsAuthModalOpen(true); }}
              className="w-full flex items-center gap-3 p-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-600/20"
            >
              <User size={18} />
              Sign In to Sync
            </button>
          )}
        </div>
      </aside>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative pb-40 md:pb-32">
        <header className="h-16 flex items-center justify-between px-4 md:px-8 border-b border-border z-10 glass-effect sticky top-0">
          <div className="flex items-center gap-4 flex-1 max-w-xl search-container">
            {!isMobile && (
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-white/60 hover:text-white">
                <Menu size={20} />
              </button>
            )}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    searchMusic();
                    setShowSuggestions(false);
                  }
                }}
                placeholder="Search for songs, artists, or playlists..."
                className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-white/30 transition-all"
              />
              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-bg-sidebar border border-border rounded-xl shadow-2xl overflow-hidden z-50"
                  >
                    {suggestions.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setSearchQuery(suggestion);
                          searchMusic(suggestion);
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-white/5 transition-colors flex items-center gap-3"
                      >
                        <Search size={14} className="text-white/40" />
                        <span>{suggestion}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsQueueVisible(!isQueueVisible)} className={`p-2 rounded-full transition-colors ${isQueueVisible ? 'bg-white text-black' : 'hover:bg-white/10'}`}>
              <ListMusic size={20} />
            </button>
            
            {user ? (
              <div className="flex items-center gap-3 pl-4 border-l border-white/10">
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-bold truncate max-w-[100px]">{user.displayName || user.email?.split('@')[0] || 'User'}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">Member</p>
                </div>
                <div 
                  className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 cursor-pointer hover:scale-105 transition-transform" 
                  onClick={() => setIsProfileModalOpen(true)}
                >
                  <User size={16} />
                </div>
              </div>
            ) : (
              <button 
                onClick={() => { setAuthMode('login'); setIsAuthModalOpen(true); }}
                className="hidden sm:flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-full text-xs font-bold transition-all shadow-lg shadow-indigo-600/20"
              >
                <User size={14} />
                Sign In
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 pb-32">
          <AnimatePresence mode="wait">
            {isSearchOpen ? (
              <motion.div 
                key="search"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                  <h2 className="text-3xl font-black tracking-tight">Search Results</h2>
                  <div className="flex items-center gap-2 bg-white/5 p-1 rounded-full border border-white/10 overflow-x-auto no-scrollbar">
                    {(['songs', 'artists', 'playlists'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveSearchTab(tab)}
                        className={`px-6 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${activeSearchTab === tab ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-h-[400px]">
                  {activeSearchTab === 'songs' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {searchResults.songs.length > 0 ? (
                        searchResults.songs.map((song, i) => (
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
                          />
                        ))
                      ) : (
                        <div className="col-span-full py-20 text-center text-white/20">No songs found.</div>
                      )}
                    </div>
                  )}

                  {activeSearchTab === 'artists' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-8">
                      {searchResults.artists.length > 0 ? (
                        searchResults.artists.map((artist, i) => (
                          <div 
                            key={`${artist.id}-${i}`} 
                            className="flex flex-col items-center gap-4 group cursor-pointer"
                            onClick={() => viewArtist(artist.uploaderName)}
                          >
                            <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-2 border-white/5 group-hover:border-indigo-500/50 transition-all shadow-2xl relative">
                              <img src={artist.thumbnail} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                            </div>
                            <span className="text-sm font-bold group-hover:text-indigo-400 transition-colors text-center">{artist.uploaderName}</span>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-full py-20 text-center text-white/20">No artists found.</div>
                      )}
                    </div>
                  )}

                  {activeSearchTab === 'playlists' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                      {searchResults.playlists.length > 0 ? (
                        searchResults.playlists.map((pl: any, i) => (
                          <motion.div 
                            key={`${pl.id}-${i}`}
                            whileHover={{ y: -5 }}
                            className="group bg-white/5 hover:bg-white/10 p-4 rounded-2xl transition-all cursor-pointer border border-white/5 hover:border-white/10"
                            onClick={() => {
                              if (pl.type === 'public_playlist') {
                                viewPlaylist({ name: pl.title, songs: pl.songs });
                              } else {
                                fetchYouTubePlaylist(pl.id, pl.title);
                              }
                            }}
                          >
                            <div className="relative aspect-square mb-4 shadow-2xl overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                              <img src={pl.thumbnail} className="w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform duration-700" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                                  <Play size={24} className="text-black fill-black ml-1" />
                                </div>
                              </div>
                            </div>
                            <h3 className="font-bold text-white mb-1 truncate">{pl.title}</h3>
                            <p className="text-xs text-white/40 truncate">{pl.uploaderName}</p>
                          </motion.div>
                        ))
                      ) : (
                        <div className="col-span-full py-20 text-center text-white/20">No playlists found.</div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : viewingSection === 'library' ? (
              <motion.div 
                key="library"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8 p-4 md:p-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-4xl md:text-6xl font-black tracking-tight">Your Library</h1>
                    <p className="text-white/40 mt-2">Manage your playlists and favorite artists.</p>
                  </div>
                  <button 
                    onClick={() => setIsCreatePlaylistOpen(true)}
                    className="p-4 bg-white text-black rounded-full hover:scale-105 transition-transform shadow-xl"
                  >
                    <Plus size={24} />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                  {playlists.map((pl, i) => (
                    <motion.div 
                      key={`${pl.name}-${i}`}
                      whileHover={{ y: -5 }}
                      className="group bg-white/5 hover:bg-white/10 p-4 rounded-2xl transition-all cursor-pointer border border-white/5 hover:border-white/10"
                      onClick={() => viewPlaylist(pl)}
                    >
                      <div className="relative aspect-square mb-4 shadow-2xl overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                        {pl.songs[0] ? (
                          <img src={pl.songs[0].thumbnail} className="w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform duration-700" referrerPolicy="no-referrer" />
                        ) : (
                          <Music size={48} className="text-white/10" />
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                            <Play size={24} className="text-black fill-black ml-1" />
                          </div>
                        </div>
                      </div>
                      <h3 className="font-bold text-white mb-1 truncate">{pl.name}</h3>
                      <p className="text-xs text-white/40">{pl.songs.length} songs</p>
                    </motion.div>
                  ))}
                </div>

                {favoriteArtists.length > 0 && (
                  <div className="mt-12">
                    <h2 className="text-2xl font-bold mb-6">Favorite Artists</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6">
                      {favoriteArtists.map((artist, i) => (
                        <motion.div 
                          key={`${artist.name}-${i}`}
                          whileHover={{ scale: 1.05 }}
                          className="flex flex-col items-center gap-3 cursor-pointer group"
                          onClick={() => viewArtist(artist.name)}
                        >
                          <div className="relative w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-full overflow-hidden shadow-xl border-2 border-white/5 group-hover:border-indigo-500 transition-all">
                            {artist.thumbnail ? (
                              <img src={artist.thumbnail} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                <User size={40} className="text-white/10" />
                              </div>
                            )}
                          </div>
                          <p className="text-xs md:text-sm font-bold text-center truncate w-full group-hover:text-indigo-400 transition-colors">{artist.name}</p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
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

                {!user && (
                  <div className="p-6 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                        <User size={24} />
                      </div>
                      <div>
                        <h3 className="font-bold">Save your Liked Songs</h3>
                        <p className="text-sm text-white/60">Sign in to sync your library across devices and never lose your music.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => { setAuthMode('login'); setIsAuthModalOpen(true); }}
                      className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-full font-bold transition-all whitespace-nowrap"
                    >
                      Sign In Now
                    </button>
                  </div>
                )}

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
                        onClick={() => selectedArtist && toggleFavoriteArtist({ name: selectedArtist, thumbnail: artistSongs[0]?.thumbnail || '' })}
                        className={`p-3 rounded-full border border-white/20 hover:border-white transition-colors ${favoriteArtists.some(a => a.name === selectedArtist) ? 'bg-white/10' : ''}`}
                      >
                        <Heart size={20} className={favoriteArtists.some(a => a.name === selectedArtist) ? 'fill-[#1DB954] text-[#1DB954]' : ''} />
                      </button>
                      <button 
                        onClick={() => selectedArtist && removeFavoriteArtist(selectedArtist)}
                        className="p-3 rounded-full border border-white/20 hover:border-red-500 hover:text-red-500 transition-colors"
                        title="Remove from favorites"
                      >
                        <X size={20} />
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
                <div className="flex flex-col md:flex-row items-center md:items-end gap-10 mb-12">
                  <div className="w-64 h-64 bg-gradient-to-br from-indigo-500/20 to-purple-600/20 rounded-[2.5rem] shadow-2xl flex items-center justify-center border border-white/10 group relative overflow-hidden">
                    {selectedPlaylist?.songs[0] ? (
                      <img src={selectedPlaylist.songs[0].thumbnail} className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-1000" referrerPolicy="no-referrer" />
                    ) : (
                      <Music size={100} className="text-white/10" />
                    )}
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 shadow-2xl group-hover:scale-110 transition-transform">
                        <Music size={40} className="text-white/60" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-3 mb-4">
                      <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest text-white/60 border border-white/10">Private Playlist</span>
                      <span className="text-white/20">•</span>
                      <span className="text-xs font-bold text-white/40">{selectedPlaylist?.songs.length} tracks</span>
                    </div>
                    <h1 className="text-6xl md:text-8xl font-black mb-8 tracking-tighter text-white drop-shadow-2xl">{selectedPlaylist?.name}</h1>
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                      <button 
                        onClick={() => selectedPlaylist && playSong(selectedPlaylist.songs[0], selectedPlaylist.songs)}
                        className="bg-white text-black px-12 py-5 rounded-full font-black hover:scale-105 active:scale-95 transition-all flex items-center gap-4 shadow-2xl shadow-white/10"
                      >
                        <Play size={24} className="fill-black" />
                        Play All
                      </button>
                      <button 
                        onClick={() => selectedPlaylist && shuffleQueue(selectedPlaylist.songs)}
                        className="bg-white/10 hover:bg-white/20 text-white px-10 py-5 rounded-full font-bold transition-all flex items-center gap-4 border border-white/10 backdrop-blur-md"
                      >
                        <Shuffle size={22} />
                        Shuffle
                      </button>
                      {selectedPlaylist && (
                        <button 
                          onClick={() => publishPlaylist(selectedPlaylist)}
                          className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 px-8 py-5 rounded-full font-bold transition-all border border-indigo-500/30 flex items-center gap-4"
                          title="Share this playlist with the community"
                        >
                          <Share2 size={22} />
                          Publish
                        </button>
                      )}
                      <div className="flex items-center gap-2 ml-2">
                        <button 
                          onClick={() => {
                            setViewingSection('home');
                            setIsSearchOpen(true);
                            setSearchQuery(selectedPlaylist?.name || '');
                          }}
                          className="p-5 bg-white/5 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-all border border-white/5"
                          title="Add more songs"
                        >
                          <Plus size={24} />
                        </button>
                        <button 
                          onClick={() => selectedPlaylist && deletePlaylist(selectedPlaylist.name)}
                          className="p-5 bg-white/5 hover:bg-red-500/10 rounded-full text-white/40 hover:text-red-500 transition-all border border-white/5 hover:border-red-500/20"
                          title="Delete playlist"
                        >
                          <X size={24} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {!user && (
                  <div className="p-6 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                        <User size={24} />
                      </div>
                      <div>
                        <h3 className="font-bold">Sync your Playlists</h3>
                        <p className="text-sm text-white/60">Sign in to keep your custom playlists safe and accessible anywhere.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => { setAuthMode('login'); setIsAuthModalOpen(true); }}
                      className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-full font-bold transition-all whitespace-nowrap"
                    >
                      Sign In Now
                    </button>
                  </div>
                )}

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
                className="space-y-8 max-w-4xl mx-auto"
              >
                  <div className="flex items-center gap-6">
                    <div className="w-24 h-24 bg-gradient-to-br from-[#1DB954] to-[#191414] rounded-2xl shadow-2xl flex items-center justify-center">
                      <RefreshCw size={40} className={`text-white ${isTransferring ? 'animate-spin' : ''}`} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-widest mb-1 text-white/40">Music Importer</h4>
                      <h1 className="text-4xl font-black mb-2">Transfer Your Music</h1>
                      <p className="text-white/60 text-sm">Paste a list of songs to find them on YouTube.</p>
                    </div>
                  </div>

                  {!isImportPreviewMode ? (
                    <div className="space-y-6">
                      <div className="bg-white/5 p-8 rounded-3xl border border-white/10 space-y-6">
                        <div className="space-y-4">
                          <h3 className="text-xl font-bold">Import Songs</h3>
                          <p className="text-xs text-white/40 leading-relaxed">
                            Paste a list of songs (one per line) or upload a text/CSV file.
                          </p>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-1">Artist Name (Optional)</label>
                              <input 
                                type="text"
                                value={importArtistName}
                                onChange={(e) => setImportArtistName(e.target.value)}
                                placeholder="e.g. Drake"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1DB954] transition-all"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-1">Playlist Name</label>
                              <input 
                                type="text"
                                value={importPlaylistName}
                                onChange={(e) => setImportPlaylistName(e.target.value)}
                                placeholder="My New Playlist"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1DB954] transition-all"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col gap-3">
                            <label className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-xl cursor-pointer hover:bg-white/10 transition-all group">
                              <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center group-hover:bg-[#1DB954]/20 group-hover:text-[#1DB954] transition-all">
                                <Plus size={20} />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-bold">Upload Text/CSV</p>
                                <p className="text-[10px] text-white/40">Import from exported files</p>
                              </div>
                              <input type="file" className="hidden" accept=".txt,.csv" onChange={handleFileUpload} />
                            </label>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <textarea 
                            value={textImportValue}
                            onChange={(e) => setTextImportValue(e.target.value)}
                            placeholder="Artist - Song Name&#10;Artist - Song Name&#10;..."
                            className="w-full h-64 bg-black/40 border border-white/10 rounded-2xl p-6 text-sm focus:outline-none focus:border-[#1DB954] custom-scrollbar transition-all"
                          />
                        </div>

                        <button 
                          onClick={startTextImportPreview}
                          disabled={!textImportValue.trim() || isTransferring}
                          className="w-full bg-[#1DB954] text-white py-4 rounded-xl font-bold hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                        >
                          {isTransferring ? (
                            <>
                              <RefreshCw className="animate-spin" size={20} />
                              <span>Processing {importProgress.current} / {importProgress.total}</span>
                            </>
                          ) : (
                            <>
                              <Music size={20} />
                              <span>Import Songs</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex flex-col gap-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button 
                          onClick={() => setTransferDestination('new')}
                          className={`p-4 rounded-xl border transition-all text-left ${transferDestination === 'new' ? 'bg-[#1DB954]/10 border-[#1DB954]' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <Plus size={20} className={transferDestination === 'new' ? 'text-[#1DB954]' : 'text-white/40'} />
                            <span className="font-bold">New Playlist</span>
                          </div>
                          <p className="text-[10px] text-white/40">Create a fresh playlist for these songs.</p>
                        </button>
                        <button 
                          onClick={() => setTransferDestination('existing')}
                          className={`p-4 rounded-xl border transition-all text-left ${transferDestination === 'existing' ? 'bg-[#1DB954]/10 border-[#1DB954]' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <ListMusic size={20} className={transferDestination === 'existing' ? 'text-[#1DB954]' : 'text-white/40'} />
                            <span className="font-bold">Add to Existing</span>
                          </div>
                          <p className="text-[10px] text-white/40">Append to one of your current playlists.</p>
                        </button>
                        <button 
                          onClick={() => setTransferDestination('liked')}
                          className={`p-4 rounded-xl border transition-all text-left ${transferDestination === 'liked' ? 'bg-[#1DB954]/10 border-[#1DB954]' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <Heart size={20} className={transferDestination === 'liked' ? 'text-[#1DB954]' : 'text-white/40'} />
                            <span className="font-bold">Liked Songs</span>
                          </div>
                          <p className="text-[10px] text-white/40">Add all songs to your Liked collection.</p>
                        </button>
                      </div>

                      <div className="flex items-center justify-between bg-white/5 p-6 rounded-2xl border border-white/10">
                        <div className="flex-1 max-w-md">
                          {transferDestination === 'new' ? (
                            <>
                              <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2 block">Playlist Name</label>
                              <input 
                                type="text"
                                value={importPlaylistName}
                                onChange={(e) => setImportPlaylistName(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-lg font-bold focus:outline-none focus:border-[#1DB954]"
                                placeholder="My New Playlist"
                              />
                            </>
                          ) : transferDestination === 'existing' ? (
                            <>
                              <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2 block">Select Playlist</label>
                              <select 
                                value={selectedExistingPlaylist}
                                onChange={(e) => setSelectedExistingPlaylist(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-lg font-bold focus:outline-none focus:border-[#1DB954] appearance-none"
                              >
                                <option value="">Choose a playlist...</option>
                                {playlists.map(pl => (
                                  <option key={pl.name} value={pl.name}>{pl.name}</option>
                                ))}
                              </select>
                            </>
                          ) : (
                            <div className="py-2">
                              <p className="font-bold text-lg">Adding to Liked Songs</p>
                              <p className="text-xs text-white/40">All matched songs will be added to your library.</p>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-3">
                          <button 
                            onClick={() => setIsImportPreviewMode(false)}
                            className="px-6 py-2 rounded-full text-sm font-bold text-white/60 hover:text-white transition-colors"
                          >
                            Back
                          </button>
                          <button 
                            onClick={finalizeImport}
                            disabled={transferDestination === 'existing' && !selectedExistingPlaylist}
                            className="bg-white text-black px-8 py-2 rounded-full text-sm font-bold hover:scale-105 transition-transform disabled:opacity-50"
                          >
                            Confirm Import
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
                      <div className="p-6 border-b border-white/5 bg-white/5">
                        <h3 className="font-bold">Review Matches ({importPreviewSongs.filter(s => s.song).length} found)</h3>
                        <p className="text-xs text-white/40">We found these songs on YouTube. Click any song to search for a better match.</p>
                      </div>
                      <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                        {importPreviewSongs.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-4 p-4 hover:bg-white/5 border-b border-white/5 group">
                            <div className="w-8 text-xs text-white/20 font-mono">{idx + 1}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-white/30 truncate mb-1 uppercase tracking-tighter">
                                Source: {item.originalQuery.split(',')[0].replace(/["']/g, '')} {item.originalQuery.split(',')[1]?.replace(/["']/g, '') ? `- ${item.originalQuery.split(',')[1].replace(/["']/g, '')}` : ''}
                              </p>
                              {item.song ? (
                                <div className="flex items-center gap-3">
                                  <img src={item.song.thumbnail} className="w-10 h-10 rounded object-cover" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold truncate">{item.song.title}</p>
                                    <p className="text-xs text-white/60 truncate">{item.song.uploaderName}</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-amber-500">
                                  <AlertTriangle size={14} />
                                  <span className="text-xs font-bold">No match found</span>
                                </div>
                              )}
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                              <button 
                                onClick={() => {
                                  setReplacingIndex(idx);
                                  // Clean up CSV-like queries for better search
                                  const cleanQuery = item.originalQuery
                                    .split(',')
                                    .slice(0, 2)
                                    .map(s => s.replace(/["']/g, '').trim())
                                    .join(' ');
                                  setReplaceSearchQuery(cleanQuery);
                                }}
                                className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                                title="Search for replacement"
                              >
                                <Search size={14} />
                              </button>
                              <button 
                                onClick={() => {
                                  setImportPreviewSongs(prev => prev.filter((_, i) => i !== idx));
                                }}
                                className="p-2 bg-red-500/10 text-red-500 rounded-full hover:bg-red-500/20 transition-colors"
                                title="Remove from import"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
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
                className="space-y-16 pb-12"
              >
                {/* Hero Section */}
                <section className="relative h-[400px] rounded-[2.5rem] overflow-hidden group shadow-2xl">
                  {featuredDiscoverySong ? (
                    <>
                      <img 
                        src={featuredDiscoverySong.thumbnail} 
                        className="w-full h-full object-cover opacity-40 group-hover:scale-105 transition-transform duration-1000" 
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
                      <div className="absolute inset-0 bg-indigo-600/10 mix-blend-overlay" />
                      <div className="absolute bottom-0 left-0 p-12 w-full">
                        <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-8">
                          <div className="space-y-4 max-w-2xl text-center md:text-left">
                            <div className="flex items-center justify-center md:justify-start gap-2 text-indigo-400 font-bold text-xs uppercase tracking-[0.3em]">
                              <Music size={14} className="fill-current" />
                              <span>Featured Discovery</span>
                            </div>
                            <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none text-white drop-shadow-2xl">
                              {featuredDiscoverySong.title}
                            </h1>
                            <p className="text-xl text-white/60 font-bold">
                              {featuredDiscoverySong.uploaderName} • {discoveryCategory} Hits
                            </p>
                            <div className="flex items-center justify-center md:justify-start gap-4 pt-4">
                              <button 
                                onClick={() => playSong(featuredDiscoverySong, discoverySongs)}
                                className="bg-white text-black px-10 py-4 rounded-full font-black hover:scale-105 active:scale-95 transition-all flex items-center gap-3 shadow-xl shadow-white/10"
                              >
                                <Play size={22} className="fill-black" />
                                Play Now
                              </button>
                              <button 
                                onClick={() => toggleLikeSong(featuredDiscoverySong)}
                                className="bg-white/10 backdrop-blur-xl text-white px-8 py-4 rounded-full font-bold hover:bg-white/20 transition-all flex items-center gap-3 border border-white/10"
                              >
                                <Heart size={22} className={likedSongs.some(s => s.id === featuredDiscoverySong.id) ? 'fill-red-500 text-red-500' : ''} />
                                {likedSongs.some(s => s.id === featuredDiscoverySong.id) ? 'Liked' : 'Add to Collection'}
                              </button>
                            </div>
                          </div>
                          <div className="hidden md:flex items-center gap-2 bg-white/5 p-1 rounded-full border border-white/10 backdrop-blur-md">
                            {['Trending', 'Chill', 'Focus', 'Workout'].map(cat => (
                              <button 
                                key={cat}
                                onClick={() => setDiscoveryCategory(cat)}
                                className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${discoveryCategory === cat ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full bg-white/5 animate-pulse flex items-center justify-center">
                      <Music size={48} className="text-white/10" />
                    </div>
                  )}
                </section>

                <section>
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-3xl font-black tracking-tight">Trending Songs</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {discoverySongs.slice(0, 6).map((song, i) => (
                      <SongRow 
                        key={`trending-${song.id}-${i}`} 
                        song={song}
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
                </section>

                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">Recommended for You</h2>
                    <p className="text-sm text-white/40">Based on your listening habits</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {recommendations.map((song, i) => (
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
                      />
                    ))}
                  </div>
                </section>

                {recentlyPlayed.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold">Recently Played</h2>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
                      {recentlyPlayed.slice(0, 6).map((song, i) => (
                        <div 
                          key={`recent-${song.id}-${i}`}
                          onClick={() => playSong(song)}
                          className="bg-white/5 p-4 rounded-xl hover:bg-white/10 transition-all cursor-pointer group"
                        >
                          <div className="relative aspect-square mb-4 shadow-2xl">
                            <img src={song.thumbnail} className="w-full h-full object-cover rounded-lg" />
                            <div className="absolute bottom-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                              <button 
                                onClick={(e) => { e.stopPropagation(); playSong(song); }}
                                className="w-10 h-10 bg-[#1DB954] text-white rounded-full shadow-xl flex items-center justify-center"
                              >
                                <Play size={18} className="fill-white" />
                              </button>
                            </div>
                          </div>
                          <p className="font-bold text-sm truncate mb-1">{song.title}</p>
                          <p className="text-xs text-white/40 truncate">{song.uploaderName}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section>
                  <div className="flex items-center gap-4 overflow-x-auto pb-4 no-scrollbar">
                    {['Trending', 'Community', 'Pop', 'Hip Hop', 'Rock', 'Electronic', 'Country'].map(cat => (
                      <button
                        key={cat}
                        onClick={() => setDiscoveryCategory(cat)}
                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${discoveryCategory === cat ? 'bg-white text-black' : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/5'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  
                  {discoveryCategory === 'Community' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
                      {communityPlaylists.map((pl, i) => (
                        <div 
                          key={`community-${pl.id}-${i}`}
                          onClick={() => viewPlaylist({ name: pl.title, songs: pl.songs })}
                          className="bg-white/5 p-4 rounded-xl hover:bg-white/10 transition-all cursor-pointer group"
                        >
                          <div className="relative aspect-square mb-4 shadow-2xl">
                            <img src={pl.songs?.[0]?.thumbnail || 'https://picsum.photos/seed/playlist/300/300'} className="w-full h-full object-cover rounded-lg" />
                            <div className="absolute bottom-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                              <button 
                                className="w-10 h-10 bg-indigo-600 text-white rounded-full shadow-xl flex items-center justify-center"
                              >
                                <Play size={18} className="fill-white" />
                              </button>
                            </div>
                          </div>
                          <p className="font-bold text-sm truncate mb-1">{pl.title}</p>
                          <p className="text-xs text-white/40 truncate">By {pl.username}</p>
                        </div>
                      ))}
                      {communityPlaylists.length === 0 && (
                        <div className="col-span-full py-12 text-center text-white/20">
                          <Globe size={48} className="mx-auto mb-4 opacity-20" />
                          <p>No community playlists yet. Be the first to publish!</p>
                        </div>
                      )}
                    </div>
                  ) : isDiscoveryLoading ? (
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
      <footer className={`fixed left-0 right-0 bg-black/95 backdrop-blur-lg border-t border-white/5 px-4 flex items-center justify-between z-50 transition-all ${isMobile ? 'h-20 bottom-16' : 'h-24 bottom-0'}`}>
        <div className="flex items-center gap-3 w-2/3 md:w-1/3 min-w-0">
          {currentSong ? (
            <>
              <img src={currentSong.thumbnail} className="w-10 h-10 md:w-14 md:h-14 rounded-lg object-cover shadow-lg" referrerPolicy="no-referrer" />
              <div className="min-w-0">
                <h4 className="text-[11px] md:text-sm font-bold truncate text-white">{currentSong.title}</h4>
                <p className="text-[9px] md:text-xs text-white/40 truncate hover:text-white cursor-pointer transition-colors" onClick={() => viewArtist(currentSong.uploaderName)}>{currentSong.uploaderName}</p>
              </div>
              <button 
                className={`ml-1 transition-colors ${likedSongs.some(s => s.id === currentSong.id) ? 'text-red-500' : 'text-white/20 hover:text-white'}`}
                onClick={() => toggleLikeSong(currentSong)}
              >
                <Heart size={14} className={likedSongs.some(s => s.id === currentSong.id) ? 'fill-current' : ''} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 md:w-14 md:h-14 bg-white/5 rounded-lg animate-pulse" />
              <div className="space-y-2">
                <div className="w-20 md:w-32 h-2.5 bg-white/5 rounded-full animate-pulse" />
                <div className="w-12 md:w-20 h-2 bg-white/5 rounded-full animate-pulse" />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-1.5 flex-1 md:w-1/3">
          <div className="flex items-center gap-4 md:gap-8">
            <button 
              onClick={toggleShuffle}
              className={`hidden md:block transition-colors ${isShuffle ? 'text-indigo-400' : 'text-white/20 hover:text-white'}`}
            >
              <Shuffle size={16} />
            </button>
            <button onClick={prevSong} className="text-white/40 hover:text-white transition-colors"><SkipBack size={18} className="fill-current" /></button>
            <button 
              onClick={togglePlay}
              className="w-9 h-9 md:w-11 md:h-11 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg shadow-white/10"
            >
              {isPlaying ? <Pause size={18} className="fill-black" /> : <Play size={18} className="fill-black ml-0.5" />}
            </button>
            <button onClick={nextSong} className="text-white/40 hover:text-white transition-colors"><SkipForward size={18} className="fill-current" /></button>
            <button 
              onClick={() => setIsRepeat(!isRepeat)}
              className={`hidden md:block transition-colors ${isRepeat ? 'text-indigo-400' : 'text-white/20 hover:text-white'}`}
            >
              <Repeat size={16} />
            </button>
          </div>
          
          <div className="w-full max-w-md flex items-center gap-2 px-2">
            <span className="text-[8px] md:text-[10px] text-white/30 w-7 text-right font-mono">{formatTime(currentTime)}</span>
            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden relative group cursor-pointer">
              <div 
                className="absolute inset-y-0 left-0 bg-white group-hover:bg-indigo-400 transition-all duration-300" 
                style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
              />
            </div>
            <span className="text-[8px] md:text-[10px] text-white/30 w-7 font-mono">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="hidden md:flex items-center justify-end gap-4 w-1/3">
          <button 
            onClick={() => {
              resetPlayer();
              showToast("Resetting player engine...", "info");
            }}
            className="text-white/40 hover:text-white transition-colors"
            title="Reset Player Engine"
          >
            <RefreshCw size={18} />
          </button>
          <button onClick={toggleMute} className="text-white/40 hover:text-white transition-colors">
            {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input 
            type="range" 
            min="0" max="100" 
            value={volume}
            onChange={handleVolumeChange}
            className="w-24 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white hover:accent-indigo-400 transition-all"
          />
        </div>
      </footer>

      {/* Player - Kept visible to prevent browser throttling */}
      <div 
        className={`fixed bottom-24 right-4 bg-black rounded-lg overflow-hidden shadow-2xl border border-white/10 z-[50] transition-all hover:scale-105 ${isMobile ? 'w-[140px] h-[80px]' : 'w-[200px] h-[112px]'}`}
      >
        <div id="player" className="w-full h-full"></div>
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

        {/* Replace Song Modal */}
        {replacingIndex !== null && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#181818] w-full max-w-lg rounded-3xl border border-white/10 overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-xl font-bold">Replace Song</h3>
                <button onClick={() => setReplacingIndex(null)} className="text-white/40 hover:text-white">
                  <X size={20} />
                </button>
              </div>
                <div className="p-6 space-y-6">
                  <form onSubmit={handleReplaceSearch} className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                      <input 
                        autoFocus
                        type="text"
                        value={replaceSearchQuery}
                        onChange={(e) => setReplaceSearchQuery(e.target.value)}
                        placeholder="Search for a song or artist..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#1DB954] transition-all"
                      />
                    </div>
                    <button 
                      type="submit"
                      className="bg-[#1DB954] text-white px-6 rounded-xl font-bold hover:scale-105 transition-transform"
                    >
                      Search
                    </button>
                  </form>

                <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-2">
                  {isReplaceSearching ? (
                    <div className="py-12 flex justify-center">
                      <RefreshCw className="animate-spin text-[#1DB954]" size={32} />
                    </div>
                  ) : replaceSearchResults.length > 0 ? (
                    replaceSearchResults.map((song) => (
                      <div 
                        key={song.id}
                        onClick={() => selectReplacement(song)}
                        className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 cursor-pointer transition-colors group"
                      >
                        <img src={song.thumbnail} className="w-12 h-12 rounded object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold truncate group-hover:text-[#1DB954] transition-colors">{song.title}</p>
                          <p className="text-xs text-white/60 truncate">{song.uploaderName}</p>
                        </div>
                        <Plus size={18} className="text-white/20 group-hover:text-white" />
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-white/20 text-sm italic">
                      {replaceSearchQuery ? "No results found." : "Search to find a replacement."}
                    </div>
                  )}
                </div>
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
      {/* Song Details Modal */}
      <AnimatePresence>
        {selectedSongDetails && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setSelectedSongDetails(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#181818] w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl border border-white/10"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative h-48 bg-gradient-to-br from-[#1DB954] to-black p-8 flex items-end gap-6">
                <button 
                  onClick={() => setSelectedSongDetails(null)}
                  className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
                <img src={selectedSongDetails.thumbnail} className="w-32 h-32 rounded-lg shadow-2xl object-cover" referrerPolicy="no-referrer" />
                <div>
                  <h2 className="text-3xl font-black mb-1">{selectedSongDetails.title}</h2>
                  <p className="text-white/60 font-bold hover:underline cursor-pointer" onClick={() => { setSelectedSongDetails(null); viewArtist(selectedSongDetails.uploaderName); }}>{selectedSongDetails.uploaderName}</p>
                </div>
              </div>

              <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Music className="text-[#1DB954]" size={48} />
                  <div className="text-center">
                    <h3 className="text-xl font-bold">{selectedSongDetails.title}</h3>
                    <p className="text-white/40">{selectedSongDetails.uploaderName}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white/5 border-t border-white/5 flex justify-end gap-3">
                <button 
                  onClick={() => { playSong(selectedSongDetails); setSelectedSongDetails(null); }}
                  className="bg-[#1DB954] text-white px-8 py-2 rounded-full font-bold hover:scale-105 transition-transform"
                >
                  Play Now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Nav */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 h-16 bg-black/95 backdrop-blur-xl border-t border-white/5 flex items-center justify-around z-[60] pb-safe">
          <button 
            onClick={() => setViewingSection('home')}
            className={`flex flex-col items-center gap-1 transition-all ${viewingSection === 'home' ? 'text-white scale-110' : 'text-white/40'}`}
          >
            <Home size={22} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">Home</span>
          </button>
          <button 
            onClick={() => setViewingSection('liked')}
            className={`flex flex-col items-center gap-1 transition-all ${viewingSection === 'liked' ? 'text-white scale-110' : 'text-white/40'}`}
          >
            <Heart size={22} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">Liked</span>
          </button>
          <button 
            onClick={() => setViewingSection('library')}
            className={`flex flex-col items-center gap-1 transition-all ${viewingSection === 'library' ? 'text-white scale-110' : 'text-white/40'}`}
          >
            <Library size={22} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">Library</span>
          </button>
          <button 
            onClick={() => setViewingSection('transfer')}
            className={`flex flex-col items-center gap-1 transition-all ${viewingSection === 'transfer' ? 'text-[#1DB954] scale-110' : 'text-white/40'}`}
          >
            <RefreshCw size={22} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">Transfer</span>
          </button>
        </nav>
      )}
      <AnimatePresence>
        {isAuthModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-bg-card w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-white/10 p-8"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-3xl font-black tracking-tighter">{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
                  <p className="text-white/40 text-sm mt-1">{authMode === 'login' ? 'Sign in to sync your library' : 'Join StudyStream today'}</p>
                </div>
                <button onClick={() => setIsAuthModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <button 
                  onClick={handleGoogleLogin}
                  disabled={isAuthLoading}
                  className="w-full bg-white text-black hover:bg-white/90 disabled:opacity-50 py-4 rounded-xl font-bold text-lg transition-all shadow-xl flex items-center justify-center gap-3"
                >
                  {isAuthLoading ? (
                    <RefreshCw className="animate-spin" />
                  ) : (
                    <>
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Continue with Google
                    </>
                  )}
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-bg-card px-2 text-white/20">Or continue with email</span>
                  </div>
                </div>

                <form onSubmit={handleEmailAuth} className="space-y-4">
                  {authError && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-xs">
                      <AlertTriangle size={16} />
                      {authError}
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-1">Email Address</label>
                    <input 
                      type="email" 
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                      placeholder="name@example.com"
                      value={authForm.email}
                      onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-1">Password</label>
                    <input 
                      type="password" 
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                      placeholder="••••••••"
                      value={authForm.password}
                      onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={isAuthLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 py-4 rounded-xl font-bold text-lg transition-all shadow-xl shadow-indigo-600/20 mt-4"
                  >
                    {isAuthLoading ? <RefreshCw className="animate-spin mx-auto" /> : (authMode === 'login' ? 'Sign In' : 'Create Account')}
                  </button>

                  <p className="text-center text-sm text-white/40 mt-6">
                    {authMode === 'login' ? "Don't have an account?" : "Already have an account?"}
                    <button 
                      type="button"
                      onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                      className="ml-2 text-indigo-400 font-bold hover:underline"
                    >
                      {authMode === 'login' ? 'Sign Up' : 'Sign In'}
                    </button>
                  </p>
                </form>
                
                <p className="text-center text-[10px] text-white/20 px-4">
                  By continuing, you agree to TuneTrail's Terms of Service and Privacy Policy.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Profile Modal */}
      <AnimatePresence>
        {isProfileModalOpen && user && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-bg-card w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-white/10 p-8"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-black tracking-tighter">Your Account</h2>
                <button onClick={() => setIsProfileModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="flex flex-col items-center gap-4 mb-8">
                <div className="w-24 h-24 rounded-full bg-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-600/20">
                  <User size={48} />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold">{user.displayName || user.email?.split('@')[0] || 'User'}</h3>
                  <p className="text-white/40 text-sm">{user.email}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="p-4 bg-white/5 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Heart size={18} className="text-red-500" />
                    <span className="text-sm font-medium">Liked Songs</span>
                  </div>
                  <span className="text-sm font-bold">{likedSongs.length}</span>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ListMusic size={18} className="text-indigo-400" />
                    <span className="text-sm font-medium">Playlists</span>
                  </div>
                  <span className="text-sm font-bold">{playlists.length}</span>
                </div>
              </div>

              <button 
                onClick={() => { logout(); setIsProfileModalOpen(false); }}
                className="w-full mt-8 py-4 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
              >
                <LogOut size={18} /> Sign Out
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
