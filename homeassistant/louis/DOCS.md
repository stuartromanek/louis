# Louis Home Assistant add-on

Louis as a Supervisor add-on: same app as Docker/GHCR, configured via **Options** (no hand-edited `.env`).

## Install

1. **Settings → Add-ons → Add-on store → ⋮ → Repositories**
2. Add: `https://github.com/stuartromanek/louis`
3. Refresh the store, install **Louis**, then open **Configuration**

> Sources: `homeassistant/louis/` in this repo. Root `repository.yaml` and `louis/` are symlinks so Supervisor (which expects those at the git root) can discover the add-on when you add `https://github.com/stuartromanek/louis`.

## Configuration

| Option | Purpose |
| ------ | ------- |
| **yoto_client_id** | Public Yoto PKCE client ID (defaults to Louis’s bundled public client) |
| **youtube_api_key** | Recommended Google Cloud YouTube Data API v3 key (faster search). Leave empty to search without a key |
| **youtube_safe_search** | Content filtering for typed search when **youtube_api_key** is set: `none`, `moderate` (default), or `strict` |
| **yoto_redirect_uri** | Must match a redirect URI on [yoto.dev](https://yoto.dev/get-started/start-here/) |
| **cookie_secure** | OAuth `Secure` cookies. Default **false** for typical LAN HTTP. Set **true** behind HTTPS / Nabu Casa / a TLS reverse proxy |
| **ytdlp_cookies_file** | Optional path *inside the container* to a Netscape `cookies.txt` (only if you mount/copy one under `/data`) |
| **audio_cache_max_age_ms** / **audio_cache_max_bytes** | Optional audio cache limits (passed through as `LOUIS_AUDIO_*`) |

Audio cache and jobs persist under the add-on data volume at `/data/audio`.

## Yoto redirect URI

Register the **exact** redirect you put in Options, for example:

```text
http://homeassistant.local:4000/api/yoto/auth/callback
```

or your HTTPS public URL if you terminate TLS in front of port 4000.

Open Louis at `http://homeassistant.local:4000` (or your host:port). **Do not use Home Assistant ingress** for v1 — path/host rewriting breaks Yoto OAuth and cookie auth.

## cookie_secure

Docker/`NODE_ENV=production` would otherwise force Secure cookies, which browsers refuse on plain `http://`. This add-on sets `LOUIS_COOKIE_SECURE` from the **cookie_secure** option (default `false`). Turn it on when you only serve Louis over HTTPS.

## After install

1. Start the add-on and confirm **Log** shows Nitro listening on port 4000  
2. Open the UI on port **4000**  
3. Connect Yoto and search YouTube  

Requires a multi-arch GHCR image (`linux/amd64` + `linux/arm64`) published on each `v*` release — Pi / Yellow / most appliances need arm64.
