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

- This app stores Yoto OAuth tokens in httpOnly cookies on the server
- Self-hosters must use HTTPS in production
- Do not commit `.env`, API keys, refresh tokens, or YouTube `cookies.txt`
- The demo instance is a multi-tenant surface — treat connected Yoto accounts as sensitive
- `NUXT_YTDLP_COOKIES_FILE` (when set on any deploy) is a server secret — never expose path or contents via debug routes or API responses; prefer a throwaway Google account

## Out of scope

- Abuse of maintainer-hosted demo YouTube API quota
- User-provided fonts or sound assets without redistribution rights
