# Bundled CLI binaries (not committed)

Downloaded by `npm run desktop:fetch-binaries` into `<platform>/`. Archives are **pinned** (no floating `latest`) and verified with **SHA-256** in [`../scripts/fetch-binaries.mjs`](../scripts/fetch-binaries.mjs).

| File | Source |
|------|--------|
| `yt-dlp` / `yt-dlp.exe` + `_internal/` | [yt-dlp onedir zips](https://github.com/yt-dlp/yt-dlp/releases) (`YTDLP_TAG`) |
| `ffmpeg` / `ffmpeg.exe` | macOS: [martin-riedl](https://ffmpeg.martin-riedl.de/) versioned `/download/…`; Linux/Windows: [yt-dlp/FFmpeg-Builds](https://github.com/yt-dlp/FFmpeg-Builds) `autobuild-…` |

Platform folders: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, `win32-x64`.

Packaged apps copy this tree via electron-builder `extraResources` → `resources/bin/`.

Bump pins on breakage or before `npm run release` by editing [`../scripts/fetch-binaries.mjs`](../scripts/fetch-binaries.mjs) (see [RELEASE.md](../../../docs/RELEASE.md)).
