# Bundled CLI binaries (not committed)

Downloaded by `npm run desktop:fetch-binaries` into `<platform>/`:

| File | Source |
|------|--------|
| `yt-dlp` / `yt-dlp.exe` + `_internal/` | [yt-dlp onedir zips](https://github.com/yt-dlp/yt-dlp/releases) (pinned tag in fetch script; avoid one-file builds — slow cold start) |
| `ffmpeg` / `ffmpeg.exe` | macOS: [ffmpeg.martin-riedl.de](https://ffmpeg.martin-riedl.de/); Linux/Windows: [yt-dlp/FFmpeg-Builds](https://github.com/yt-dlp/FFmpeg-Builds) |

Platform folders: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, `win32-x64`.

Packaged apps copy this tree via electron-builder `extraResources` → `resources/bin/`.
