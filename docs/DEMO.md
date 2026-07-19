# Demo deployment runbook

This document is for maintainers hosting the public demo. Self-hosters should follow [README.md](../README.md).

## Overview

The demo is a **separate production deployment** of the same Docker image as self-hosting. It uses a dedicated Yoto **public** client and maintainer-owned API keys.

Optionally, mount a Netscape `cookies.txt` from a **throwaway YouTube account** via `NUXT_YTDLP_COOKIES_FILE` — the same optional feature as self-host. Downloads try **anonymous first**, then escalate to `--cookies` on bot check, hard HTTP 403, or age-restricted / members-only walls.

## Prerequisites

- GitHub repository connected to [Railway](https://railway.app/) (or another Docker host)
- Yoto developer account — [yoto.dev/get-started/start-here](https://yoto.dev/get-started/start-here/)
- Google Cloud project with YouTube Data API v3 enabled
- (Recommended) Throwaway Google/YouTube account for download cookies

## 1. Yoto developer portal

Create a **public** client (e.g. "yoto-cards demo"):

| Setting | Value |
|---------|-------|
| Client type | Public |
| Redirect URI | `https://<your-demo-domain>/api/yoto/auth/callback` |
| Scopes | `user:content:view user:content:manage` |

The redirect URI must match `NUXT_YOTO_REDIRECT_URI` exactly.

## 2. Railway setup

1. **New project** → Deploy from GitHub repo
2. **Builder**: Dockerfile (root `Dockerfile`)
3. **Volume**: mount at `/data/audio` (maps to `NUXT_AUDIO_WORK_DIR`)
4. **Variables** — use [`.env.demo.example`](../.env.demo.example) as a checklist:

| Variable | Where to set | Notes |
|----------|--------------|-------|
| `NUXT_YOTO_CLIENT_ID` | Variable | Demo public client ID |
| `NUXT_YOTO_CLIENT_SECRET` | Variable | Leave empty |
| `NUXT_YOTO_REDIRECT_URI` | Variable | `https://<railway-domain>/api/yoto/auth/callback` |
| `NUXT_YOUTUBE_API_KEY` | **Secret** | Maintainer-owned |
| `NUXT_PUBLIC_DEMO_MODE` | Variable | `true` (Preferences demo note) |
| `NUXT_AUDIO_WORK_DIR` | Variable | `/data/audio` |
| `NUXT_YTDLP_COOKIES_FILE` | Variable | Optional; e.g. `/data/secrets/youtube-cookies.txt` |
| `NODE_ENV` | Variable | `production` |

5. **Scaling**: one replica only (save jobs are in-memory)
6. **Custom domain** (optional): update `NUXT_YOTO_REDIRECT_URI` and Yoto portal redirect URI together

## 2b. YouTube cookies (optional)

Same as self-host: set `NUXT_YTDLP_COOKIES_FILE` to a Netscape jar. Demo typically mounts a maintainer throwaway-account file on the volume because shared Railway IPs often hit YouTube bot checks.

1. Create a throwaway Google account (do not use a personal daily-driver account)
2. Export YouTube cookies as Netscape `cookies.txt` — follow [yt-dlp: Exporting YouTube cookies](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies)
3. Place the file on the host at a path **outside** the git tree, e.g. `/data/secrets/youtube-cookies.txt` (volume or secret mount; never commit)
4. Set `NUXT_YTDLP_COOKIES_FILE=/data/secrets/youtube-cookies.txt`
5. Confirm `GET /api/health` → `checks.ytdlpCookies` shows `{ configured: true, readable: true }`

**Policy:** anonymous extract first (`default → android → ios → tv`); escalate to `--cookies` on bot check, hard HTTP 403, or age-restricted / members-only. Successful anon paths never touch the jar.

**Rotate** when previews/saves start failing with bot / 403 signals, or when health shows `readable: false`. Re-export cookies and replace the file; restart if needed.

**Risks:** one shared download identity for all demo users; Google may ban or throttle the account. Keep a single replica and avoid unnecessary re-downloads (cache helps).

## 3. Smoke test

After deploy:

1. Open demo URL → Preferences → confirm demo note and version at the bottom
2. `GET /api/health` returns `status: ok` with yt-dlp, ffmpeg, and `ytdlpCookies` status
3. Connect Yoto → OAuth completes
4. Search YouTube → results load
5. Preview a track → audio plays
6. Save to a test MYO card → job completes

## 4. Operations

| Task | Action |
|------|--------|
| YouTube quota exhausted | Rotate `NUXT_YOUTUBE_API_KEY` or wait for quota reset; consider search-on-submit (future) |
| yt-dlp outdated | Redeploy (rebuilds Docker image with latest apt packages) |
| Bot / 403 on download | Rotate `cookies.txt` (see §2b); confirm `ytdlpCookies.readable` |
| OAuth redirect mismatch | Ensure Railway URL and Yoto portal URI match `NUXT_YOTO_REDIRECT_URI` exactly |
| Disk full | Lower `NUXT_AUDIO_CACHE_MAX_BYTES` / `NUXT_AUDIO_CACHE_MAX_AGE_MS`, or clear `/data/audio/cache` manually |

## 5. Security

- Never commit `NUXT_YOUTUBE_API_KEY` or `youtube-cookies.txt`
- Keep `NUXT_ENABLE_DEBUG_ROUTES` unset or `false`
- YouTube cookies (`NUXT_YTDLP_COOKIES_FILE`) are a server secret — never expose path or contents via debug/API responses (health returns booleans only)
- Demo users connect their own Yoto accounts — treat as untrusted multi-tenant surface
- HTTPS is required (`secure` cookies in production)

## Alternative hosts

The same Docker image works on Fly.io, Render, or VPS + `docker compose`. Requirements:

- HTTPS
- Single instance
- Persistent volume for `/data/audio`
- Env vars from `.env.demo.example`
- Optional secrets mount for `NUXT_YTDLP_COOKIES_FILE`
