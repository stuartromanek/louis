# Desktop ship checklist

Ordered path from the Electron spike → merge → **one** GitHub Release that carries both Docker (GHCR) and desktop installers. Work **one phase per PR** when possible. Quote a single phase to spawn a Cursor sub-plan.

Research background: [DESKTOP.md](DESKTOP.md). Cut releases: [RELEASE.md](RELEASE.md).

## Locked defaults

| Topic | Choice |
|--------|--------|
| First public cut | macOS (arm64 + x64) + Windows x64 |
| Linux | Phase 7 stretch (AppImage on the same Release) |
| Credentials | userData config + Preferences / first-run UI (never baked into the binary) |
| Packager | electron-builder |
| Port | `127.0.0.1:4010` |
| Yoto redirect | `http://127.0.0.1:4010/api/yoto/auth/callback` |
| yt-dlp / ffmpeg | Bundled via `extraResources` |
| Publish | Same `npm run release` / `v*` tag as today — installers attach to that Release |

---

## Publish story (seamless)

### Today (operator muscle memory — keep this)

```text
main → npm run release
  → bump package.json + CHANGELOG
  → tag vX.Y.Z + push
  → release-it creates GitHub Release
  → tag push runs .github/workflows/release.yml
  → GHCR: :latest + :vX.Y.Z
```

### Target (one release, two channels)

```text
npm run release  →  tag vX.Y.Z  →  GitHub Release (notes)
                         ├─ CI Docker job     → GHCR :latest + :vX.Y.Z
                         ├─ CI Electron macOS → upload *.dmg to that Release
                         └─ CI Electron Windows → upload Setup.exe to that Release
```

### Where users get desktop builds — the GitHub Release page

For tag `v1.2.0`, open `…/releases/tag/v1.2.0`:

- Release notes (CHANGELOG / release-it)
- **Assets** (download buttons): e.g. `Louis-1.2.0-arm64.dmg`, `Louis-1.2.0-x64.dmg`, `Louis-Setup-1.2.0.exe` (later AppImage)
- GHCR is **not** a file on that page — README links `docker pull ghcr.io/…:v1.2.0` beside “Download for Mac/Windows”

**OS installers = Release Assets.** Docker = GHCR tags with the **same** `vX.Y.Z`. One Release page is the consumer front door for desktops.

### How CI fills that page

1. `npm run release` creates the GitHub Release for `vX.Y.Z` (notes; desktop files may arrive seconds later).
2. Tag push runs [`.github/workflows/release.yml`](../.github/workflows/release.yml): Docker → GHCR; desktop jobs build installers and `gh release upload vX.Y.Z <files>` (or equivalent) onto **that** Release.
3. Assets appear under the Release **Assets** list when CI finishes.

### Seamlessness rules

1. **One version** — `package.json` = Preferences “Louis v…” = Docker tag = installer filenames on the Release page.
2. **One command** — maintainers only run `npm run release` on `main` (see [RELEASE.md](RELEASE.md)). No desktop-only version ritual.
3. **One GitHub Release page** — release-it creates it; CI attaches DMG/NSIS as Assets. Workflow needs `contents: write` + `packages: write` (see [`.github/workflows/release.yml`](../.github/workflows/release.yml)).
4. **One workflow trigger** — extend existing `on: push: tags: v*`. No second tag scheme.
5. **Same changelog** — desktop bullets under the same version section that backs Release notes.
6. **Complementary channels** — Release Assets = desktop; GHCR = self-host.

---

## Phase 0 — Spike baseline (no merge to main)

**Goal:** Finish the working Electron spike on branch `desktop-electron` — **do not merge to `main` yet.** Later phases stack on this branch; one merge when desktop is ready (see Phase 6).

**Touches:** `desktop/`, `package.json` (electron, `desktop:spike`), [DESKTOP.md](DESKTOP.md), `.gitignore`

**Do:**

- [x] Spike host on `desktop-electron` (`desktop/main.mjs`, `preload.cjs`, README) — keep work on this branch until later phases
- [x] Confirm `npm run build && npm run desktop:spike` on maintainer macOS
- [x] Document spike-only limits (system PATH yt-dlp/ffmpeg, repo `.env`)

**Acceptance:** Health OK, UI loads, quit leaves port 4010 clear. No electron-builder yet. _(Verified 2026-08-06 on macOS arm64.)_ Not merged to `main`.

**Exit →** Phase 1 (same branch)

---

## Phase 1 — Production Electron host

**Goal:** Packaged-ready host that runs Nitro from app resources, not only a git checkout.

**Touches:** `desktop/main.mjs`, electron-builder config (early), app icons, productName

**Do:**

- [x] Resolve `.output` for dev vs packaged (`process.resourcesPath` when packaged; repo root in spike)
- [x] Spawn Nitro with `ELECTRON_RUN_AS_NODE=1` on the Electron binary (no second Node runtime)
- [x] Set productName **Louis**, icons, `userData` under Louis (not “Electron”)
- [x] Single-instance lock; loading UI until `/api/health`; dialog if Nitro exits unexpectedly
- [x] Local smoke: `electron-builder --dir` (or equivalent unpackaged build) boots UI

**Acceptance:** Unpackaged built app launches Louis UI without requiring the repo tree layout of a spike. ✅ (2026-08-06, macOS arm64 — `desktop/out/mac-arm64/Louis.app`; health + `/` 200; `userData` → `~/Library/Application Support/Louis`)

**Exit →** Phase 2

---

## Phase 2 — Bundle yt-dlp + ffmpeg

**Goal:** Consumers need no Homebrew / system ffmpeg.

**Touches:** `desktop/resources/bin/<platform>/`, download script, spawn env in `desktop/main.mjs`, `server/utils/system-deps.ts` / `youtube-download.ts` (env only)

**Do:**

- [x] CI/script downloads platform binaries into `desktop/resources/bin/<platform>/`
- [x] Ship via electron-builder `extraResources`
- [x] At spawn: set `NUXT_YTDLP_PATH`; prepend ffmpeg dir to `PATH`
- [x] Keep `NUXT_AUDIO_WORK_DIR` under Electron `userData`

**Acceptance:** On a machine **without** Homebrew yt-dlp/ffmpeg, `/api/health` reports both available via bundled paths; preview download works. ✅ (2026-08-06, macOS arm64 — spike + packaged `Louis.app` health under `…/Resources/bin/darwin-arm64/`; preview `jNQXAC9IVRw` → 200 WebM)

**Exit →** Phase 3

---

## Phase 3 — Credentials + OAuth

**Goal:** Full connect + search without a repo-root `.env`.

**Touches:** userData config JSON, Preferences / first-run UI, spawn env (`NUXT_YOTO_*`, `NUXT_YOUTUBE_API_KEY`, redirect URI)

**Do:**

- [x] Persist client id + YouTube API key (and optional cookies path) under `userData`
- [x] Minimal first-run or Preferences fields (prefer existing Preferences patterns)
- [x] Always set `NUXT_YOTO_REDIRECT_URI=http://127.0.0.1:4010/api/yoto/auth/callback` when spawning Nitro
- [x] Document Yoto portal registration for that redirect in DESKTOP.md / README

**Acceptance:** OAuth connect + YouTube search succeed with only in-app config (no checkout `.env`). ✅ (2026-08-06 — `userData/config.json` → configured auth + YouTube search 200; redirect forced to `127.0.0.1:4010`; `NUXT_PUBLIC_DESKTOP=1`. Full OAuth browser round-trip: register that URI in the Yoto portal and Connect in-app.)

**Exit →** Phase 4

---

## Phase 4 — Installers (electron-builder)

**Goal:** Distributable DMG / NSIS that pass clean-machine smoke.

**Touches:** electron-builder config, icons, signing docs

**Do:**

- [x] Targets: macOS DMG (arm64 + x64), Windows NSIS x64
- [x] Document code signing / notarization secrets for CI (unsigned `--dir` OK for local smoke)
- [x] Filenames include version: `Louis-<version>-*.dmg`, `Louis-Setup-<version>.exe`

**Acceptance:** Install on clean macOS + Windows VMs; app launches; Phases 2–3 still work. ✅ Host unsigned DMG smoke 2026-08-06 (`Louis-1.0.0-arm64.dmg` mounts; `.output` + `bin/darwin-arm64` present). Full clean-VM + Windows NSIS matrix → Phase 5/6 CI.

**Local:** `npm run desktop:build:host` (unsigned host DMG) · `npm run desktop:build` (full matrix, unsigned) · signing notes: [DESKTOP_SIGNING.md](DESKTOP_SIGNING.md)

**Exit →** Phase 5

---

## Phase 5 — Release pipeline (seamless publish)

**Goal:** Tag push fills the GitHub Release **Assets** list and GHCR — same ritual as today.

**Touches:** [`.github/workflows/release.yml`](../.github/workflows/release.yml), [RELEASE.md](RELEASE.md), optional `npm run desktop:build`

**Do:**

- [x] Keep existing Docker / GHCR job
- [x] Add macOS + Windows desktop jobs on `v*` tags
- [x] Set `permissions: contents: write` + `packages: write`
- [x] Upload installers to the Release for `github.ref_name` (`softprops/action-gh-release`)
- [x] Update RELEASE.md after-release checklist: confirm GHCR **and** Release Assets
- [x] Optional `desktop:build` / `desktop:build:mac` / `desktop:build:win` for local/CI parity — **does not** replace `npm run release`

**Acceptance:** After a `v*` tag: open `…/releases/tag/vX.Y.Z` and see DMG + NSIS under Assets; GHCR has `:vX.Y.Z` / `:latest`. ✅ Workflow wired in [`.github/workflows/release.yml`](../.github/workflows/release.yml) (verify on next `npm run release` / `v*` tag).

**Exit →** Phase 6

---

## Phase 6 — Docs, changelog, merge readiness

**Goal:** Ship messaging matches the dual-channel Release.

**Touches:** README, CHANGELOG, DESKTOP.md, SECURITY.md as needed

**Do:**

- [x] README: “Download” → latest Release Assets; “Docker” → GHCR for the same version
- [x] CHANGELOG Unreleased (then versioned) desktop feature bullets
- [x] Security: no API keys / cookies in binaries; cookies path is user-controlled
- [x] Mark Phases 0–5 complete in this checklist

**Acceptance:** Phases 0–5 done on `desktop-electron`; open PR to merge into `main` for the first desktop-bearing release. ✅ Docs ready — next: PR → `main`, then `npm run release`.

**Exit →** Phase 7 (stretch) or stop at first public desktop release

---

## Phase 7 — Stretch (post-first-publish)

**Goal:** Extra platforms / polish without changing the publish ritual.

**Do:**

- [ ] Linux AppImage job on the same `v*` workflow → same Release Assets list
- [ ] Auto-update from GitHub Releases (same tags)
- [ ] Install / first-run UX polish

**Acceptance:** New assets appear on the same Release page; versioning unchanged.

---

## How to use this doc

Each phase has **Goal**, **Touches**, **Do**, **Acceptance**, **Exit → next**. Prefer one phase per PR. Phase 5 owns the publish story; earlier phases must not invent alternate versioning or a second Releases feed.
