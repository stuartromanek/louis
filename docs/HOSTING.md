# Hosting Louis (homelab-first)

One-click and guided installs for Docker on NAS, homelab, and LAN. Louis also ships as a [desktop app](DESKTOP.md) and [Home Assistant add-on](../homeassistant/louis/DOCS.md).

**Image:** `stuartromanek/louis:latest` (or pin `stuartromanek/louis:vX.Y.Z`). Equivalent on GHCR: `ghcr.io/stuartromanek/louis`.

## Quick pick

| You want… | Use |
| --------- | --- |
| Mac / Windows app, no Docker | [Desktop installers](DESKTOP.md) |
| Home Assistant on your LAN | [HA add-on](../homeassistant/louis/DOCS.md) |
| Docker on NAS / homelab | **Portainer**, **CasaOS**, or **Coolify** below |
| Umbrel OS | [Umbrel community store bundle](../deploy/umbrel/README.md) |
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
- Portainer / CasaOS / Umbrel bundles pull from Docker Hub; no Louis rebuild on your NAS when we ship a new version.

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

## CasaOS / ZimaOS (app store)

Artifacts: [`deploy/casaos/`](../deploy/casaos/)

### Add the store (one-time)

After the maintainer publishes the built store to `gh-pages` (see [CasaOS publish](#casaos-store-publish-maintainer)):

1. CasaOS → **Settings** → **App Store** → **Add source**
2. Store URL (jsDelivr CDN):

   `https://cdn.jsdelivr.net/gh/stuartromanek/louis@gh-pages/store.json`

   Or GitHub Pages (if enabled): `https://stuartromanek.github.io/louis/store.json`

### Install Louis

1. App Store → **Louis** → Install
2. Set **LOUIS_YOTO_CLIENT_ID** in app settings
3. Open Louis from CasaOS; register redirect URI on yoto.dev
4. Optional YouTube API key in environment

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

## Umbrel (community app store)

Artifacts: [`deploy/umbrel/`](../deploy/umbrel/)

Umbrel apps install from a **community app store** Git repo (not the official Umbrel catalog unless submitted separately).

### Maintainer: publish a store

See [`deploy/umbrel/README.md`](../deploy/umbrel/README.md):

1. Fork [umbrel-community-app-store](https://github.com/getumbrel/umbrel-community-app-store)
2. Copy `deploy/umbrel/umbrel-app-store.yml` and `deploy/umbrel/louis-louis/` into the fork
3. Push; users add your fork URL under **Community app stores**

### User: install

1. Add the community store URL (from maintainer)
2. Install **Louis**; set **LOUIS_YOTO_CLIENT_ID**
3. Register redirect URI on yoto.dev for your Umbrel hostname

---

## CasaOS store publish (maintainer)

CI workflow [`.github/workflows/casaos-store.yml`](../.github/workflows/casaos-store.yml) builds `deploy/casaos/` and publishes `dist/` to the **`gh-pages`** branch on push to `main` (and manual dispatch).

After a successful run:

1. Confirm `https://cdn.jsdelivr.net/gh/stuartromanek/louis@gh-pages/store.json` loads
2. Optional: PR to [Awesome Third-party Stores](https://awesome.casaos.io/content/3rd-party-app-stores/list.html) with:
   - Name: Louis
   - URL: `https://cdn.jsdelivr.net/gh/stuartromanek/louis@gh-pages/store.json`
   - Description: Yoto MYO client for CasaOS

Bump `version` in [`deploy/casaos/Apps/Louis/docker-compose.yml`](../deploy/casaos/Apps/Louis/docker-compose.yml) `x-casaos` when displaying a new Louis release in the store.

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
