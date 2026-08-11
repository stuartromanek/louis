# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

How we cut releases: [docs/RELEASE.md](docs/RELEASE.md).

## [Unreleased]

### Added
- **Home Assistant add-on** under `homeassistant/` (Supervisor repo + options → `LOUIS_*`, port 4000, `/data/audio`) — [homeassistant/louis/DOCS.md](homeassistant/louis/DOCS.md).
- `LOUIS_COOKIE_SECURE` to override OAuth cookie `Secure` (plain HTTP / HA LAN).
- GHCR release images publish **linux/amd64 + linux/arm64** (required for typical HA hosts).

## [1.1.2] - 2026-08-08

### Fixed
- macOS release builds both arm64 and x64 DMGs (`electron-builder --arm64 --x64`); CI verifies both artifacts before upload.

## [1.1.1] - 2026-08-08

### Fixed
- Release desktop jobs: electron-builder no longer tries to publish on tagged CI runs (`--publish never` / `publish: null`); Nitro LOUIS_* alias injection finds `nitro.mjs` on Windows (`chunks/_/` vs `chunks/nitro/`).

## [1.1.0] - 2026-08-08

### Added
- **Desktop app (Electron):** macOS DMG (arm64 + x64) and Windows NSIS installers built on `v*` tags and attached to the same GitHub Release as GHCR — [docs/DESKTOP.md](docs/DESKTOP.md), [docs/RELEASE.md](docs/RELEASE.md), checklist [docs/DESKTOP_SHIP.md](docs/DESKTOP_SHIP.md).
- Bundled yt-dlp + ffmpeg in the desktop package (`npm run desktop:fetch-binaries`); no Homebrew required for consumers.
- Desktop Settings → **Desktop API keys** (Yoto client ID, YouTube API key, optional cookies path) stored under Application Support `config.json` — not baked into the binary. Fixed OAuth redirect `http://127.0.0.1:4010/api/yoto/auth/callback`.
- **First-run setup wizard** on the splash background when required keys are missing: step-through Yoto / YouTube / redirect URI / “You’re ready”, with Back, step chip, FLIP layout motion, and **Let’s go** to save (and restart Nitro in the desktop app). Optional yt-dlp cookies stay in **Settings → Advanced** only.
- Shared `DesktopApiKeysFields` for Settings and the wizard (tooltips, yoto.dev / Google Cloud links, redirect URI **Copy**).
- Maintainer scripts: `desktop:spike`, `desktop:dir`, `desktop:build:host` / `:mac` / `:win` / `:build`.
- HMR preview: `?desktopPrefs=1` (and `&desktopSetup=1`) mocks desktop config in sessionStorage — [docs/DESKTOP.md](docs/DESKTOP.md).
- Phone editor IA below 600px: Search / Library tabs, nested card detail, Add-to-card drawer, Menu tray, toasts, and denser YouTube results (desktop/tablet two-column layout unchanged at `sm+`).
- Mobile Menu update affordances: Bell + light pink when a save is pending; IndexPointingUp + left-to-right pink progress fill while updating.
- How-to empty state and How To modal with beat art; Search Clear after submit; phone-friendly over-limit / long-track controls.
- Dirty MYO playlist draft persistence in `localStorage` (restored when the card is opened again).
- yt-dlp download outcome logs (`ok` / `fail` / `escalate` / `coalesce`) so Railway logs show whether cookies recovered after bot checks.
- In-process singleflight for concurrent downloads of the same YouTube id (preview stampede protection).

### Changed
- Desktop first-run wizard no longer asks for yt-dlp cookies; set that path later under **Settings → Advanced** ([docs/DESKTOP.md](docs/DESKTOP.md)).
- Auth gate: **Edit Settings** under Connect (and other primary actions) so a bad desktop client ID can be fixed without dismissing the gate.
- Desktop **Connect** opens Yoto OAuth in the system browser (`shell.openExternal`); tokens persist in `yoto-session.json` so Louis never navigates away (and password managers work).
- Renamed product UI copy from Preferences to **Settings**.
- Env contract is now **`LOUIS_*`** (e.g. `LOUIS_YOTO_CLIENT_ID`, `LOUIS_YOUTUBE_API_KEY`, `LOUIS_PUBLIC_DESKTOP`); legacy **`NUXT_*` / `NUXT_PUBLIC_*`** still accepted as a deprecated fallback (`LOUIS_*` wins when both are set). Nitro boot plugin applies custom names at container runtime.
- UI typeface is self-hosted **LT Saeada** (Regular / Medium / Bold) instead of Dongle.
- Desktop Settings: General / Advanced nav; Done saves dirty API keys (Save & restart in Electron); required Yoto client ID + YouTube API key match the wizard.
- Desktop config merge preserves omitted fields (e.g. client secret); `get-config` / setup gating use the same effective config (stored `config.json` with env filling blanks for spike/dev).
- After credential save, desktop reload opens setup again if required keys are still missing.
- Phone chrome polish for narrow viewports (densify ≤360px / ≤310px): tab icons, result art, howto mocks, tray open animation.
- Expected anon→cookies escalate and retries log at info level (not warn/error).
- Long API errors use h3 `message` instead of `statusMessage` (avoids future sanitization warnings).
- Release workflow uploads desktop installers alongside GHCR on each `v*` tag.

### Removed
- Public demo documentation and maintainer demo template (`docs/DEMO.md`, `.env.demo.example`, and related README / SECURITY notes).
- Bundled Dongle font files (replaced by LT Saeada).

## [1.0.0] - 2026-07-22

### Added
- Intro splash sequence (Lottie) on first visit per tab session, with a short delay before playback and a frame-synced Louis sound cue (`splashCue` / `louis.wav`).
- Splash debug mode via `?splash=debug` (loop, pause, frame HUD).
- Early splash cover so the main app does not flash before the intro.
- Post-auth welcome modal (`YotoConnectedModal`) after successful Yoto OAuth (`/?yoto=connected`), with feature list, TV frame UI, and celebration sound.
- Auth gate uses the Yoto-on SVG as a TV frame with Louis artwork; connect CTA plays `toggle_on`, gate open plays ringtone.
- `lottie-web` dependency for splash playback.

### Changed
- Successful OAuth callback redirects to `/?yoto=connected` instead of bare `/`.
- Auth gate copy updated to “Connect Louis to Yoto”; connect-gate and welcome typography/spacing tightened.
- YouTube result card channel meta uses tighter line-height.
- Docs and browser title brand the app as **Louis** (README banner, CONTRIBUTING, ROADMAP, DEMO, LICENSE).

### Removed
- Marketing page (`/marketing`) and `public/marketing/` assets (Louis/Yoto art lives under `public/images/`).
- Experimental muted `<video>` splash cue path (`louis.mp4`); splash audio uses the shared UI sound player only.

[Unreleased]: https://github.com/stuartromanek/louis/compare/v1.1.2...main
[1.1.2]: https://github.com/stuartromanek/louis/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/stuartromanek/louis/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/stuartromanek/louis/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/stuartromanek/louis-/releases/tag/v1.0.0
