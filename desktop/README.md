# Desktop (Electron)

Electron host for Louis. Spawns production Nitro on `127.0.0.1:4010`, waits for `/api/health`, then loads the UI.

| File | Role |
|------|------|
| `main.mjs` | Path resolution, Nitro spawn (`ELECTRON_RUN_AS_NODE`), bundled bin env, single-instance, loading UI |
| `preload.cjs` | contextIsolation stub (no APIs yet) |
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

Dev resolves `.output` from the repo root and loads `.env` into the Electron process. Packaged builds do not load `.env`. Bundled bins still win via `NUXT_YTDLP_PATH` + PATH prepend.

## Unpackaged build smoke

```bash
npm run desktop:dir
```

Fetches host-platform binaries, builds Nuxt, then electron-builder `--dir` → `desktop/out/` (e.g. `mac-arm64/Louis.app`). Host files in a thin `app.asar`; `.output` and `bin/` via `extraResources`.

Config: [`electron-builder.yml`](../electron-builder.yml). Ship checklist: [DESKTOP_SHIP.md](../docs/DESKTOP_SHIP.md). Overview: [DESKTOP.md](../docs/DESKTOP.md).

## Still not shippable (later phases)

| Area | Current behavior |
|------|------------------|
| Secrets | Dev spike loads repo `.env`; packaged needs Preferences (Phase 3) |
| Installers | `--dir` only — no DMG/NSIS yet (Phase 6) |
| Port | Fixed `127.0.0.1:4010` |
