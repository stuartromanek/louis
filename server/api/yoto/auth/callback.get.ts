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

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = String(query.code ?? '').trim()
  const error = String(query.error ?? '').trim()

  if (error) {
    const description = String(query.error_description ?? error)
    throw createError({
      statusCode: 401,
      statusMessage: `Yoto authorization failed: ${description}`,
    })
  }

  if (!code) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing authorization code from Yoto',
    })
  }

  const config = getYotoConfig(event)
  const flow = getYotoAuthFlow(config)
  const verifier = flow === 'public-pkce' ? getPkceVerifierCookie(event) : undefined

  if (flow === 'public-pkce' && !verifier) {
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

    return sendRedirect(event, '/?yoto=connected')
  }
  catch (err: unknown) {
    if (flow === 'public-pkce') {
      clearPkceVerifierCookie(event)
    }
    throw err
  }
})
