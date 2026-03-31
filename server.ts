import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import ytSearch from "yt-search";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API route to proxy the search request
  app.get("/api/search", async (req, res) => {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    try {
      const searchResults = await ytSearch(query);
      const items = [
        ...searchResults.videos.slice(0, 10).map((v: any) => ({ type: 'video', id: v.videoId, title: v.title, thumbnail: v.thumbnail, uploaderName: v.author.name, duration: v.duration.timestamp })),
        ...searchResults.channels.slice(0, 5).map((c: any) => ({ type: 'channel', id: c.channelId, title: c.name, thumbnail: c.thumbnail, uploaderName: c.name, duration: '' })),
        ...searchResults.playlists.slice(0, 5).map((p: any) => ({ type: 'playlist', id: p.listId, title: p.title, thumbnail: p.thumbnail, uploaderName: p.author.name, duration: '' })),
      ];
      res.json({ items });
    } catch (err) {
      console.error("yt-search error:", err);
      res.json({ items: [] });
    }
  });

  // API route to get songs for an artist
  app.get("/api/artist/:name", async (req, res) => {
    const artistName = req.params.name;
    try {
      const searchResults = await ytSearch(`${artistName} songs`);
      const items = searchResults.videos.slice(0, 20).map((v: any) => ({
        id: v.videoId,
        title: v.title,
        thumbnail: v.thumbnail,
        uploaderName: v.author.name,
        duration: v.duration.timestamp,
      }));
      res.json({ items });
    } catch (err) {
      console.error("yt-search artist error:", err);
      res.json({ items: [] });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
