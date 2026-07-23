# Louis! A Yoto Make Your Own (MYO) client backed by YouTube

![Logo](./docs/images/louis-readme-banner.webp)

Search YouTube, arrange a playlist, and save it to your [Yoto](https://yotoplay.com/) **Make Your Own (MYO)** cards — Yoto’s blank cards you load your own audio onto.

Self-hosted **Nuxt** server app. Yoto OAuth token exchange and YouTube audio download (via yt-dlp) need a long-running server process, so a static export (Netlify/Vercel static, GitHub Pages, etc.) cannot power those flows.

https://github.com/user-attachments/assets/6083e578-a0ba-4047-8d44-d2c4efad511d

[Self-host](#self-host) · [Native development](#native-development) · [Contributing](CONTRIBUTING.md) · [Releases](docs/RELEASE.md) · [Demo runbook](docs/DEMO.md)

**Personal use only.** You are responsible for complying with [YouTube’s Terms of Service](https://www.youtube.com/t/terms) and applicable law when downloading audio.

## Features

- Search YouTube and preview audio (server-side via yt-dlp)
- Browse and select your Yoto MYO cards
- Drag-and-drop playlist editing
- Save playlists to Yoto with download / transcode progress

## Quick start (Docker)

Docker includes Node, yt-dlp, and ffmpeg — you only need Docker and API credentials.

```bash
git clone https://github.com/stuartromanek/louis.git
cd louis
cp .env.example .env
# Fill in NUXT_YOTO_CLIENT_ID and NUXT_YOUTUBE_API_KEY (see below)
docker compose up -d --build
```

Open [http://localhost:4000](http://localhost:4000). Health: `GET /api/health`.

## Self-host

### 1. Yoto developer portal

Create a **public** client at [yoto.dev](https://yoto.dev/get-started/start-here/):

| Setting        | Value                                          |
| -------------- | ---------------------------------------------- |
| Redirect URI   | `https://your-domain/api/yoto/auth/callback`   |
| Local redirect | `http://localhost:4000/api/yoto/auth/callback` |
| Scopes         | `user:content:view user:content:manage`        |

You only need `NUXT_YOTO_CLIENT_ID`. Leave `NUXT_YOTO_CLIENT_SECRET` empty for PKCE.

### 2. YouTube API

Enable **YouTube Data API v3** in Google Cloud Console and create an API key.

### 3. Environment

Copy [`.env.example`](.env.example). Use **`NUXT_*` names** so the same file works for local dev, `docker compose`, and `docker run --env-file .env` without rebuilding the image.

#### Required

| Variable               | Notes            |
| ---------------------- | ---------------- |
| `NUXT_YOTO_CLIENT_ID`  | Public client ID |
| `NUXT_YOUTUBE_API_KEY` | Server-side only |

#### Yoto

| Variable                  | Notes                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `NUXT_YOTO_CLIENT_SECRET` | Leave empty for PKCE                                                               |
| `NUXT_YOTO_REDIRECT_URI`  | Required in production; must match the portal. Local/dev can auto-detect from host |

#### YouTube / audio

| Variable                      | Notes                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `NUXT_AUDIO_WORK_DIR`         | Default `/data/audio` in Docker                                                                                                       |
| `NUXT_AUDIO_JOB_MAX_AGE_MS`   | Stale `jobs/` cleanup (default 1h)                                                                                                    |
| `NUXT_AUDIO_CACHE_MAX_AGE_MS` | Cache file TTL (default 14d)                                                                                                          |
| `NUXT_AUDIO_CACHE_MAX_BYTES`  | Combined preview + save cache cap (default 5 GiB)                                                                                     |
| `NUXT_YTDLP_PATH`             | Docker ships yt-dlp **nightly** on `PATH` (refreshed when the image is rebuilt with a new `YTDLP_CACHE_BUST`) |
| `NUXT_YTDLP_COOKIES_FILE`     | Optional Netscape `cookies.txt`. Downloads try anonymously first; cookies are used only if YouTube blocks with bot check, hard 403, or age-gate. Prefer a throwaway Google account; never commit the file |

#### Advanced / debug

| Variable                | Notes                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `NUXT_PUBLIC_DEMO_MODE` | `true` shows a demo note in Preferences ([docs/DEMO.md](docs/DEMO.md))             |
| `NUXT_ENABLE_DEBUG_ROUTES` | `true` enables debug API routes                                                 |

```bash
docker run -p 4000:4000 --env-file .env louis:local
```

### 4. Deploy constraints

- **Single instance** — save-job progress is in memory
- **HTTPS in production** — OAuth cookies set `secure` when `NODE_ENV=production`
- **Persistent disk** — recommended for the audio cache under `NUXT_AUDIO_WORK_DIR` (`cache/preview/`, `cache/save/`). Stale `jobs/` dirs and old cache files are swept on startup and after downloads.

## Native development

For local Node (without Docker), install these first:

- Node.js 22+ (also used as yt-dlp’s JS runtime for YouTube signing)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — keep it current; YouTube breaks outdated extractors
- [ffmpeg](https://ffmpeg.org/) — required for save
- Optional: `NUXT_YTDLP_COOKIES_FILE` as above

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

## Demo instance

Maintainer demo setup: [docs/DEMO.md](docs/DEMO.md). Self-hosters should register their own Yoto app — do not reuse demo credentials.

## License & notices

MIT — see [LICENSE](LICENSE).

Fonts (Dongle), OpenMoji icons, and [SND](https://snd.dev/) UI sounds are bundled; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Security reports: [SECURITY.md](SECURITY.md).
