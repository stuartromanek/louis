# Roadmap

Ideas and planned work for **Louis**. Order is not a commitment; priorities may shift.

Louis edits **playlists**. Linking a playlist to a physical Make Your Own card stays in the Yoto app.

## Planned

### [Yoto Icons](https://yotoicons.com/) integration

~~Browse and apply community 16×16 pixel icons from [yotoicons.com](https://yotoicons.com/) when editing playlists / tracks (Yoto `display.icon16x16`).~~ — **done** (Track Art Editor → Icons tab: Yoto public + yotoicons.com search).

### Pixel art editor

~~In-app 16×16 editor for custom Yoto display icons — draw or tweak pixel art, then save as the track/chapter icon alongside the playlist.~~ — **done** (Track Art Editor → Draw tab).

### Auto long-track split

~~When a YouTube source exceeds Yoto’s per-track duration cap (~1 hour), automatically split it into sequential playlist tracks (e.g. Part 1 / Part 2) on extract/save so long podcasts and albums still fit.~~ — **done**: sources over 55 minutes expand into connected playlist slats on add; save downloads once and ffmpeg-splits into MYO chapters.

### Home Assistant add-on

~~Package Louis as a [Home Assistant](https://www.home-assistant.io/) add-on so users can install and run it from their HA instance (config via add-on options, data volume for the audio work dir).~~ — **done**: see [homeassistant/louis/DOCS.md](homeassistant/louis/DOCS.md). Requires multi-arch GHCR (`amd64` + `arm64`) on `v*` releases.

### Docker Hub (and image registries)

Publish official images beyond GHCR — e.g. Docker Hub — so `docker pull` / compose examples work from the registries people already use. Confirm whether GHCR alone is enough or multi-registry release is worth the maintenance.

### Other hosting / “one-click” images

Explore pre-canned deploy targets that consume container images (Railway templates, Coolify, CasaOS / Umbrel-style app stores, etc.) so self-hosters can spin Louis up without hand-rolling compose.

### Horizontal Playlists scrolling

~~Investigate and fix horizontal scrolling in the Playlists carousel~~ — **done**: continuous wheel/drag pan (no snap), thin scrollbar, keyboard arrows; fan metaphor kept.

### Smartphone-centric UI

~~Phone layout for the three-panel editor~~ — **done**: below 600px, Search / Library tabs with nested playlist detail, Add to playlist drawer, phone header (Update + menu); denser YouTube rows; desktop/tablet two-column grid unchanged at `sm+`.

### “Add to Desktop” in mobile menu

~~Install / “Add to Home Screen” affordance in the phone overflow menu (uses the browser install prompt / platform instructions). Manifest + apple web-app meta already target standalone; this is the in-app entry point.~~ — **done**: phone Menu + tablet/desktop status bar; native `beforeinstallprompt` when available, otherwise a persistent toast with Share / Install steps (top on iOS so Safari’s Share control stays clear). Swan favicons + manifest icons.

### Resume pending playlist edits

~~Persist dirty playlist drafts across refresh~~ — **done**: pending (and live dirty) drafts are stored in `localStorage` and restored when the playlist is opened again.

### YouTube chapters → tracks

Optional per-result toggle to expand YouTube chapters into separate playlist tracks. Must compose cleanly with auto 55-minute long-track splitting (same `split` time-range fields).

### Desktop app wrapper (Electron)

~~Package Louis as a cross-OS executable~~ — **done**: Electron host, bundled yt-dlp/ffmpeg, Settings credentials, DMG/NSIS on the same `v*` Release as GHCR. See [docs/DESKTOP.md](docs/DESKTOP.md) and [docs/DESKTOP_SHIP.md](docs/DESKTOP_SHIP.md). Stretch: Linux AppImage, auto-update, signed builds.

### Experiment with yt-dlp search backend

~~Spike replacing YouTube Data API v3 search/metadata with bundled/`PATH` yt-dlp (`ytsearch` + `--flat-playlist`) so desktop users need no Google Cloud API key. Keep the existing `/api/youtube/search` response shape; optional Data API fallback for self-host.~~ — **done**: `/api/youtube/*` uses bundled yt-dlp when `LOUIS_YOUTUBE_API_KEY` is unset; Data API remains an optional fallback. Desktop first-run no longer requires a YouTube key.

### Audio trim

Cut intros/outros (and similar) before save. Non-trivial UX; trim points per track in the playlist editor.

### YouTube URL paste

~~Paste a video, Shorts, public playlist, or channel URL in Search to load it (playlist `list=` wins over a watch URL’s `v=`). Check rows to add them as a group.~~ — **done**.

### Playlist create, rename, and delete

~~Name a new playlist before tracks can be added; confirming the name creates it on Yoto immediately (empty, or with tracks already picked in Search). Rename / Delete from the playlist header menu.~~ — **done**.

### Playlist artwork

~~Generate DiceBear covers for playlists: auto-applied on create, and Artwork in the playlist menu (generate / history / save).~~ — **done**.

## Done / shipped

Tracked in git history, [CHANGELOG.md](CHANGELOG.md), and the README feature list rather than here. Recent unreleased highlights: normalize new YouTube extracts at Update, batch Update of dirty playlists from Menu, duplicate-track toast, Yoto playlist nomenclature (Playlists / New playlist; physical MYO linking stays in the Yoto app).
