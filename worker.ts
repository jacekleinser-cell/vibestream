import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('/*', cors());

// API route to proxy the search request to Deezer
app.get('/api/search', async (c) => {
  const query = c.req.query('q');
  if (!query) {
    return c.json({ error: "Query parameter 'q' is required" }, 400);
  }
  
  try {
    const response = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    
    const items = data.data.slice(0, 20).map((v: any) => ({
      type: 'video', // Keeping 'video' type for compatibility with App.tsx
      id: v.id,
      title: v.title,
      thumbnail: v.album.cover_medium,
      uploaderName: v.artist.name,
      duration: v.duration, // Deezer returns duration in seconds
    }));
    
    return c.json({ items });
  } catch (err) {
    console.error("Deezer search error:", err);
    return c.json({ items: [] });
  }
});

// API route to get songs for an artist
app.get('/api/artist/:name', async (c) => {
  const artistName = c.req.param('name');
  
  try {
    // 1. Search for the artist to get their ID
    const searchResponse = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}`);
    const searchData = await searchResponse.json();
    
    if (searchData.data.length === 0) {
      return c.json({ items: [] });
    }
    
    const artistId = searchData.data[0].id;
    
    // 2. Get top tracks for that artist
    const tracksResponse = await fetch(`https://api.deezer.com/artist/${artistId}/top`);
    const tracksData = await tracksResponse.json();
    
    const items = tracksData.data.map((v: any) => ({
      id: v.id,
      title: v.title,
      thumbnail: v.album.cover_medium,
      uploaderName: v.artist.name,
      duration: v.duration,
    }));
    
    return c.json({ items });
  } catch (err) {
    console.error("Deezer artist error:", err);
    return c.json({ items: [] });
  }
});

export default app;
