# Louis! A Yoto Make Your Own (MYO) client backed by YouTube

Logo

Search YouTube, arrange a playlist, and save it to [Yoto](https://yotoplay.com/). Linking a physical **Make Your Own (MYO)** card happens in the Yoto app, not here.

Self-hosted **Nuxt** server app. Yoto OAuth token exchange and YouTube audio download (via yt-dlp) need a long-running server process, so a static export (Netlify/Vercel static, GitHub Pages, etc.) cannot power those flows.

[https://github.com/user-attachments/assets/6083e578-a0ba-4047-8d44-d2c4efad511d](https://github.com/user-attachments/assets/6083e578-a0ba-4047-8d44-d2c4efad511d)

[Self-host](#self-host) · [Home Assistant](#home-assistant) · [Download (desktop)](#download-desktop) · [Native development](#native-development) · [Contributing](CONTRIBUTING.md) · [Releases](docs/RELEASE.md) · [Desktop](docs/DESKTOP.md)

**Personal use only.** You are responsible for complying with [YouTube’s Terms of Service](https://www.youtube.com/t/terms) and applicable law when downloading audio.

## Features

- Search YouTube and preview audio — **YouTube Data API** when configured (faster typed search, optional content filtering), otherwise bundled **yt-dlp**. Paste a video, Shorts, playlist, or channel URL in Search to load it; check rows to add them together
- Browse your Yoto playlists. **New** names a playlist and creates it on Yoto right away (empty, or with tracks already picked in Search)
- Drag-and-drop playlist editing (desktop); phone Search / Library flow with Add to playlist
- Rename, replace artwork, or delete a loaded playlist from the playlist menu
- Save / Update to Yoto with download and transcode progress; optional normalize for new YouTube extracts
- Per-track 16×16 art (Yoto icon library, [yotoicons.com](https://yotoicons.com/), or draw)
- Optional **desktop app** (macOS / Windows) — same app, no Docker required



## Download (desktop)

Installers ship as **Assets** on each GitHub Release (same `vX.Y.Z` as Docker):

**[Latest release](https://github.com/stuartromanek/louis/releases/latest)**


| Platform            | Asset                       |
| ------------------- | --------------------------- |
| macOS Apple Silicon | `Louis-<version>-arm64.dmg` |
| macOS Intel         | `Louis-<version>-x64.dmg`   |
| Windows             | `Louis-Setup-<version>.exe` |


After install, the setup wizard asks for a Yoto client ID, then a **recommended** YouTube Data API key (Skip uses bundled yt-dlp). Prefer **Use default client** for Yoto, or bring your own from [yoto.dev](https://yoto.dev/get-started/start-here/) with redirect `http://127.0.0.1:4010/api/yoto/auth/callback`. Change keys later in **Settings → Advanced**. Details: [docs/DESKTOP.md](docs/DESKTOP.md).

Installers are currently **unsigned** (Gatekeeper / SmartScreen may warn). Signing notes: [docs/DESKTOP_SIGNING.md](docs/DESKTOP_SIGNING.md).

## Docker (same version)

Self-host the **same** release via Docker Hub or GHCR:

```bash
docker pull stuartromanek/louis:latest
# or pin: stuartromanek/louis:vX.Y.Z
```

Equivalent on GHCR: `ghcr.io/stuartromanek/louis:latest` (and `:vX.Y.Z`). Images are multi-arch (`linux/amd64` + `linux/arm64`) on each `v*` release.

> Docker Hub anonymous pull rate limits can apply on busy hosts; GHCR is an equivalent fallback with the same tags.

Compose / env setup below. Cut releases: [docs/RELEASE.md](docs/RELEASE.md).

**Portainer:** Stacks → Add stack → **Web editor** (not Git repository). Paste [`docker-compose.yml`](docker-compose.yml), set `LOUIS_YOTO_CLIENT_ID` in the stack environment UI. `LOUIS_YOUTUBE_API_KEY` is recommended (faster search, `safeSearch=moderate`); leave unset to search with bundled yt-dlp. Then deploy. Open Louis at the **NAS/host URL other devices use** (`http://192.168.x.x:4000` or a hostname) — never the host’s `localhost` from another device. Register that same origin’s `/api/yoto/auth/callback` on [yoto.dev](https://yoto.dev/get-started/start-here/). Image default is `LOUIS_COOKIE_SECURE=false` (LAN HTTP); set `true` only behind HTTPS.

## Home Assistant

Install Louis from Supervisor as a custom add-on (wraps the same GHCR image; options map to `LOUIS_*`; audio under `/data/audio`; UI on host port **4000**, not ingress).

1. **Settings → Add-ons → Add-on store → ⋮ → Repositories** → add `https://github.com/stuartromanek/louis`
2. Install **Louis**, confirm **yoto_redirect_uri** matches [yoto.dev](https://yoto.dev/get-started/start-here/). **youtube_api_key** is recommended (Data API search); leave empty to search with bundled yt-dlp. **youtube_safe_search** (`none` / `moderate` / `strict`) applies to typed search only when a key is set.
3. Open `http://homeassistant.local:4000` (or your host:port)

Full options, redirect URI, and `cookie_secure` notes: [homeassistant/louis/DOCS.md](homeassistant/louis/DOCS.md). Sources live under `homeassistant/`; root `repository.yaml` + `louis/` symlinks are for Supervisor discovery.

## Quick start (Docker)

Docker includes Node, yt-dlp, and ffmpeg — you only need Docker and a Yoto client ID.

```bash
git clone https://github.com/stuartromanek/louis.git
cd louis
cp .env.example .env
# Fill in LOUIS_YOTO_CLIENT_ID (recommended: LOUIS_YOUTUBE_API_KEY — see below)
docker compose up -d --build
```

Open Louis at the same origin other devices will use (this machine: [http://localhost:4000](http://localhost:4000); phones/tablets: `http://<host-ip-or-name>:4000`). Health: `GET /api/health`.

## Self-host



### 1. Yoto developer portal

Create a **public** client at [yoto.dev](https://yoto.dev/get-started/start-here/):


| Setting                  | Value                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------- |
| Redirect URI (self-host) | `https://your-domain/api/yoto/auth/callback`                                       |
| LAN / Portainer          | `http://<host-ip-or-name>:4000/api/yoto/auth/callback` — same origin you open Louis |
| Local redirect           | `http://localhost:4000/api/yoto/auth/callback`                                     |
| Desktop app redirect     | `http://127.0.0.1:4010/api/yoto/auth/callback` — see [DESKTOP.md](docs/DESKTOP.md) |
| Scopes                   | `offline_access user:content:view user:content:manage user:icons:manage`           |


You only need `LOUIS_YOTO_CLIENT_ID`. Leave `LOUIS_YOTO_CLIENT_SECRET` empty for PKCE.

### 2. YouTube API (recommended)

A YouTube Data API v3 key is **recommended** for faster search and `safeSearch=moderate` on typed search. Enable the API in Google Cloud Console and create a key.

Search still works without a key (bundled yt-dlp): slower, no safeSearch, and search can break on a different week than download. Leave `LOUIS_YOUTUBE_API_KEY` unset to use that path.

### 3. Environment

Copy `[.env.example](.env.example)`. Use `LOUIS_*` **names** so the same file works for local dev, `docker compose`, and `docker run --env-file .env` without rebuilding the image. Legacy `NUXT_*` / `NUXT_PUBLIC_*` names still work as a deprecated fallback (`LOUIS_*` wins when both are set).

#### Required


| Variable               | Notes            |
| ---------------------- | ---------------- |
| `LOUIS_YOTO_CLIENT_ID` | Public client ID |




#### Yoto


| Variable                   | Notes                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOUIS_YOTO_CLIENT_SECRET` | Leave empty for PKCE                                                                                                                                                                                  |
| `LOUIS_YOTO_REDIRECT_URI`  | Optional pin; must match the portal. Unset: Louis uses the Host the browser actually used. Prefer a hostname over a DHCP IP. Other devices cannot use the Docker host’s localhost                    |
| `LOUIS_COOKIE_SECURE`      | OAuth cookie `Secure` flag. Docker image defaults `false` (LAN HTTP). Node-without-Docker: when unset, secure iff `NODE_ENV=production`. Set `true` behind HTTPS                                      |




#### YouTube / audio


| Variable                      | Notes                                                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOUIS_YOUTUBE_API_KEY`       | Recommended. YouTube Data API v3 (faster typed search). Unset: search without a key                                                                                                                     |
| `LOUIS_YOUTUBE_SAFE_SEARCH`   | Typed-search content filtering when a Data API key is set: `none`, `moderate` (default), or `strict`. Desktop: **Settings → Advanced**; HA: **youtube_safe_search** option                                                                                               |
| `LOUIS_AUDIO_WORK_DIR`         | Default `/data/audio` in Docker                                                                                                                                                                           |
| `LOUIS_AUDIO_JOB_MAX_AGE_MS`   | Stale `jobs/` cleanup (default 1h)                                                                                                                                                                        |
| `LOUIS_AUDIO_CACHE_MAX_AGE_MS` | Cache file TTL (default 14d)                                                                                                                                                                              |
| `LOUIS_AUDIO_CACHE_MAX_BYTES`  | Combined preview + save cache cap (default 5 GiB)                                                                                                                                                         |
| `LOUIS_YTDLP_PATH`             | Optional pin. Docker ships yt-dlp on `PATH`; Settings → Advanced can install a newer nightly into the audio volume / desktop app data (preferred when its version is newer) |
| `LOUIS_YTDLP_COOKIES_FILE`     | Optional Netscape `cookies.txt`. Downloads try anonymously first; cookies are used only if YouTube blocks with bot check, hard 403, or age-gate. Prefer a throwaway Google account; never commit the file |




#### Advanced / debug


| Variable                    | Notes                           |
| --------------------------- | ------------------------------- |
| `LOUIS_ENABLE_DEBUG_ROUTES` | `true` enables debug API routes |


```bash
docker run -p 4000:4000 --env-file .env louis:local
```



### 4. Deploy constraints

- **Single instance** — save-job progress is in memory
- **HTTPS in production** — Docker image defaults OAuth cookies to `LOUIS_COOKIE_SECURE=false` (LAN HTTP). Node-without-Docker defaults to `secure` when `NODE_ENV=production`. Set `true` behind TLS / reverse proxy; keep `false` for plain HTTP (Portainer LAN, Home Assistant)
- **Persistent disk** — recommended for the audio cache under `LOUIS_AUDIO_WORK_DIR` (`cache/preview/`, `cache/save/`). Stale `jobs/` dirs and old cache files are swept on startup and after downloads. Compose uses the named volume `louis-audio`



## Native development

For local Node (without Docker), install these first:

- Node.js 22+ (also used as yt-dlp’s JS runtime for YouTube signing)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — required for search (without a Data API key) and for save; keep it current
- [ffmpeg](https://ffmpeg.org/) — required for save
- Optional: `LOUIS_YOUTUBE_API_KEY` (faster search + `LOUIS_YOUTUBE_SAFE_SEARCH`); `LOUIS_YTDLP_COOKIES_FILE` as above

Self-host web UI has no YouTube key field — set `LOUIS_YOUTUBE_API_KEY` and `LOUIS_YOUTUBE_SAFE_SEARCH` in `.env` (desktop app: **Settings → Advanced**).

```bash
npm install
cp .env.example .env
npm run dev
```

Dev server: port **4000**.

Production without Docker:

```bash
npm run build
npm run start
```



## License & notices

MIT — see [LICENSE](LICENSE).

Fonts (LT Saeada, self-hosted), OpenMoji icons, and [SND](https://snd.dev/) UI sounds are used; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Security reports: [SECURITY.md](SECURITY.md).