# Desktop wrapper

Louis is a **Nuxt/Nitro server** app (`node .output/server/index.mjs`) that needs **yt-dlp**, **ffmpeg**, a writable audio work dir, and Yoto/YouTube credentials. A static SPA shell cannot replace that.

Docker remains the primary self-host path. Desktop is the consumer convenience track: same `.output`, no separate UI build.

## Decision: Electron long-term

| Option | Verdict for Louis |
|--------|-------------------|
| **Electron** | **Chosen track** — same Node stack as Nitro; spawn `.output/server/index.mjs`, open `BrowserWindow` |
| Deno Desktop | Spike **passed** functionally (2026-08-06) but rejected long-term: dual runtime (Deno Node-compat over Nitro), experimental CLI, permission/`--no-check` friction |
| Tauri 2 | Distant third — Nuxt docs push SSG; would still need a Node sidecar for Louis |

### Why not Deno despite a green spike

Deno Desktop auto-detects Nuxt and ran health + yt-dlp preview successfully, but Louis would ship under a second runtime forever. Electron main is Node: spawn the identical server Docker/`npm run start` already use.

## Architecture

```text
Electron main
  → spawn: node .output/server/index.mjs  (HOST=127.0.0.1 PORT=4010 …)
  → wait:  GET /api/health
  → BrowserWindow → http://127.0.0.1:4010/
  → on quit: SIGTERM Nitro child
```

Spike host lives under [`desktop/`](../desktop/) (`main.mjs`, `preload.cjs`, `loading.html`). Scripts: `npm run desktop:spike` (dev), `npm run desktop:dir` (unpackaged electron-builder smoke).

### Defaults (spike + Phase 1 host)

| Setting | Value |
|---------|--------|
| Port | **4010** (avoids clash with `npm run dev` on 4000) |
| Audio dir | `app.getPath('userData')/audio` (userData forced to `…/Louis`) |
| Secrets | Dev: load repo `.env` into Electron process — **do not** bake into the binary |
| yt-dlp / ffmpeg | System `PATH` until Phase 2 |
| Packaged Nitro | `process.resourcesPath/.output` via electron-builder `extraResources` |

```bash
npm run build
npm run desktop:spike
```

## Electron spike results (2026-08-06, macOS arm64)

```bash
npm run build
npm run desktop:spike
```

Verified against `http://127.0.0.1:4010`:

- `GET /api/health` → `ok`; yt-dlp + ffmpeg **available** (system PATH); audio work dir under Electron `userData` / `Louis/audio` (after `app.setName('Louis')`)
- `GET /` → 200
- YouTube search API → 200
- Preview download via yt-dlp → 200
- Quit Electron → Nitro child gone; port **4010** clear (no orphan)

Host: [`desktop/main.mjs`](../desktop/main.mjs) + [`desktop/preload.cjs`](../desktop/preload.cjs). Loads `.env` into the Electron process at runtime (not compiled into a binary).

### Spike-only limits (Phase 0)

- **yt-dlp / ffmpeg:** system `PATH` only (not bundled)
- **Secrets:** repo-root `.env` at runtime — fine for maintainers; not for distribution
- **Layout:** requires checkout + `npm run build` (`.output/`)
- **No installers** yet — see [DESKTOP_SHIP.md](DESKTOP_SHIP.md)

## Shipping yt-dlp + ffmpeg (next pass)

Consumers will not have Homebrew.

1. CI downloads platform binaries into e.g. `desktop/bin/<os-arch>/`.
2. Package via Electron `extraResources` → runtime under `process.resourcesPath`.
3. At launch set `NUXT_YTDLP_PATH` and prepend ffmpeg’s directory to `PATH` (Louis resolves `ffmpeg` via PATH in `server/utils/system-deps.ts`; yt-dlp via `NUXT_YTDLP_PATH` in `server/utils/youtube-download.ts`).
4. `NUXT_AUDIO_WORK_DIR` stays under Electron `userData`.

Alternatives: download-on-first-run into Application Support; or document system installs (devs only).

## Historical: Deno Desktop probe (2026-08-06, macOS arm64)

Kept for research continuity — **not** the shipping path.

```bash
npm run build
deno desktop -A --backend webview --no-check --node-modules-dir=manual --output ./yoto-cards.app .
```

Verified: `/api/health` (yt-dlp + ffmpeg available), `/`, YouTube search, preview download. Gotchas included Deno permissions (`-A`), `--no-check` for `@types/node`, `--env-file` embedding secrets, random listen port, large `node_modules` embed, experimental CLI.

## Next implementation steps

Work the ordered checklist: **[DESKTOP_SHIP.md](DESKTOP_SHIP.md)** (Phases 0–7). That doc also defines how DMG/NSIS attach to the same GitHub Release as GHCR when you `npm run release`.

## References

- [Electron](https://www.electronjs.org/docs/latest/)
- [Deno Desktop](https://docs.deno.com/runtime/desktop/) (rejected long-term)
- [Deno vs Electron comparison](https://docs.deno.com/runtime/desktop/comparison/)
