# Third-party assets

The application source code is licensed under the MIT License (see [LICENSE](LICENSE)).

## Fonts

**LT Saeada** (LyonsType) is self-hosted under `public/fonts/saeada/` and licensed under the [SIL Open Font License](https://openfontlicense.org). See [public/fonts/LICENSE.txt](public/fonts/LICENSE.txt) and [public/fonts/saeada/OFL.txt](public/fonts/saeada/OFL.txt).

- **LT Saeada** (Regular 400, Medium 500, Bold 700) — UI, display, and secondary text (`font-maru`, `font-maru-mega`, `font-maru-mono`)

## Emoji icons

OpenMoji SVG icons in `public/emoji/` are from Streamline/OpenMoji, licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). See [public/emoji/README.md](public/emoji/README.md).

## UI sounds

Most UI sound effects in `public/sound/` are from **[SND](https://snd.dev/)** (SND01 “sine”), designed by Yasuhiro Tsuchiya / Dentsu Inc.

- Free for personal and commercial use under the [SND Terms of Service](https://snd.dev/)
- Bundled terms: [public/sound/TERMS.md](public/sound/TERMS.md)
- Do not redistribute the `.wav` files alone in unprocessed form (see SND terms)
- Catalog / filenames: [public/sound/README.md](public/sound/README.md)

**Exception:** `public/sound/louis.wav` is a first-party Louis splash cue and is not part of the SND kit.

## External binaries

- **yt-dlp** — YouTube audio download ([yt-dlp](https://github.com/yt-dlp/yt-dlp))
- **ffmpeg** — required for save flow audio extraction (via yt-dlp `-x`)

**Docker / native server:** install via `apt` or put them on `PATH` (see `.env.example` for `LOUIS_YTDLP_PATH`).

**Desktop (Electron):** `npm run desktop:fetch-binaries` downloads platform builds into `desktop/resources/bin/` (not committed). macOS ffmpeg from [ffmpeg.martin-riedl.de](https://ffmpeg.martin-riedl.de/); Linux/Windows ffmpeg from [yt-dlp/FFmpeg-Builds](https://github.com/yt-dlp/FFmpeg-Builds).
