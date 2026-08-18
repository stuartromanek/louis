import type { H3Event } from 'h3'
import {
  clearPkceVerifierCookie,
  exchangeCodeForTokens,
  getPkceVerifierCookie,
  getYotoAuthFlow,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  setScopeCookie,
} from '../../../utils/yoto-auth'
import { getYotoConfig } from '../../../utils/yoto'
import {
  isDesktopAuthMode,
  takePendingPkce,
  writeYotoDesktopSession,
} from '../../../utils/yoto-desktop-session'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Browser OAuth returns to `/` with this query; the auth gate reads it. */
type BrowserOAuthFlag = 'connected' | 'expired' | 'denied' | 'failed'

function externalDoneHtml(ok: boolean, message: string) {
  const title = ok ? 'Connected to Yoto' : 'Yoto sign-in failed'
  const hint = ok
    ? 'You can close this tab and return to Louis.'
    : 'Close this tab, then try Connect again from Louis.'
  const safeMessage = escapeHtml(message)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 3rem auto; padding: 0 1.25rem; line-height: 1.45; color: #111; }
    h1 { font-size: 1.35rem; margin: 0 0 0.75rem; }
    p { margin: 0.5rem 0; color: #333; }
    .msg { color: #666; font-size: 0.95rem; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="msg">${safeMessage}</p>
  <p>${hint}</p>
</body>
</html>`
}

function finishOAuth(
  event: H3Event,
  options: { useHtml: boolean; ok: boolean; message: string; flag: BrowserOAuthFlag },
) {
  if (options.useHtml) {
    setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
    return externalDoneHtml(options.ok, options.message)
  }
  return sendRedirect(event, `/?yoto=${options.flag}`)
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = String(query.code ?? '').trim()
  const error = String(query.error ?? '').trim()
  const state = String(query.state ?? '').trim()
  const pending = state ? takePendingPkce(state) : null
  const external = Boolean(pending?.external)
  const failInHtml = external || isDesktopAuthMode()

  if (error) {
    const description = String(query.error_description ?? error)
    return finishOAuth(event, {
      useHtml: failInHtml,
      ok: false,
      message: `Yoto authorization failed: ${description}`,
      flag: 'denied',
    })
  }

  if (!code) {
    return finishOAuth(event, {
      useHtml: failInHtml,
      ok: false,
      message: 'Missing authorization code from Yoto.',
      flag: 'failed',
    })
  }

  const config = getYotoConfig(event)
  const flow = getYotoAuthFlow(config)
  const verifier = flow === 'public-pkce'
    ? (pending?.verifier || getPkceVerifierCookie(event))
    : undefined

  if (flow === 'public-pkce' && !verifier) {
    return finishOAuth(event, {
      useHtml: failInHtml,
      ok: false,
      message: 'OAuth session expired. Try Connect again from Louis.',
      flag: 'expired',
    })
  }

  try {
    const tokens = await exchangeCodeForTokens(config, code, verifier)

    setAccessTokenCookie(event, tokens.access_token, tokens.expires_in)
    if (tokens.refresh_token) {
      setRefreshTokenCookie(event, tokens.refresh_token)
    }
    setScopeCookie(event, tokens.scope)

    if (flow === 'public-pkce') {
      clearPkceVerifierCookie(event)
    }

    if (isDesktopAuthMode()) {
      writeYotoDesktopSession({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || '',
        scope: tokens.scope || '',
        accessExpiresAt: Date.now() + Math.max(tokens.expires_in - 60, 60) * 1000,
      })
    }

    return finishOAuth(event, {
      useHtml: external || (isDesktopAuthMode() && Boolean(pending?.external)),
      ok: true,
      message: 'Louis is signed in with your Yoto account.',
      flag: 'connected',
    })
  }
  catch (err: unknown) {
    if (flow === 'public-pkce') {
      clearPkceVerifierCookie(event)
    }
    const message = err instanceof Error ? err.message : 'Token exchange failed'
    return finishOAuth(event, {
      useHtml: failInHtml,
      ok: false,
      message,
      flag: 'failed',
    })
  }
})
