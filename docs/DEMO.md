# Demo deployment runbook

This document is for maintainers hosting the public demo. Self-hosters should follow [README.md](../README.md).

## Overview

The demo is a **separate production deployment** of the same Docker image as self-hosting. It uses a dedicated Yoto **public** client and maintainer-owned API keys.

**Cookies are effectively required on Railway (and most cloud hosts).** Shared datacenter IPs almost always fail anonymous yt-dlp with YouTube’s bot check. Mount a Netscape `cookies.txt` from a **throwaway YouTube account** via `NUXT_YTDLP_COOKIES_FILE`. Downloads still try **anonymous first**, then escalate to `--cookies` on bot check, hard HTTP 403, or age-restricted / members-only walls. Escalation in logs is expected — not an outage by itself.

## Prerequisites

- GitHub repository connected to [Railway](https://railway.app/) (or another Docker host)
- Yoto developer account — [yoto.dev/get-started/start-here](https://yoto.dev/get-started/start-here/)
- Google Cloud project with YouTube Data API v3 enabled
- Throwaway Google/YouTube account for download cookies (strongly recommended for demo)

## 1. Yoto developer portal

Create a **public** client (e.g. "Louis demo"):

| Setting | Value |
|---------|-------|
| Client type | Public |
| Redirect URI | `https://<your-demo-domain>/api/yoto/auth/callback` |
| Scopes | `user:content:view user:content:manage` |

The redirect URI must match `NUXT_YOTO_REDIRECT_URI` exactly.

## 2. Railway setup

1. **New project** → Deploy from GitHub repo
2. **Builder**: Dockerfile (root `Dockerfile`)
3. **Volume**: mount at `/data/audio` (maps to `NUXT_AUDIO_WORK_DIR`) — or `/data` if you set work dir accordingly
4. **Build arg** `YTDLP_CACHE_BUST`: set to a value that changes each deploy (e.g. Railway deployment ID or timestamp) so the image reinstalls yt-dlp **nightly** (`pip install --upgrade --pre`). Without a fresh bust, Docker layer cache can freeze an old yt-dlp.
5. **Variables** — use [`.env.demo.example`](../.env.demo.example) as a checklist:

| Variable | Where to set | Notes |
|----------|--------------|-------|
| `NUXT_YOTO_CLIENT_ID` | Variable | Demo public client ID |
| `NUXT_YOTO_CLIENT_SECRET` | Variable | Leave empty |
| `NUXT_YOTO_REDIRECT_URI` | Variable | `https://<railway-domain>/api/yoto/auth/callback` |
| `NUXT_YOUTUBE_API_KEY` | **Secret** | Maintainer-owned |
| `NUXT_PUBLIC_DEMO_MODE` | Variable | `true` (Preferences demo note) |
| `NUXT_AUDIO_WORK_DIR` | Variable | `/data/audio` (or `/data` if that is your volume root) |
| `NUXT_YTDLP_COOKIES_FILE` | Variable | **Required for reliable demo**; e.g. `/data/secrets/youtube-cookies.txt` |
| `NODE_ENV` | Variable | `production` |

6. **Scaling**: **one replica only** — save-job progress is in-memory (`Map` in process). Extra replicas break progress polling and can split work incorrectly.
7. **Custom domain** (optional): update `NUXT_YOTO_REDIRECT_URI` and Yoto portal redirect URI together

## 2b. YouTube cookies (required for demo reliability)

Set `NUXT_YTDLP_COOKIES_FILE` to a Netscape jar. Demo mounts a maintainer throwaway-account file on the volume because shared Railway IPs hit YouTube bot checks on nearly every anon attempt.

1. Create a throwaway Google account (do not use a personal daily-driver account)
2. Export YouTube cookies as Netscape `cookies.txt` — follow [yt-dlp: Exporting YouTube cookies](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies)
3. Place the file on the host at a path **outside** the git tree, e.g. `/data/secrets/youtube-cookies.txt` (volume or secret mount; never commit)
4. Set `NUXT_YTDLP_COOKIES_FILE=/data/secrets/youtube-cookies.txt`
5. Confirm `GET /api/health` → `checks.ytdlpCookies` shows `{ configured: true, readable: true }` and `checks.ytdlp.version` looks like a recent nightly (`YYYY.MM.DD…`)

**Policy:** anonymous extract first (`default → android → ios → tv`); escalate to `--cookies` on bot check, hard HTTP 403, or age-restricted / members-only. Successful anon paths never touch the jar.

**Rotate** when previews/saves start failing *after* escalate (see `[yt-dlp] fail …` in logs), or when health shows `readable: false`. Re-export cookies and replace the file; restart if needed.

**Risks:** one shared download identity for all demo users; Google may ban or throttle the account. Keep a single replica; cache + singleflight coalescing reduce duplicate yt-dlp runs for the same video.

## 3. Smoke test

After deploy:

1. Open demo URL → Preferences → confirm demo note and version at the bottom
2. `GET /api/health` returns `status: ok` with yt-dlp, ffmpeg, and `ytdlpCookies: { configured: true, readable: true }`
3. Connect Yoto → OAuth completes
4. Search YouTube → results load
5. Preview a track → audio plays
6. Save to a test MYO card → job completes

## 4. Operations

| Task | Action |
|------|--------|
| YouTube quota exhausted | Rotate `NUXT_YOUTUBE_API_KEY` or wait for quota reset |
| yt-dlp outdated | Rebuild/redeploy with a fresh `YTDLP_CACHE_BUST`; confirm nightly version on `/api/health` |
| Bot / 403 after escalate | Rotate `cookies.txt` (see §2b); confirm `ytdlpCookies.readable` |
| OAuth redirect mismatch | Ensure Railway URL and Yoto portal URI match `NUXT_YOTO_REDIRECT_URI` exactly |
| Disk full | Lower `NUXT_AUDIO_CACHE_MAX_BYTES` / `NUXT_AUDIO_CACHE_MAX_AGE_MS`, or clear cache under the work dir manually |
| Mid-save “job not found” after deploy | Expected — see §4b |

### 4b. Restarts, redeploys, and in-memory save jobs

Save progress lives **only in the running Node process**. Any container stop clears active jobs:

- Railway redeploy / restart
- Crash or OOM kill
- Healthcheck failure that replaces the replica

**What to do when investigating Stop/Start churn in Railway logs:**

1. Open the service **Deployments** timeline and align Stop/Start timestamps with deploy events.
2. If every restart matches a deploy you triggered, it is not an app crash — warn demo users that saves in flight will drop.
3. If restarts happen *without* a deploy, check metrics for OOM, healthcheck flaps, and Railway platform incidents.
4. Prefer fewer push-to-deploy cycles during active demo windows; wait for in-flight saves to finish before redeploying.

Persistent volume keeps **audio cache** across restarts; it does **not** restore save-job state.

### 4c. Reading yt-dlp logs

| Log line | Meaning |
|----------|---------|
| `[yt-dlp] escalate … reason=bot_signin` | Anon blocked; retrying with cookies. **Normal on Railway.** |
| `[yt-dlp] coalesce …` | Concurrent request for the same video joined an in-flight download (stampede protection). |
| `[yt-dlp] ok … auth=cookies escalated=true` | Cookies recovered the download. |
| `[yt-dlp] ok … auth=anon` | Rare on cloud IPs; fine when it happens. |
| `[yt-dlp] fail …` | User-facing failure after retries — rotate cookies or check yt-dlp version. |
| `[yt-dlp] retry …` | Transient error; rotating player client / backoff. |

Escalate/retry use `console.info` so they should not look like process errors. Treat **`fail`** lines as the signal to act.

### 4d. Concurrency posture

- **One replica** only (save jobs + simplest cookie/IP story).
- Concurrent preview/save for the **same** `videoId` share one yt-dlp run (in-process singleflight) and then disk cache.
- Different videos still run in parallel — under heavy demo traffic, watch CPU/disk and cookie-account health.

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
- Persistent volume for the audio work dir
- Env vars from `.env.demo.example`
- Secrets mount for `NUXT_YTDLP_COOKIES_FILE`
- Fresh `YTDLP_CACHE_BUST` on each image build so yt-dlp nightly stays current
