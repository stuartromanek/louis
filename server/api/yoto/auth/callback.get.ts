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

function externalDoneHtml(ok: boolean, message: string) {
  const title = ok ? 'Connected to Yoto' : 'Yoto sign-in failed'
  const hint = ok
    ? 'You can close this tab and return to Louis.'
    : 'Close this tab, then fix your Yoto client ID in Louis → Settings → Advanced.'
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

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = String(query.code ?? '').trim()
  const error = String(query.error ?? '').trim()
  const state = String(query.state ?? '').trim()
  const pending = state ? takePendingPkce(state) : null
  const external = Boolean(pending?.external)

  if (error) {
    const description = String(query.error_description ?? error)
    if (external || isDesktopAuthMode()) {
      setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
      return externalDoneHtml(false, `Yoto authorization failed: ${description}`)
    }
    throw createError({
      statusCode: 401,
      message: `Yoto authorization failed: ${description}`,
    })
  }

  if (!code) {
    if (external || isDesktopAuthMode()) {
      setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
      return externalDoneHtml(false, 'Missing authorization code from Yoto.')
    }
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing authorization code from Yoto',
    })
  }

  const config = getYotoConfig(event)
  const flow = getYotoAuthFlow(config)
  const verifier = flow === 'public-pkce'
    ? (pending?.verifier || getPkceVerifierCookie(event))
    : undefined

  if (flow === 'public-pkce' && !verifier) {
    if (external || isDesktopAuthMode()) {
      setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
      return externalDoneHtml(false, 'OAuth session expired. Try Connect again from Louis.')
    }
    throw createError({
      statusCode: 400,
      statusMessage: 'OAuth session expired. Please try connecting again.',
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

    if (external || (isDesktopAuthMode() && pending?.external)) {
      setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
      return externalDoneHtml(true, 'Louis is signed in with your Yoto account.')
    }

    return sendRedirect(event, '/?yoto=connected')
  }
  catch (err: unknown) {
    if (flow === 'public-pkce') {
      clearPkceVerifierCookie(event)
    }
    if (external || isDesktopAuthMode()) {
      const message = err instanceof Error ? err.message : 'Token exchange failed'
      setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
      return externalDoneHtml(false, message)
    }
    throw err
  }
})
