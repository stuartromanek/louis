# Hosting Louis (homelab-first)

One-click and guided installs for Docker on NAS, homelab, and LAN. Louis also ships as a [desktop app](DESKTOP.md) and [Home Assistant add-on](../homeassistant/louis/DOCS.md).

**Image:** `stuartromanek/louis:latest` (or pin `stuartromanek/louis:vX.Y.Z`). Equivalent on GHCR: `ghcr.io/stuartromanek/louis`.

## Quick pick

| You want… | Use |
| --------- | --- |
| Mac / Windows app, no Docker | [Desktop installers](DESKTOP.md) |
| Home Assistant on your LAN | [HA add-on](../homeassistant/louis/DOCS.md) |
| Docker on NAS / homelab | **Portainer** (recommended) or **Coolify** below |
| Hand-rolled Docker | Root [`docker-compose.yml`](../docker-compose.yml) |

## Shared checklist (every Docker host)

1. **Single instance only** — save progress is in memory; do not run multiple replicas.
2. **Persistent volume** at `/data/audio` (preview/save cache, optional yt-dlp updates).
3. **Required env:** `LOUIS_YOTO_CLIENT_ID` (public PKCE client from [yoto.dev](https://yoto.dev/get-started/start-here/)).
4. **Yoto redirect URI** — register on yoto.dev the exact origin you will open:
   - LAN: `http://<host-ip-or-name>:4000/api/yoto/auth/callback`
   - HTTPS: `https://<your-domain>/api/yoto/auth/callback`
   - Leave `LOUIS_YOTO_REDIRECT_URI` unset to let Louis use the Host header you actually opened.
5. **Open Louis at that same origin** — phones/tablets cannot use the Docker host’s `localhost`. Use NAS IP or hostname.
6. **`LOUIS_COOKIE_SECURE`** — image default is `false` (LAN HTTP). Set `true` only behind HTTPS / reverse proxy.
7. **Optional:** `LOUIS_YOUTUBE_API_KEY` (faster search + safeSearch); unset uses bundled yt-dlp.
8. **Health:** `GET /api/health` should return `status: ok` with yt-dlp and ffmpeg available.

### Do not

- Run **multiple Louis containers** behind a load balancer for the same users.
- Use **Home Assistant ingress** for Louis OAuth (path/host rewriting breaks Yoto login) — see [HA docs](../homeassistant/louis/DOCS.md).
- Expect **cloud datacenter IPs** to download YouTube reliably without optional cookies — homelab/LAN is the sweet spot.

## Upgrade

- **Track latest:** keep `image: stuartromanek/louis:latest` (or re-pull in your UI).
- **Pin a release:** `stuartromanek/louis:vX.Y.Z` — same tag as [GitHub Releases](https://github.com/stuartromanek/louis/releases).
- Portainer and other compose-based installs pull from Docker Hub; no Louis rebuild on your NAS when we ship a new version.

---

## Portainer (one-click template)

Artifacts: [`deploy/portainer/`](../deploy/portainer/)

### Add the template (one-time, admin)

**Option A — URL (recommended):**

1. Portainer → **App Templates** → **Add template**
2. **URL:** `https://raw.githubusercontent.com/stuartromanek/louis/main/deploy/portainer/templates.json`

**Option B — paste:** copy contents of [`deploy/portainer/templates.json`](../deploy/portainer/templates.json).

### Deploy Louis

1. **App Templates** → **Louis** → **Deploy the stack**
2. Set **LOUIS_YOTO_CLIENT_ID** (required)
3. Optional: YouTube API key, redirect URI pin, `LOUIS_COOKIE_SECURE`
4. Deploy; open `http://<host>:4000`
5. Register redirect URI on yoto.dev, then **Connect** in Louis

Stack file used: [`deploy/portainer/docker-compose.yml`](../deploy/portainer/docker-compose.yml) (image-only, no local build).

---

## Coolify

Uses the repo root [`docker-compose.yml`](../docker-compose.yml) — no separate bundle.

1. **New resource** → **Public repository** → `https://github.com/stuartromanek/louis`
2. Build pack: **Docker Compose**, path `docker-compose.yml`
3. Environment: `LOUIS_YOTO_CLIENT_ID` (required); optional YouTube key
4. Confirm volume **`louis-audio`** → `/data/audio`
5. Domain or host port **4000**; set `LOUIS_COOKIE_SECURE` to match HTTP vs HTTPS
6. Deploy; verify `/api/health`

---

## CasaOS / ZimaOS (best-effort)

A third-party store bundle lives in [`deploy/casaos/`](../deploy/casaos/) and CI may publish to `gh-pages`, but **Louis does not actively maintain or test CasaOS installs**. Prefer Portainer or plain Docker.

If you still want to try it:

1. CasaOS → **Settings** → **App Store** → **Add source**
2. Store URL: `https://cdn.jsdelivr.net/gh/stuartromanek/louis@gh-pages/store.json`
3. Install **Louis**; set **LOUIS_YOTO_CLIENT_ID**; register redirect URI on yoto.dev

---

## Cloud PaaS (Railway, Render, Fly)

Not recommended as primary hosting: Louis needs a **persistent volume**, **single instance**, and YouTube downloads often fail from datacenter IPs without extra cookies setup. Homelab Docker or the desktop app is a better fit. If you still deploy to cloud, use HTTPS, set `LOUIS_COOKIE_SECURE=true`, attach a volume at `/data/audio`, and pin a redirect URI on yoto.dev.

---

## Troubleshooting

| Symptom | Check |
| ------- | ----- |
| OAuth fails after login | Redirect URI on yoto.dev must match the URL in the browser bar exactly |
| Connect works on PC only | Other devices must use host IP/hostname, not `localhost` |
| Search works, save fails | `/api/health` — yt-dlp/ffmpeg; YouTube may block anonymous datacenter IPs |
| Stale app after update | Re-pull `stuartromanek/louis:latest` or restart stack |

More env vars: [README](../README.md#3-environment).
