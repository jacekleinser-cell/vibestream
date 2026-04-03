import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import ytSearch from "yt-search";
import cookieParser from "cookie-parser";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // Spotify OAuth Config
  const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
  const REDIRECT_URI = process.env.APP_URL ? `${process.env.APP_URL}/api/auth/spotify/callback` : `http://localhost:3000/api/auth/spotify/callback`;

  // API route to get Spotify Auth URL
  app.get("/api/auth/spotify", (req, res) => {
    const scope = "user-library-read playlist-read-private";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: SPOTIFY_CLIENT_ID || "",
      scope: scope,
      redirect_uri: REDIRECT_URI,
    });
    res.json({ url: `https://accounts.spotify.com/authorize?${params.toString()}` });
  });

  // Spotify Auth Callback
  app.get(["/api/auth/spotify/callback", "/api/auth/spotify/callback/"], async (req, res) => {
    const code = req.query.code as string;
    if (!code) return res.status(400).send("No code provided");

    try {
      const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error_description || data.error);

      // Store tokens in cookies (SameSite=None, Secure=true for iframe)
      res.cookie("spotify_access_token", data.access_token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: data.expires_in * 1000,
      });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'SPOTIFY_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error("Spotify auth error:", err);
      res.status(500).send(`Authentication failed: ${err.message}`);
    }
  });

  // API route to get Spotify Playlists
  app.get("/api/spotify/playlists", async (req, res) => {
    const token = req.cookies.spotify_access_token;
    if (!token) return res.status(401).json({ error: "Not authenticated with Spotify" });

    try {
      const response = await fetch("https://api.spotify.com/v1/me/playlists", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch Spotify playlists" });
    }
  });

  // API route to get Spotify Tracks from a playlist
  app.get("/api/spotify/playlists/:id/tracks", async (req, res) => {
    const token = req.cookies.spotify_access_token;
    const playlistId = req.params.id;
    if (!token) return res.status(401).json({ error: "Not authenticated with Spotify" });

    try {
      const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch Spotify tracks" });
    }
  });

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
