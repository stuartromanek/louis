# Security Policy

## Supported versions

Security fixes are applied to the latest release on the default branch.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report security issues privately to the repository maintainer via GitHub Security Advisories or direct contact if you have it.

Include:

- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

## Scope notes

- This app stores Yoto OAuth tokens in httpOnly cookies on the server (self-host / Docker). The desktop app also writes tokens to `yoto-session.json` under Application Support after system-browser Connect — treat that file like a secret.
- Self-hosters should use HTTPS in production. OAuth cookies default to `Secure` when `NODE_ENV=production`; set `LOUIS_COOKIE_SECURE=false` only for intentional plain HTTP (e.g. Home Assistant LAN). Prefer `true` behind TLS / reverse proxy.
- Do not commit `.env`, API keys, refresh tokens, or YouTube `cookies.txt`
- `LOUIS_YTDLP_COOKIES_FILE` (when set on any deploy) is a server secret — never expose path or contents via debug routes or API responses; prefer a throwaway Google account
- **Desktop installers** do not embed Yoto/YouTube API keys or cookies. Credentials live in user-writable app data (`config.json` under Application Support / equivalent) via Settings. Optional yt-dlp cookies are a **user-chosen file path**, never shipped inside the DMG/NSIS
- Treat unsigned desktop builds like any other downloaded binary until release signing is enabled ([docs/DESKTOP_SIGNING.md](docs/DESKTOP_SIGNING.md))

## Out of scope

- User-provided fonts or sound assets without redistribution rights
