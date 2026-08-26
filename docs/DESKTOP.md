# Louis desktop app

Louis for macOS and Windows — the same Make Your Own (MYO) experience as self-hosting, without Docker. The app runs a local server on your machine and opens it in a window. yt-dlp and ffmpeg are included.

**Personal use only.** You are responsible for complying with [YouTube’s Terms of Service](https://www.youtube.com/t/terms) and applicable law when downloading audio.

Prefer containers? Use [Docker Hub / GHCR](../README.md#docker-same-version) for the same release version (`stuartromanek/louis` or `ghcr.io/stuartromanek/louis`).

## Download

Installers are attached to each GitHub Release (same `vX.Y.Z` as the Docker image):

**[Latest release](https://github.com/stuartromanek/louis/releases/latest)**

| Platform | File |
|----------|------|
| macOS Apple Silicon | `Louis-<version>-arm64.dmg` |
| macOS Intel | `Louis-<version>-x64.dmg` |
| Windows | `Louis-Setup-<version>.exe` |

Builds are currently **unsigned**. macOS Gatekeeper or Windows SmartScreen may warn the first time you open the app — that is expected until release signing is enabled.

## First-time setup

On first launch (or whenever required keys are missing), Louis plays the splash, then walks through a **setup wizard** on the same background — one question at a time. Use **Back** to go to the previous step. The last screen confirms you’re ready; **Let’s go** saves and opens the app. The main app stays blocked until you finish.

### 1. Yoto client

Prefer **Use default client** in the setup wizard (or later under **Settings → Advanced**). That prefills Louis’s bundled public PKCE client ID — the desktop redirect URI is already registered on Louis’s Yoto app.

To bring your own instead:

1. Create a **public** (PKCE) client at [yoto.dev](https://yoto.dev/get-started/start-here/).
2. Register this redirect URI **exactly**:

   `http://127.0.0.1:4010/api/yoto/auth/callback`

3. Paste the **client ID** into the setup form (or Settings). Leave the client secret empty (public PKCE).

### 2. YouTube API key (recommended, skippable)

Paste a YouTube Data API v3 key for faster search and moderate safeSearch on typed search (Google Cloud Console). **Skip** continues without a key — bundled yt-dlp still searches (slower, no safeSearch). You can add a key later under **Settings → Advanced**.

### 3. Ready

If you used Louis’s default client, the wizard skips the OAuth redirect step (already registered). With your own client, you’ll see the redirect URI to register first. Then confirm you’re ready and press **Let’s go** — Louis saves keys to app data and restarts the local server (in the desktop app). Then use **Connect** to sign in with Yoto — Louis opens your **system browser** (password managers work; a bad client ID leaves Louis usable so you can fix Settings).

You can change keys later under **Settings → Advanced** (including switching between Louis’s default Yoto client and your own).

### Optional: yt-dlp cookies

Not part of first-run setup. If YouTube blocks anonymous downloads (bot check / age gate), open **Settings → Advanced** and set a Netscape `cookies.txt` path (throwaway Google account preferred; never share or commit that file).

Louis may ship its **public** Yoto PKCE client ID inside the app. A **YouTube API key** (if you set one), OAuth tokens, and cookies stay only in your user data folder (see below) — never baked into the installer as secrets.

A YouTube Data API key is **recommended** (faster search, moderate safeSearch on typed search). Skip or leave empty to search with bundled yt-dlp. Add or change the key later under **Settings → Advanced**.

## Using the app

- Louis listens on **`http://127.0.0.1:4010`** (not the Docker/dev port 4000).
- Search YouTube, build a playlist, and save to Yoto as usual.
- Open **Settings → Advanced** anytime to update API keys, **Search content filtering** (none / moderate / strict; requires a YouTube API key), or the optional cookies path.

## Where settings are stored

| OS | Folder |
|----|--------|
| macOS | `~/Library/Application Support/Louis/` |
| Windows | `%APPDATA%\Louis\` |

Important files:

- `config.json` — API keys and optional cookies path (written by Settings)
- `yoto-session.json` — Yoto OAuth tokens after Connect (system-browser flow)
- `audio/` — download / transcode work directory

You normally do not need to edit `config.json` by hand. Shape if you inspect it:

```json
{
  "yotoClientId": "",
  "yotoClientSecret": "",
  "youtubeApiKey": "",
  "youtubeSafeSearch": "moderate",
  "ytdlpCookiesFile": ""
}
```

`yotoClientSecret` is unused for the recommended public PKCE flow and is not shown in Settings.

## Troubleshooting

**Gatekeeper / SmartScreen blocks the app**  
Unsigned builds: open via system “Open anyway” / “More info → Run anyway”, or wait for signed releases.

**Settings has no Desktop API keys section**  
That section appears in the desktop app (**Settings → Advanced**). In local `npm run dev`, open `http://localhost:4000/?desktopPrefs=1` to preview Advanced prefs (and `?desktopPrefs=1&desktopSetup=1` for the first-run setup screen). Mock saves use sessionStorage. Self-host / Docker still use `.env` with `LOUIS_*` keys (legacy `NUXT_*` still works). The Electron host sets `LOUIS_PUBLIC_DESKTOP=1` when spawning Nitro.

**Still logged into Yoto after clearing the client ID**  
Sign-in uses browser cookies for `127.0.0.1:4010`. Clearing Settings does not clear those cookies. Disconnect in the app or clear site data for that origin if you need a full reset.

**OAuth redirect errors**  
Confirm the Yoto portal redirect URI is exactly `http://127.0.0.1:4010/api/yoto/auth/callback` (loopback `127.0.0.1`, port **4010**). Desktop Connect uses your system browser; after success, close that tab and return to Louis (the app polls until signed in).

**Search or download failures**  
Search does not need a YouTube API key (yt-dlp). If you set one, check quota. For downloads, try cookies path if YouTube blocks anonymous extract. Keep Louis updated — releases refresh the bundled download tools.

## More

- Self-host / Docker: [README](../README.md)
- Security reports: [SECURITY.md](../SECURITY.md)
- Maintainer shipping / signing: [DESKTOP_SHIP.md](DESKTOP_SHIP.md), [DESKTOP_SIGNING.md](DESKTOP_SIGNING.md), [RELEASE.md](RELEASE.md)
