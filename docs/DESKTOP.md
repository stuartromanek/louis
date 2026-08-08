# Louis desktop app

Louis for macOS and Windows — the same Make Your Own (MYO) experience as self-hosting, without Docker. The app runs a local server on your machine and opens it in a window. yt-dlp and ffmpeg are included.

**Personal use only.** You are responsible for complying with [YouTube’s Terms of Service](https://www.youtube.com/t/terms) and applicable law when downloading audio.

Prefer containers? Use [Docker / GHCR](../README.md#docker-same-version) for the same release version.

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

### 1. Yoto developer app

1. Create a **public** (PKCE) client at [yoto.dev](https://yoto.dev/get-started/start-here/).
2. Register this redirect URI **exactly**:

   `http://127.0.0.1:4010/api/yoto/auth/callback`

3. Paste the **client ID** into the setup form. Leave the client secret empty (public PKCE).

### 2. YouTube Data API

Enable **YouTube Data API v3** in Google Cloud Console, create an API key, and paste it into the setup form.

### 3. Ready

After the redirect URI step, confirm you’re ready. Press **Let’s go** — Louis saves keys to app data and restarts the local server (in the desktop app). Then use **Connect** to sign in with Yoto — Louis opens your **system browser** (password managers work; a bad client ID leaves Louis usable so you can fix Settings).

You can change keys later under **Settings → Advanced**.

### Optional: yt-dlp cookies

Not part of first-run setup. If YouTube blocks anonymous downloads (bot check / age gate), open **Settings → Advanced** and set a Netscape `cookies.txt` path (throwaway Google account preferred; never share or commit that file).

Keys are **not** stored inside the installer. They live only in your user data folder (see below).

## Using the app

- Louis listens on **`http://127.0.0.1:4010`** (not the Docker/dev port 4000).
- Search YouTube, build a playlist, and save to your MYO cards as usual.
- Open **Settings → Advanced** anytime to update API keys or the optional cookies path.

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
Check the YouTube API key, quota, and (if needed) cookies path. Keep Louis updated — releases refresh the bundled download tools.

## More

- Self-host / Docker: [README](../README.md)
- Security reports: [SECURITY.md](../SECURITY.md)
- Maintainer shipping / signing: [DESKTOP_SHIP.md](DESKTOP_SHIP.md), [DESKTOP_SIGNING.md](DESKTOP_SIGNING.md), [RELEASE.md](RELEASE.md)
