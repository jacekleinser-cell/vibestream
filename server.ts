import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import ytSearchModule from "yt-search";
const ytSearch = (ytSearchModule as any).default || ytSearchModule;
import cookieParser from "cookie-parser";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());
  app.use(cookieParser());

  // Spotify OAuth Config
  const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID?.trim();
  const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  
  const getRedirectUri = () => {
    const normalizedAppUrl = process.env.APP_URL?.trim()?.replace(/\/$/, "");
    return normalizedAppUrl 
      ? `${normalizedAppUrl}/api/auth/spotify/callback` 
      : `http://localhost:3000/api/auth/spotify/callback`;
  };

  // Spotify Client Credentials Flow (for public data without user login)
  let systemToken: string | null = null;
  let systemTokenExpiry = 0;

  const getSystemToken = async () => {
    if (systemToken && Date.now() < systemTokenExpiry) {
      return systemToken;
    }

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      throw new Error("Spotify credentials missing in app settings.");
    }

    try {
      console.log("Spotify: Fetching system token (Client Credentials)...");
      const response = await axios.post("https://accounts.spotify.com/api/token", 
        new URLSearchParams({ grant_type: "client_credentials" }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
          },
          timeout: 10000
        }
      );
      systemToken = response.data.access_token;
      systemTokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
      return systemToken;
    } catch (err: any) {
      if (err.response?.status === 403) {
        throw new Error("Spotify API Error: Access Forbidden (403). This usually means the owner of the Spotify Developer App lacks a Premium subscription, which is now required for API access.");
      }
      const errorDetail = err.response?.data;
      const message = typeof errorDetail === 'object' ? (errorDetail.error?.message || errorDetail.error_description || JSON.stringify(errorDetail)) : (errorDetail || err.message);
      console.error("Spotify System Token Error:", message);
      throw new Error(`Spotify Token Error: ${message}`);
    }
  };

  // API route to get current config (for debugging)
  app.get("/api/config", (req, res) => {
    res.json({
      spotifyClientId: SPOTIFY_CLIENT_ID ? "Set" : "Missing",
      spotifyClientSecret: SPOTIFY_CLIENT_SECRET ? "Set" : "Missing",
      appUrl: process.env.APP_URL || "Not set",
      redirectUri: getRedirectUri(),
      nodeEnv: process.env.NODE_ENV || "development"
    });
  });

  // API route to clear session
  app.get("/api/auth/spotify/logout", (req, res) => {
    res.clearCookie("spotify_access_token");
    res.json({ success: true });
  });

  // API route to get Spotify Auth URL
  app.get("/api/auth/spotify", (req, res) => {
    // Ensure we always return JSON
    res.setHeader('Content-Type', 'application/json');

    if (!SPOTIFY_CLIENT_ID) {
      console.error("Spotify Auth Error: SPOTIFY_CLIENT_ID is missing.");
      return res.status(500).json({ error: "Spotify Client ID is missing. Please add it to the app Settings (gear icon)." });
    }

    const scope = "user-library-read playlist-read-private";
    const redirectUri = getRedirectUri();
    
    console.log("Spotify Redirect URI being used:", redirectUri);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: SPOTIFY_CLIENT_ID || "",
      scope: scope,
      redirect_uri: redirectUri,
    });
    res.json({ url: `https://accounts.spotify.com/authorize?${params.toString()}` });
  });

  // Spotify Auth Callback
  app.get(["/api/auth/spotify/callback", "/api/auth/spotify/callback/"], async (req, res) => {
    const code = req.query.code as string;
    if (!code) return res.status(400).send("No code provided");

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      console.error("Spotify Callback Error: Client ID or Secret is missing.");
      return res.status(500).send("Spotify keys are missing. Please add them in the app Settings.");
    }

    try {
      console.log("Spotify Auth: Exchanging code for token using Axios...");
      const response = await axios.post("https://accounts.spotify.com/api/token", 
        new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          redirect_uri: getRedirectUri(),
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
          },
          timeout: 10000
        }
      );

      const data = response.data;
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
    
    console.log("Spotify Fetch: Request received");
    console.log("Spotify Fetch: Client ID present:", !!SPOTIFY_CLIENT_ID);
    console.log("Spotify Fetch: Client Secret present:", !!SPOTIFY_CLIENT_SECRET);

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      console.error("Spotify Config Error: Client ID or Secret is missing.");
      return res.status(500).json({ error: "Spotify keys are missing. Please add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to the app Settings (gear icon)." });
    }

    if (!token) {
      console.log("Spotify Fetch: No token found in cookies");
      return res.status(401).json({ error: "Not authenticated with Spotify" });
    }

    try {
      console.log("Spotify Fetch: Fetching playlists using Axios...");
      const response = await axios.get("https://api.spotify.com/v1/me/playlists", {
        params: { limit: 50 },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      });
      
      const data = response.data;
      console.log(`Spotify Fetch: Successfully loaded ${data.items?.length || 0} playlists`);
      res.json(data);
    } catch (err: any) {
      if (err.response) {
        console.error("Spotify API Error (Playlists):", err.response.status, err.response.data);
        
        let errorData = err.response.data;
        if (typeof errorData === 'string' && (errorData.includes('<html') || errorData.includes('<!DOCTYPE'))) {
          errorData = { error: { message: "Spotify API returned an HTML error page. This often happens with 403 Forbidden errors when Premium is required for the app owner." } };
        }
        
        const message = typeof errorData === 'object' ? (errorData.error?.message || errorData.message || JSON.stringify(errorData)) : errorData;
        if (message.includes("premium subscription")) {
          return res.status(403).json({ error: { message: "Spotify API Error: An active Premium subscription is required for the owner of the Spotify Developer App to use this feature." } });
        }
          
        return res.status(err.response.status).json(errorData);
      }
      console.error("Spotify Fetch Exception (Playlists):", err.message);
      res.status(500).json({ 
        error: { message: "Failed to fetch Spotify playlists", details: err.message }
      });
    }
  });

  // API route to get a single Spotify Playlist by ID
  app.get("/api/spotify/playlists/:id", async (req, res) => {
    let token = req.cookies.spotify_access_token;
    const playlistId = req.params.id;

    try {
      if (!token) {
        console.log("Spotify: No user token, attempting system token for manual import...");
        token = await getSystemToken();
      }

      console.log(`Spotify Fetch: Fetching playlist ${playlistId} using Axios...`);
      const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      });
      
      res.json(response.data);
    } catch (err: any) {
      if (err.response) {
        console.error("Spotify API Error (Single Playlist):", err.response.status, err.response.data);
        
        let errorData = err.response.data;
        if (typeof errorData === 'string' && (errorData.includes('<html') || errorData.includes('<!DOCTYPE'))) {
          errorData = { error: { message: "Spotify API returned an HTML error page. This often happens with 403 Forbidden errors when Premium is required for the app owner." } };
        }
        
        const message = typeof errorData === 'object' ? (errorData.error?.message || errorData.message || JSON.stringify(errorData)) : errorData;
        if (message.includes("premium subscription")) {
          return res.status(403).json({ error: { message: "Spotify API Error: An active Premium subscription is required for the owner of the Spotify Developer App to use this feature." } });
        }
        
        return res.status(err.response.status).json(errorData);
      }
      res.status(500).json({ error: { message: err.message } });
    }
  });

  // API route to get Spotify Tracks from a playlist
  app.get("/api/spotify/playlists/:id/tracks", async (req, res) => {
    let token = req.cookies.spotify_access_token;
    const playlistId = req.params.id;
    const { limit = 100, offset = 0 } = req.query;

    try {
      if (!token) {
        token = await getSystemToken();
      }

      console.log(`Spotify Fetch: Fetching tracks for playlist ${playlistId} (offset: ${offset}, limit: ${limit}) using Axios...`);
      const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        params: { limit, offset },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      });
      
      const data = response.data;
      console.log(`Spotify Fetch: Successfully loaded ${data.items?.length || 0} tracks`);
      res.json(data);
    } catch (err: any) {
      if (err.response) {
        console.error("Spotify API Error (Tracks):", err.response.status, err.response.data);
        
        let errorData = err.response.data;
        if (typeof errorData === 'string' && (errorData.includes('<html') || errorData.includes('<!DOCTYPE'))) {
          errorData = { error: { message: "Spotify API returned an HTML error page. This often happens with 403 Forbidden errors when Premium is required for the app owner." } };
        }
        
        const message = typeof errorData === 'object' ? (errorData.error?.message || errorData.message || JSON.stringify(errorData)) : errorData;
        if (message.includes("premium subscription")) {
          return res.status(403).json({ error: { message: "Spotify API Error: An active Premium subscription is required for the owner of the Spotify Developer App to use this feature." } });
        }
        
        return res.status(err.response.status).json(errorData);
      }
      console.error("Spotify Fetch Exception (Tracks):", err.message);
      res.status(500).json({ error: { message: "Failed to fetch Spotify tracks", details: err.message } });
    }
  });

  // API route to proxy the search request
  app.get("/api/search", async (req, res) => {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    try {
      console.log(`YouTube Search: Searching for "${query}"...`);
      const searchResults = await ytSearch(query);
      
      // Filter and sort videos
      const filteredVideos = searchResults.videos
        .filter((v: any) => {
          // Filter out short videos (less than 60 seconds) to avoid YouTube Shorts
          return v.duration.seconds >= 60;
        })
        .sort((a: any, b: any) => {
          // Prioritize official artist channels or "Topic" channels
          const aIsOfficial = a.author.name.toLowerCase().includes('topic') || a.author.name.toLowerCase().includes('official');
          const bIsOfficial = b.author.name.toLowerCase().includes('topic') || b.author.name.toLowerCase().includes('official');
          
          if (aIsOfficial && !bIsOfficial) return -1;
          if (!aIsOfficial && bIsOfficial) return 1;
          return 0;
        });

      const items = [
        ...filteredVideos.slice(0, 15).map((v: any) => ({ 
          type: 'video', 
          id: v.videoId, 
          title: v.title, 
          thumbnail: v.thumbnail, 
          uploaderName: v.author.name, 
          duration: v.duration.timestamp 
        })),
        ...searchResults.channels.slice(0, 5).map((c: any) => ({ type: 'channel', id: c.channelId, title: c.name, thumbnail: c.thumbnail, uploaderName: c.name, duration: '' })),
        ...searchResults.playlists.slice(0, 5).map((p: any) => ({ type: 'playlist', id: p.listId, title: p.title, thumbnail: p.thumbnail, uploaderName: p.author.name, duration: '' })),
      ];
      res.json({ items });
    } catch (err) {
      console.error("yt-search error:", err);
      res.json({ items: [] });
    }
  });

  // API route to get songs for a YouTube playlist
  app.get("/api/playlist/:id", async (req, res) => {
    const playlistId = req.params.id;
    try {
      console.log(`YouTube Search: Fetching tracks for playlist "${playlistId}"...`);
      // @ts-ignore
      const searchResults = await ytSearch({ listId: playlistId });
      const items = (searchResults.videos || []).map((v: any) => ({
        id: v.videoId,
        title: v.title,
        thumbnail: v.thumbnail,
        uploaderName: v.author?.name || 'Unknown',
        duration: v.duration?.timestamp || '',
      }));
      res.json({ items });
    } catch (err) {
      console.error("yt-search playlist error:", err);
      res.json({ items: [] });
    }
  });

  // API route to get songs for an artist
  app.get("/api/artist", async (req, res) => {
    const artistName = req.query.name as string;
    if (!artistName) {
      return res.status(400).json({ error: "Artist name is required" });
    }
    try {
      console.log(`YouTube Search: Fetching songs for artist "${artistName}"...`);
      const searchResults = await ytSearch(`${artistName} songs`);
      
      if (!searchResults || !searchResults.videos) {
        return res.json({ items: [] });
      }

      const items = searchResults.videos.slice(0, 20).map((v: any) => ({
        id: v.videoId,
        title: v.title,
        thumbnail: v.thumbnail,
        uploaderName: v.author?.name || artistName,
        duration: v.duration?.timestamp || '',
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

  // Global error handler to ensure JSON responses
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global Error Handler:", err);
    res.status(err.status || 500).json({
      error: "Internal Server Error",
      message: err.message || "An unexpected error occurred",
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Please ensure no other processes are running on this port.`);
    } else {
      console.error("Server error:", err);
    }
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
