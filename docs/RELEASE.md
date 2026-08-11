# Releases

Versioning uses [SemVer](https://semver.org/), [Keep a Changelog](https://keepachangelog.com/), and [`release-it`](https://github.com/release-it/release-it) with the [`@release-it/keep-a-changelog`](https://github.com/release-it/keep-a-changelog) plugin.

The app version shown in Settings (`Louis v…`) comes from `package.json` via `runtimeConfig.public.appVersion`.

Pushing a tag matching `v*` runs [`.github/workflows/release.yml`](../.github/workflows/release.yml), which:

1. Publishes a **multi-arch** Docker image to GHCR (`:latest` and `:{tag}` for `linux/amd64` + `linux/arm64`)
2. Builds macOS DMGs (arm64 + x64) and Windows NSIS Setup
3. Uploads those installers as **Assets** on the same GitHub Release created by `release-it`

### Desktop artifacts

Installer filenames (from `electron-builder.yml`):

- `Louis-<version>-arm64.dmg` / `Louis-<version>-x64.dmg`
- `Louis-Setup-<version>.exe`

Local parity (does **not** replace `npm run release`):

```bash
npm run desktop:build:host   # this Mac only
npm run desktop:build:mac    # both mac DMGs
npm run desktop:build:win    # NSIS (on Windows or with wine)
npm run desktop:build        # mac + win in one go (awkward cross-OS)
```

Signing: [DESKTOP_SIGNING.md](DESKTOP_SIGNING.md). CI currently ships **unsigned** installers until signing secrets + config overrides are wired.

## Day to day

1. Land changes on `main` through PRs as usual.
2. Append notable user-facing notes under `## [Unreleased]` in [`CHANGELOG.md`](../CHANGELOG.md) (Added / Changed / Fixed / Removed). Do **not** bump `package.json` on every merge.
3. When you are ready to ship a release, cut it with `release-it` (below).

## Cut a release

Prerequisites:

- Clean working tree on `main`, up to date with `origin/main`
- `[Unreleased]` in `CHANGELOG.md` has the notes for this release (can be empty only if you intend a no-notes bump)
- `gh` authenticated if you want the GitHub Release created automatically (`gh auth status`)
- **Desktop pins:** consider bumping `YTDLP_TAG` / ffmpeg pins + SHA-256 in [`desktop/scripts/fetch-binaries.mjs`](../desktop/scripts/fetch-binaries.mjs) before cutting. Not required every release if current pins still work.

```bash
git checkout main
git pull
npm run release          # interactive: pick patch / minor / major
# or non-interactive:
npm run release -- patch
npm run release -- minor
npm run release -- major
```

What `npm run release` does:

1. Bumps `package.json` / `package-lock.json` version (`desktop:sync-version` runs in CI so `desktop/package.json` matches)
2. Moves `[Unreleased]` → `[x.y.z] - YYYY-MM-DD`, adds compare links, and leaves a fresh empty `[Unreleased]`
3. Commits with `chore(release): vX.Y.Z`
4. Creates git tag `vX.Y.Z`
5. Pushes commit + tag to `origin`
6. Creates a GitHub Release for that tag
7. Tag push triggers [`.github/workflows/release.yml`](../.github/workflows/release.yml): GHCR **and** desktop installer Assets

Dry run (no commit / tag / push):

```bash
npm run release -- --dry-run
```

## Choosing patch / minor / major

| Bump | Use when |
|------|----------|
| **patch** | Bug fixes, copy, polish, small non-breaking tweaks |
| **minor** | New features backward-compatible with current deploys |
| **major** | Breaking changes (API, env, Docker contract, data layout) |

Example: splash + welcome modal + auth gate redesign → **minor** (e.g. `0.1.0` → `0.2.0`).

## After release

Checklist for tag `vX.Y.Z`:

- [ ] GitHub Action **Release** workflow succeeded (all jobs green)
- [ ] GHCR image exists: `ghcr.io/<org>/louis:vX.Y.Z` and `:latest` (**amd64 + arm64** manifest)
- [ ] Release page `…/releases/tag/vX.Y.Z` lists under **Assets**:
  - `Louis-X.Y.Z-arm64.dmg`
  - `Louis-X.Y.Z-x64.dmg`
  - `Louis-Setup-X.Y.Z.exe`
- [ ] If the Home Assistant add-on pin changed: bump `homeassistant/louis/config.yaml` `version` and `Dockerfile` `FROM …:vX.Y.Z` to match
- [ ] Deploy that tag on Railway (or your host) when you want a pinned Docker version; `:latest` tracks the newest tagged release
- [ ] Start the next cycle by writing new bullets under `[Unreleased]` again

## Config

See [`.release-it.json`](../.release-it.json). Notable choices:

- `npm.publish: false` — this app is not published to the npm registry
- `git.requireBranch: main` — releases only from `main`
- `github.release: true` — creates a GitHub Release; needs `GH_TOKEN` / `gh` auth locally
- Keep a Changelog plugin: `addUnreleased: true`, `addVersionUrl: true`
