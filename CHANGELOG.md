# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

How we cut releases: [docs/RELEASE.md](docs/RELEASE.md).

## [Unreleased]

### Added
- Phone editor IA below 600px: Search / Library tabs, nested card detail, Add-to-card drawer, Menu tray, toasts, and denser YouTube results (desktop/tablet two-column layout unchanged at `sm+`).
- Mobile Menu update affordances: Bell + light pink when a save is pending; IndexPointingUp + left-to-right pink progress fill while updating.
- How-to empty state and How To modal with beat art; Search Clear after submit; phone-friendly over-limit / long-track controls.
- Dirty MYO playlist draft persistence in `localStorage` (restored when the card is opened again).
- yt-dlp download outcome logs (`ok` / `fail` / `escalate` / `coalesce`) so Railway logs show whether cookies recovered after bot checks.
- In-process singleflight for concurrent downloads of the same YouTube id (preview stampede protection).

### Changed
- UI typeface is self-hosted **LT Saeada** (Regular / Medium / Bold) instead of Dongle.
- Phone chrome polish for narrow viewports (densify ≤360px / ≤310px): tab icons, result art, howto mocks, tray open animation.
- Expected anon→cookies escalate and retries log at info level (not warn/error).
- Long API errors use h3 `message` instead of `statusMessage` (avoids future sanitization warnings).

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

[Unreleased]: https://github.com/stuartromanek/louis-/compare/v1.0.0...main
[1.0.0]: https://github.com/stuartromanek/louis-/releases/tag/v1.0.0
