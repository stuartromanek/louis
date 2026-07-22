# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

How we cut releases: [docs/RELEASE.md](docs/RELEASE.md).

## [Unreleased]

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
