# Desktop spike (Electron)

Thin Electron host for Louis. Spawns production Nitro from `../.output/server/index.mjs` on `127.0.0.1:4010`.

- `main.mjs` — spawn Nitro, health-wait, `BrowserWindow`, clean quit
- `preload.cjs` — contextIsolation stub (no APIs exposed yet)

```bash
npm run build
npm run desktop:spike
```

## Spike-only limits (Phase 0)

Not a shippable installer yet. See [DESKTOP_SHIP.md](../docs/DESKTOP_SHIP.md) for the path to Release Assets.

| Area | Spike behavior |
|------|----------------|
| yt-dlp / ffmpeg | System `PATH` (e.g. Homebrew) — not bundled |
| Secrets | Loads repo-root `.env` into the Electron process at runtime — do not distribute that |
| Layout | Expects a git checkout with `.output/` from `npm run build` |
| Port | Fixed `127.0.0.1:4010` (document Yoto redirect when testing OAuth) |
| Packaging | No electron-builder / DMG / NSIS |

Ship checklist: [DESKTOP_SHIP.md](../docs/DESKTOP_SHIP.md). Overview: [DESKTOP.md](../docs/DESKTOP.md).
