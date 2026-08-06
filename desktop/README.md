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
| `scripts/fetch-binaries.mjs` | Downloads those binaries |

## Dev (repo checkout)

```bash
npm run build
npm run desktop:fetch-binaries   # once per machine / when bumping the pin
npm run desktop:spike
```

Credentials: **Preferences → Desktop API keys** (saved under Application Support). Spike may also load repo `.env` when prefs fields are empty. Packaged builds never load `.env`.

Register this redirect URI on your Yoto developer app:

`http://127.0.0.1:4010/api/yoto/auth/callback`

## Unpackaged build smoke

```bash
npm run desktop:dir
```

Fetches host-platform binaries, builds Nuxt, then electron-builder `--dir` → `desktop/out/`.

Config: [`electron-builder.yml`](../electron-builder.yml). Ship checklist: [DESKTOP_SHIP.md](../docs/DESKTOP_SHIP.md). Overview: [DESKTOP.md](../docs/DESKTOP.md).

## Still not shippable (later phases)

| Area | Current behavior |
|------|------------------|
| Installers | `--dir` only — no DMG/NSIS yet (Phase 4+) |
| Port | Fixed `127.0.0.1:4010` |
