# Desktop (Electron)

Electron host for Louis. Spawns production Nitro on `127.0.0.1:4010`, waits for `/api/health`, then loads the UI.

| File | Role |
|------|------|
| `main.mjs` | Path resolution, Nitro spawn (`ELECTRON_RUN_AS_NODE`), single-instance, loading UI, crash dialog |
| `preload.cjs` | contextIsolation stub (no APIs yet) |
| `loading.html` | Shown until health succeeds |
| `icons/` | App icon (`icon.png`) |

## Dev (repo checkout)

```bash
npm run build
npm run desktop:spike
```

Dev resolves `.output` from the repo root and loads `.env` into the Electron process. Packaged builds do not load `.env`.

## Unpackaged build smoke

```bash
npm run desktop:dir
```

Produces an unpackaged app under `desktop/out/` (e.g. `mac-arm64/Louis.app`). Host files live in a thin `app.asar`; Nitro `.output` is copied via `extraResources`. `desktop/package.json` is the electron-builder app package (no Nuxt deps). Launch the `.app` to confirm UI without the git-checkout layout.

Config: [`electron-builder.yml`](../electron-builder.yml). Ship checklist: [DESKTOP_SHIP.md](../docs/DESKTOP_SHIP.md). Overview: [DESKTOP.md](../docs/DESKTOP.md).

## Still not shippable (later phases)

| Area | Current behavior |
|------|------------------|
| yt-dlp / ffmpeg | System `PATH` — not bundled (Phase 2) |
| Secrets | Dev spike loads repo `.env`; packaged needs Preferences (Phase 3) |
| Installers | `--dir` only — no DMG/NSIS yet (Phase 6) |
| Port | Fixed `127.0.0.1:4010` |
