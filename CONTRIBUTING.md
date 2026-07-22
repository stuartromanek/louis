# Contributing

Thanks for your interest in contributing to yoto-cards!

## Development setup

1. Fork and clone the repository
2. `npm install`
3. `cp .env.example .env` and fill in your own API keys (never commit `.env`)
4. Install **yt-dlp** and **ffmpeg** locally, or use Docker Compose
5. `npm run dev` — app runs at `http://localhost:4000`

## Pull requests

- Keep changes focused and minimal
- Match existing code style and naming
- Test manually: search → preview → connect Yoto → save to a test MYO card
- Do not commit secrets or assets you lack rights to redistribute
- For user-facing changes, add a bullet under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md)

## Releases

Maintainers: see [docs/RELEASE.md](docs/RELEASE.md). Short version: keep notes in `[Unreleased]`, then on `main` run `npm run release` (patch / minor / major). That bumps the version, updates the changelog, tags `vX.Y.Z`, and publishes the GHCR image via CI.

## Reporting issues

Open a GitHub issue with:

- Steps to reproduce
- Expected vs actual behavior
- Environment (Docker vs native, OS, yt-dlp/ffmpeg versions and `ytdlpCookies` from `/api/health`)

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.
