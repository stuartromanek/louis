# Third-party assets

The application source code is licensed under the MIT License (see [LICENSE](LICENSE)).

## Fonts

[Dongle](https://fonts.google.com/specimen/Dongle) is bundled in `public/fonts/` under the [SIL Open Font License](https://openfontlicense.org). See [public/fonts/LICENSE.txt](public/fonts/LICENSE.txt).

- **Dongle** — UI, display, and secondary text (`font-maru`, `font-maru-mega`, `font-maru-mono`)

## Emoji icons

OpenMoji SVG icons in `public/emoji/` are from Streamline/OpenMoji, licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). See [public/emoji/README.md](public/emoji/README.md).

## UI sounds

UI sound effects in `public/sound/` are from **[SND](https://snd.dev/)** (SND01 “sine”), designed by Yasuhiro Tsuchiya / Dentsu Inc.

- Free for personal and commercial use under the [SND Terms of Service](https://snd.dev/)
- Bundled terms: [public/sound/TERMS.md](public/sound/TERMS.md)
- Do not redistribute the `.wav` files alone in unprocessed form (see SND terms)
- Catalog / filenames: [public/sound/README.md](public/sound/README.md)

## External binaries (not bundled in npm)

- **yt-dlp** — YouTube audio download ([yt-dlp](https://github.com/yt-dlp/yt-dlp))
- **ffmpeg** — required for save flow audio extraction (via yt-dlp `-x`)

Docker images install these via `apt`. Native installs must provide them on `PATH`.
