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

### Defaults (spike + Phase 1–2 host)

| Setting | Value |
|---------|--------|
| Port | **4010** (avoids clash with `npm run dev` on 4000) |
| Audio dir | `app.getPath('userData')/audio` (userData forced to `…/Louis`) |
| Secrets | **Phase 3:** Preferences → Desktop API keys → `userData/config.json`; spawn sets `NUXT_YOTO_*` / `NUXT_YOUTUBE_API_KEY`. Spike still may load checkout `.env` as fallback when prefs empty. |
| yt-dlp / ffmpeg | Bundled under `desktop/resources/bin/<platform>/` (`npm run desktop:fetch-binaries`); spawn sets `NUXT_YTDLP_PATH` and prepends bin dir to `PATH` |
| OAuth redirect | Always `http://127.0.0.1:4010/api/yoto/auth/callback` (register in Yoto developer portal) |
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

## Shipping yt-dlp + ffmpeg

Consumers do not need Homebrew.

1. `npm run desktop:fetch-binaries` downloads platform binaries into `desktop/resources/bin/<os-arch>/` (yt-dlp onedir zip + ffmpeg).
2. electron-builder `extraResources` copies `bin/` → `process.resourcesPath/bin`.
3. At launch: `NUXT_YTDLP_PATH` + prepend bin dir to `PATH` (`system-deps` / `youtube-download` resolve via env + PATH).
4. `NUXT_AUDIO_WORK_DIR` stays under Electron `userData`.

See Phase 2 in [DESKTOP_SHIP.md](DESKTOP_SHIP.md).

## Credentials (desktop)

Do **not** bake secrets into the app binary.

1. Create a **public** (PKCE) Yoto app at [yoto.dev](https://yoto.dev/get-started/start-here/).
2. Register redirect URI exactly:
   `http://127.0.0.1:4010/api/yoto/auth/callback`
3. In Louis → **Preferences** → **Desktop API keys**, paste Yoto client ID + YouTube Data API v3 key (optional cookies.txt path).
4. **Save & restart** writes `~/Library/Application Support/Louis/config.json` (macOS) and restarts Nitro with `NUXT_*` env.

First launch without keys opens Preferences (`?desktopSetup=1`). Spike checkouts may still use a repo `.env` when prefs fields are empty.

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
