# Louis! A Yoto Make Your Own (MYO) client backed by YouTube

Logo

Search YouTube, arrange a playlist, and save it to your [Yoto](https://yotoplay.com/) **Make Your Own (MYO)** cards — Yoto’s blank cards you load your own audio onto.

Self-hosted **Nuxt** server app. Yoto OAuth token exchange and YouTube audio download (via yt-dlp) need a long-running server process, so a static export (Netlify/Vercel static, GitHub Pages, etc.) cannot power those flows.

[https://github.com/user-attachments/assets/6083e578-a0ba-4047-8d44-d2c4efad511d](https://github.com/user-attachments/assets/6083e578-a0ba-4047-8d44-d2c4efad511d)

[Self-host](#self-host) · [Home Assistant](#home-assistant) · [Download (desktop)](#download-desktop) · [Native development](#native-development) · [Contributing](CONTRIBUTING.md) · [Releases](docs/RELEASE.md) · [Desktop](docs/DESKTOP.md)

**Personal use only.** You are responsible for complying with [YouTube’s Terms of Service](https://www.youtube.com/t/terms) and applicable law when downloading audio.

## Features

- Search YouTube and preview audio (server-side via yt-dlp)
- Browse and select your Yoto MYO cards
- Drag-and-drop playlist editing (desktop browser); phone Search / Library flow with Add-to-card
- Save playlists to Yoto with download / transcode progress
- Optional **desktop app** (macOS / Windows) — same app, no Docker required



## Download (desktop)

Installers ship as **Assets** on each GitHub Release (same `vX.Y.Z` as Docker):

**[Latest release](https://github.com/stuartromanek/louis/releases/latest)**


| Platform            | Asset                       |
| ------------------- | --------------------------- |
| macOS Apple Silicon | `Louis-<version>-arm64.dmg` |
| macOS Intel         | `Louis-<version>-x64.dmg`   |
| Windows             | `Louis-Setup-<version>.exe` |


After install, the setup wizard (or **Settings → Advanced**) asks for a Yoto client ID and YouTube Data API key. Prefer **Use default client** for Yoto, or bring your own from [yoto.dev](https://yoto.dev/get-started/start-here/) with redirect `http://127.0.0.1:4010/api/yoto/auth/callback`. Details: [docs/DESKTOP.md](docs/DESKTOP.md).

Installers are currently **unsigned** (Gatekeeper / SmartScreen may warn). Signing notes: [docs/DESKTOP_SIGNING.md](docs/DESKTOP_SIGNING.md).

## Docker (same version)

Self-host the **same** release via GHCR:

```bash
docker pull ghcr.io/stuartromanek/louis:latest
# or pin: ghcr.io/stuartromanek/louis:vX.Y.Z
```

Images are multi-arch (`linux/amd64` + `linux/arm64`) on each `v*` release.

Compose / env setup below. Cut releases: [docs/RELEASE.md](docs/RELEASE.md).

**Portainer:** Stacks → Add stack → **Web editor** (not Git repository). Paste [`docker-compose.yml`](docker-compose.yml), set `LOUIS_YOTO_CLIENT_ID` and `LOUIS_YOUTUBE_API_KEY` in the stack environment UI, then deploy. Open Louis at the **NAS/host URL other devices use** (`http://192.168.x.x:4000` or a hostname) — never the host’s `localhost` from another device. Register that same origin’s `/api/yoto/auth/callback` on [yoto.dev](https://yoto.dev/get-started/start-here/). Image default is `LOUIS_COOKIE_SECURE=false` (LAN HTTP); set `true` only behind HTTPS.

## Home Assistant

Install Louis from Supervisor as a custom add-on (wraps the same GHCR image; options map to `LOUIS_*`; audio under `/data/audio`; UI on host port **4000**, not ingress).

1. **Settings → Add-ons → Add-on store → ⋮ → Repositories** → add `https://github.com/stuartromanek/louis`
2. Install **Louis**, set **youtube_api_key** and confirm **yoto_redirect_uri** matches [yoto.dev](https://yoto.dev/get-started/start-here/)
3. Open `http://homeassistant.local:4000` (or your host:port)

Full options, redirect URI, and `cookie_secure` notes: [homeassistant/louis/DOCS.md](homeassistant/louis/DOCS.md). Sources live under `homeassistant/`; root `repository.yaml` + `louis/` symlinks are for Supervisor discovery.

## Quick start (Docker)

Docker includes Node, yt-dlp, and ffmpeg — you only need Docker and API credentials.

```bash
git clone https://github.com/stuartromanek/louis.git
cd louis
cp .env.example .env
# Fill in LOUIS_YOTO_CLIENT_ID and LOUIS_YOUTUBE_API_KEY (see below)
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
| Scopes                   | `user:content:view user:content:manage`                                            |


You only need `LOUIS_YOTO_CLIENT_ID`. Leave `LOUIS_YOTO_CLIENT_SECRET` empty for PKCE.

### 2. YouTube API

Enable **YouTube Data API v3** in Google Cloud Console and create an API key.

### 3. Environment

Copy `[.env.example](.env.example)`. Use `LOUIS_*` **names** so the same file works for local dev, `docker compose`, and `docker run --env-file .env` without rebuilding the image. Legacy `NUXT_*` / `NUXT_PUBLIC_*` names still work as a deprecated fallback (`LOUIS_*` wins when both are set).

#### Required


| Variable                | Notes            |
| ----------------------- | ---------------- |
| `LOUIS_YOTO_CLIENT_ID`  | Public client ID |
| `LOUIS_YOUTUBE_API_KEY` | Server-side only |




#### Yoto


| Variable                   | Notes                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOUIS_YOTO_CLIENT_SECRET` | Leave empty for PKCE                                                                                                                                                                                  |
| `LOUIS_YOTO_REDIRECT_URI`  | Optional pin; must match the portal. Unset: Louis uses the Host the browser actually used. Prefer a hostname over a DHCP IP. Other devices cannot use the Docker host’s localhost                    |
| `LOUIS_COOKIE_SECURE`      | OAuth cookie `Secure` flag. Docker image defaults `false` (LAN HTTP). Node-without-Docker: when unset, secure iff `NODE_ENV=production`. Set `true` behind HTTPS                                      |




#### YouTube / audio


| Variable                      | Notes                                                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOUIS_AUDIO_WORK_DIR`         | Default `/data/audio` in Docker                                                                                                                                                                           |
| `LOUIS_AUDIO_JOB_MAX_AGE_MS`   | Stale `jobs/` cleanup (default 1h)                                                                                                                                                                        |
| `LOUIS_AUDIO_CACHE_MAX_AGE_MS` | Cache file TTL (default 14d)                                                                                                                                                                              |
| `LOUIS_AUDIO_CACHE_MAX_BYTES`  | Combined preview + save cache cap (default 5 GiB)                                                                                                                                                         |
| `LOUIS_YTDLP_PATH`             | Docker ships yt-dlp **nightly** on `PATH` (refreshed when the image is rebuilt with a new `YTDLP_CACHE_BUST`)                                                                                             |
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
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — keep it current; YouTube breaks outdated extractors
- [ffmpeg](https://ffmpeg.org/) — required for save
- Optional: `LOUIS_YTDLP_COOKIES_FILE` as above

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