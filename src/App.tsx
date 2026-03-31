/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { Shuffle, Sun, Moon, X, Search, Play, Pause, SkipBack, SkipForward, Menu, Heart, Plus, Music, ListMusic } from 'lucide-react';

interface Song {
  id: string;
  title: string;
  thumbnail: string;
  uploaderName: string;
  duration: number;
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

export default function App() {
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [likedSongs, setLikedSongs] = useState<Song[]>(JSON.parse(localStorage.getItem('likedSongs') || '[]'));
  const [favoriteArtists, setFavoriteArtists] = useState<string[]>(JSON.parse(localStorage.getItem('favoriteArtists') || '[]'));
  const [playlists, setPlaylists] = useState<Playlist[]>(JSON.parse(localStorage.getItem('userPlaylists') || '[]'));
  const playerRef = useRef<any>(null);

  const viewLikedSongs = () => {
    setViewingSection('liked');
    setSelectedArtist(null);
    setSelectedPlaylist(null);
    setIsSearchOpen(false);
  };

  const clearQueue = () => {
    setPlaylist([]);
    setCurrentIndex(0);
  };

  useEffect(() => {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      playerRef.current = new window.YT.Player('player', {
        height: '100%', width: '100%',
        playerVars: { 'autoplay': 0, 'rel': 0 },
        events: { 'onStateChange': (e: any) => { if(e.data === 0) nextSong(); } }
      });
    };
  }, []);

  const shuffleQueue = (songs: Song[]) => {
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    setPlaylist(shuffled);
    setCurrentIndex(0);
    if (playerRef.current && shuffled.length > 0) {
        playerRef.current.loadVideoById(shuffled[0].id);
        setIsPlaying(true);
    }
  };

  useEffect(() => {
    localStorage.setItem('unlimitedPlaylist', JSON.stringify(playlist));
    localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
    localStorage.setItem('favoriteArtists', JSON.stringify(favoriteArtists));
    localStorage.setItem('userPlaylists', JSON.stringify(playlists));
  }, [playlist, likedSongs, favoriteArtists, playlists]);

  const searchMusic = async () => {
    if (!searchQuery) return;
    setIsSearchOpen(true);
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
        albums: [] // Placeholder
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

  const viewPlaylist = (playlist: Playlist) => {
    setViewingSection('playlist');
    setSelectedPlaylist(playlist);
    setSelectedArtist(null);
    setIsSearchOpen(false);
  };

  const toggleFavoriteArtist = (artist: string) => {
    setFavoriteArtists(prev => prev.includes(artist) ? prev.filter(a => a !== artist) : [...prev, artist]);
  };

  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

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
  };

  const [isPlaying, setIsPlaying] = useState(false);

  const playSong = (i: number) => {
    setCurrentIndex(i);
    if (playerRef.current) {
        playerRef.current.loadVideoById(playlist[i].id);
        setIsPlaying(true);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
        playerRef.current?.pauseVideo();
        setIsPlaying(false);
    } else {
        playerRef.current?.playVideo();
        setIsPlaying(true);
    }
  };

  const prevSong = () => {
    const newIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    playSong(newIndex);
  };
  
  const nextSong = () => {
    const newIndex = (currentIndex + 1) % playlist.length;
    playSong(newIndex);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans">
      <div className="flex">
        {isSidebarOpen && (
          <aside className="w-72 bg-[#0a0a0a] border-r border-[#1a1a1a] h-screen p-6 flex flex-col gap-8">
            <h1 className="text-2xl font-light tracking-widest text-white/90">VIBESTREAM</h1>
            <nav className="flex flex-col gap-4">
              <h3 className="text-xs uppercase tracking-widest text-white/40">Library</h3>
              <div className="flex items-center gap-3 text-sm text-white/70 hover:text-white cursor-pointer" onClick={viewLikedSongs}><Heart size={16}/> Liked Songs</div>
              <div className="flex items-center gap-3 text-sm text-white/70 hover:text-white cursor-pointer" onClick={() => setIsQueueVisible(!isQueueVisible)}><ListMusic size={16}/> Queue</div>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mt-4">Artists</h3>
              {favoriteArtists.map(artist => <div key={artist} className="text-sm text-white/70 hover:text-white cursor-pointer" onClick={() => viewArtist(artist)}>{artist}</div>)}
              <h3 className="text-xs uppercase tracking-widest text-white/40 mt-4 flex justify-between">Playlists <Plus size={16} className="cursor-pointer" onClick={() => setIsCreatePlaylistOpen(true)}/></h3>
              {playlists.map(pl => <div key={pl.name} className="flex items-center gap-3 text-sm text-white/70 hover:text-white cursor-pointer" onClick={() => viewPlaylist(pl)}><Music size={16}/> {pl.name}</div>)}
            </nav>
          </aside>
        )}
        
        {isCreatePlaylistOpen && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
            <div className="bg-[#1a1a1a] p-8 rounded-2xl w-96">
              <h2 className="text-xl mb-4">Create Playlist</h2>
              <input 
                className="w-full p-3 rounded-lg bg-[#0a0a0a] border border-[#333] mb-4"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Playlist name"
              />
              <div className="flex justify-end gap-4">
                <button onClick={() => setIsCreatePlaylistOpen(false)} className="text-white/50">Cancel</button>
                <button onClick={createPlaylist} className="bg-white text-black px-4 py-2 rounded-full">Create</button>
              </div>
            </div>
          </div>
        )}
        
        <main className="flex-1 p-8">
          <header className="flex justify-between items-center mb-10">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-white/70 hover:text-white"><Menu /></button>
            <div className="relative w-full max-w-lg mx-4">
              <input 
                className="w-full p-4 rounded-full bg-[#1a1a1a] border border-[#333] outline-none focus:border-white/50 transition"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchMusic()}
                placeholder="Search songs, artists, albums, or playlists..."
              />
              <button className="absolute right-2 top-2 p-2 rounded-full bg-white text-black" onClick={searchMusic}><Search size={20}/></button>
            </div>
            <button className="p-2 rounded-full bg-[#1a1a1a]" onClick={() => setIsDarkMode(!isDarkMode)}>{isDarkMode ? <Sun size={20}/> : <Moon size={20}/>}</button>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-3">
              <div className="flex justify-center gap-6 p-6 mt-6 bg-[#0a0a0a] rounded-full border border-[#1a1a1a]">
                <button onClick={prevSong}><SkipBack /></button>
                <button onClick={togglePlay}>{isPlaying ? <Pause /> : <Play />}</button>
                <button onClick={nextSong}><SkipForward /></button>
              </div>
            </div>
          </div>
          
          {isQueueVisible && (
            <div className="fixed top-20 right-8 w-80 bg-[#0a0a0a] rounded-2xl p-6 border border-[#1a1a1a] z-50">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-light text-lg tracking-wide">Queue</h3>
                <button onClick={clearQueue} className="text-xs text-white/50 hover:text-white">Clear</button>
              </div>
              {playlist.map((song, i) => (
                <div key={i} className={`flex justify-between p-3 rounded-lg cursor-pointer transition ${i === currentIndex ? 'bg-[#1a1a1a]' : 'hover:bg-[#1a1a1a]/50'}`}>
                  <span onClick={() => playSong(i)} className="text-sm">{song.title.substring(0, 25)}...</span>
                  <span className="text-white/30 cursor-pointer" onClick={() => setPlaylist(prev => prev.filter((_, idx) => idx !== i))}><X size={16}/></span>
                </div>
              ))}
            </div>
          )}
          
          <div className="fixed bottom-8 right-8 w-64 aspect-video bg-[#0a0a0a] rounded-2xl overflow-hidden shadow-2xl border border-[#1a1a1a] z-50">
            <div id="player"></div>
          </div>
          
          {viewingSection === 'liked' && (
             <div className="fixed inset-0 bg-[#050505] p-8 z-50 overflow-y-auto">
              <button onClick={() => setViewingSection('home')} className="mb-4 text-white/70 hover:text-white">← Back</button>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-4xl font-bold">Liked Songs</h2>
                <button className="bg-white text-black px-6 py-2 rounded-full" onClick={() => shuffleQueue(likedSongs)}>Shuffle</button>
              </div>
              {likedSongs.map(song => (
                <div key={song.id} className="flex justify-between p-4 cursor-pointer hover:bg-[#1a1a1a] rounded-lg" onClick={() => { setPlaylist([song]); playSong(0); }}>
                  <span>{song.title}</span>
                </div>
              ))}
            </div>
          )}

          {isSearchOpen && (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              {['songs', 'artists', 'albums', 'playlists'].map(category => (
                <div key={category} className="bg-[#0a0a0a] p-6 rounded-2xl border border-[#1a1a1a]">
                  <h3 className="font-light text-lg mb-4 capitalize">{category}</h3>
                  {searchResults[category as keyof typeof searchResults].map((item: any) => (
                    <div key={item.id} className="flex justify-between items-center p-3 hover:bg-[#1a1a1a] rounded-lg cursor-pointer">
                      <div className="flex items-center gap-4" onClick={() => {
                          if (category === 'songs') setPlaylist([...playlist, item]);
                          else if (category === 'artists') viewArtist(item.uploaderName);
                      }}>
                        <img src={item.thumbnail} className="w-12 h-12 rounded-lg" />
                        <div>
                          <div className="text-sm">{item.title}</div>
                          <div className="text-xs text-white/50">{item.uploaderName}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {category === 'songs' && (
                          <button onClick={() => toggleLikeSong(item)}><Heart size={16} className={likedSongs.some(s => s.id === item.id) ? 'fill-red-500 text-red-500' : ''}/></button>
                        )}
                        {category === 'artists' && (
                          <button onClick={() => toggleFavoriteArtist(item.uploaderName)}><Heart size={16} className={favoriteArtists.includes(item.uploaderName) ? 'fill-red-500 text-red-500' : ''}/></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {viewingSection === 'artist' && selectedArtist && (
             <div className="mt-8 bg-[#0a0a0a] p-6 rounded-2xl border border-[#1a1a1a]">
              <h2 className="text-2xl font-bold mb-4">{selectedArtist}</h2>
              {artistSongs.map(song => (
                <div key={song.id} className="flex justify-between p-2 cursor-pointer hover:bg-[#333]" onClick={() => setPlaylist([...playlist, song])}>
                  <span>{song.title}</span>
                </div>
              ))}
            </div>
          )}
          
          {viewingSection === 'playlist' && selectedPlaylist && (
             <div className="fixed inset-0 bg-[#050505] p-8 z-50 overflow-y-auto">
              <button onClick={() => setViewingSection('home')} className="mb-4 text-white/70 hover:text-white">← Back</button>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-4xl font-bold">{selectedPlaylist.name}</h2>
                <div className="flex gap-4">
                  <button className="text-sm bg-[#1a1a1a] text-white px-4 py-2 rounded-full" onClick={() => {
                      setViewingSection('home');
                      setIsSearchOpen(true);
                  }}>Add more songs</button>
                  <button className="bg-white text-black px-6 py-2 rounded-full" onClick={() => shuffleQueue(selectedPlaylist.songs)}>Shuffle</button>
                </div>
              </div>
              {selectedPlaylist.songs.map((song, i) => (
                <div key={i} className="flex justify-between p-4 cursor-pointer hover:bg-[#1a1a1a] rounded-lg" onClick={() => { setPlaylist([song]); playSong(0); }}>
                  <span>{song.title}</span>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
