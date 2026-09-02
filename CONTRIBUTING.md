# Contributing

Thanks for your interest in contributing to **Louis**!

## Development setup

1. Fork and clone the repository
2. `npm install`
3. `cp .env.example .env` and fill in your own API keys (never commit `.env`)
4. Install **yt-dlp** and **ffmpeg** locally, or use Docker Compose
5. `npm run dev` — app runs at `http://localhost:4000`

## Pull requests

- Keep changes focused and minimal
- Match existing code style and naming
- Test manually: search → preview → connect Yoto → save to a test playlist
- Do not commit secrets or assets you lack rights to redistribute
- For user-facing changes, add a bullet under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md)

## Maintainer smoke (before a big release)

Automated: `npm test` and `npm run build`. Then walk on phone + desktop (and one of Desktop app / Docker / HA if announcing those):

1. **Core** — search → preview → Connect Yoto → create/open playlist → Update completes
2. **Track Art** — Icons (Yoto + yotoicons) + Draw; apply to an existing track; new track art survives Update
3. **Auto-split** — add a >55 min video → Part slats; Update downloads once and chapters correctly
4. **Trim** — scissors on YouTube / split group; keep region; re-split or collapse as expected
5. **Normalize** — opt-in at Update; only new extracts leveled
6. **Playlist artwork** — DiceBear on create; menu Artwork generate/upload/crop
7. **Save reliability** — multi-track split; normalize + split; batch Update from phone Menu
8. **Auth / env** — reconnect for `user:icons:manage`; `/api/health` shows yt-dlp + ffmpeg
9. **Narrow phone** — quick pass at ≤310px on Search / Library / Update / Menu

## Releases

Maintainers: see [docs/RELEASE.md](docs/RELEASE.md). Short version: keep notes in `[Unreleased]`, then on `main` run `npm run release` (patch / minor / major). That bumps the version, updates the changelog, tags `vX.Y.Z`, and publishes Docker Hub + GHCR images via CI.

## Reporting issues

Open a GitHub issue with:

- Steps to reproduce
- Expected vs actual behavior
- Environment (Docker vs native, OS, yt-dlp/ffmpeg versions and `ytdlpCookies` from `/api/health`)

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.
