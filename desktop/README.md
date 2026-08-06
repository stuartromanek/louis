# Desktop (Electron)

Electron host for Louis. Spawns production Nitro on `127.0.0.1:4010`, waits for `/api/health`, then loads the UI.

| File | Role |
|------|------|
| `main.mjs` | Path resolution, Nitro spawn, bundled bins, credentials env, IPC |
| `configStore.mjs` | `userData/config.json` read/write + env mapping |
| `preload.cjs` | `window.louisDesktop` bridge (contextIsolation) |
| `loading.html` | Shown until health succeeds |
| `icons/` | App icon (`icon.png`) |
| `resources/bin/<platform>/` | Bundled `yt-dlp` (onedir + `_internal/`) + `ffmpeg` |
| `scripts/` | `fetch-binaries`, `sync-version`, `build-host` |

## Dev (repo checkout)

```bash
npm run build
npm run desktop:fetch-binaries   # once per machine / when bumping the pin
npm run desktop:spike
```

Credentials: **Preferences → Desktop API keys** (saved under Application Support). Spike may also load repo `.env` when prefs fields are empty. Packaged builds never load `.env`.

Register this redirect URI on your Yoto developer app:

`http://127.0.0.1:4010/api/yoto/auth/callback`

## Installers

```bash
npm run desktop:build:host   # unsigned host-arch DMG → desktop/out/Louis-<ver>-<arch>.dmg
npm run desktop:build        # full matrix DMGs + Louis-Setup-<ver>.exe (needs Wine/cross tools for win on mac — prefer CI)
npm run desktop:dir          # unpackaged .app only
```

Signing secrets for CI: [DESKTOP_SIGNING.md](../docs/DESKTOP_SIGNING.md). Release pipeline (GHCR + Assets): [RELEASE.md](../docs/RELEASE.md). Ship checklist: [DESKTOP_SHIP.md](../docs/DESKTOP_SHIP.md).

## Still not shippable (later phases)

| Area | Current behavior |
|------|------------------|
| Code signing | Unsigned in CI until secrets + config overrides |
| README Download links | Phase 6 |
| Port | Fixed `127.0.0.1:4010` |
