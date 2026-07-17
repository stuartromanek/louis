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
- Do not commit `.env`, API keys, or refresh tokens
- The demo instance is a multi-tenant surface — treat connected Yoto accounts as sensitive

## Out of scope

- Abuse of maintainer-hosted demo YouTube API quota
- User-provided fonts or sound assets without redistribution rights
