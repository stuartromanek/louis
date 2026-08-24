import type { H3Event } from 'h3'
import pkceChallenge from 'pkce-challenge'

export const YOTO_PKCE_VERIFIER_COOKIE = 'yoto_pkce_verifier'
export const YOTO_REFRESH_TOKEN_COOKIE = 'yoto_refresh_token'
export const YOTO_ACCESS_TOKEN_COOKIE = 'yoto_access_token'

export const YOTO_AUTH_BASE_URL = 'https://login.yotoplay.com'
export const YOTO_API_AUDIENCE = 'https://api.yotoplay.com'
export const YOTO_API_BASE_URL = 'https://api.yotoplay.com'
export const YOTO_SCOPES = 'offline_access user:content:view user:content:manage user:icons:manage'
export const YOTO_SCOPE_COOKIE = 'yoto_token_scope'

export type YotoAuthFlow = 'confidential' | 'public-pkce'

export interface YotoTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

export interface YotoConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function getYotoAuthFlow(config: YotoConfig): YotoAuthFlow {
  if (config.clientSecret && config.clientSecret !== config.clientId) {
    return 'confidential'
  }
  return 'public-pkce'
}

export async function generatePkceChallenge() {
  return pkceChallenge()
}

export function buildAuthorizeUrl(
  config: YotoConfig,
  options?: { codeChallenge?: string; state?: string },
): string {
  const params = new URLSearchParams({
    audience: YOTO_API_AUDIENCE,
    scope: YOTO_SCOPES,
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
  })

  if (options?.codeChallenge) {
    params.set('code_challenge', options.codeChallenge)
    params.set('code_challenge_method', 'S256')
  }

  if (options?.state) {
    params.set('state', options.state)
  }

  return `${YOTO_AUTH_BASE_URL}/authorize?${params.toString()}`
}

export async function exchangeCodeForTokens(
  config: YotoConfig,
  code: string,
  codeVerifier?: string,
): Promise<YotoTokenResponse> {
  const flow = getYotoAuthFlow(config)

  if (flow === 'confidential') {
    return postTokenRequest({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    })
  }

  if (!codeVerifier) {
    throw createError({
      statusCode: 400,
      statusMessage: 'OAuth session expired. Please try connecting again.',
    })
  }

  return postTokenRequest({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code_verifier: codeVerifier,
    code,
    redirect_uri: config.redirectUri,
    audience: YOTO_API_AUDIENCE,
  })
}

export async function refreshAccessToken(
  config: YotoConfig,
  refreshToken: string,
): Promise<YotoTokenResponse> {
  const flow = getYotoAuthFlow(config)

  if (flow === 'confidential') {
    return postTokenRequest({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    })
  }

  return postTokenRequest({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: refreshToken,
    audience: YOTO_API_AUDIENCE,
  })
}

/** Yoto refresh tokens rotate. Share one in-flight refresh per token so parallel API calls cannot reuse it. */
const refreshInFlight = new Map<string, Promise<YotoTokenResponse>>()
const recentRefresh = new Map<string, { tokens: YotoTokenResponse, until: number }>()
const RECENT_REFRESH_MS = 15_000

export async function refreshAccessTokenSingleFlight(
  config: YotoConfig,
  refreshToken: string,
): Promise<YotoTokenResponse> {
  const key = refreshToken.trim()
  const recent = recentRefresh.get(key)
  if (recent && recent.until > Date.now()) return recent.tokens

  const existing = refreshInFlight.get(key)
  if (existing) return existing

  const pending = refreshAccessToken(config, key)
    .then((tokens) => {
      const until = Date.now() + RECENT_REFRESH_MS
      recentRefresh.set(key, { tokens, until })
      if (tokens.refresh_token) recentRefresh.set(tokens.refresh_token, { tokens, until })
      return tokens
    })
    .finally(() => {
      refreshInFlight.delete(key)
    })
  refreshInFlight.set(key, pending)
  return pending
}

export type YotoAccessDecision =
  | { action: 'use', accessToken: string }
  | { action: 'refresh', refreshToken: string }
  | { action: 'expired' }
  | { action: 'disconnected' }

/** Prefer a still-valid access token. Refresh only when it is gone or past desktop expiry. */
export function decideYotoAccess(input: {
  cookieAccess: string
  sessionAccess: string
  sessionExpired: boolean
  refreshToken: string
}): YotoAccessDecision {
  const cookieAccess = input.cookieAccess.trim()
  if (cookieAccess) return { action: 'use', accessToken: cookieAccess }

  const sessionAccess = input.sessionAccess.trim()
  if (sessionAccess && !input.sessionExpired) {
    return { action: 'use', accessToken: sessionAccess }
  }

  const refreshToken = input.refreshToken.trim()
  if (refreshToken) return { action: 'refresh', refreshToken }

  if (sessionAccess && input.sessionExpired) return { action: 'expired' }
  return { action: 'disconnected' }
}

async function postTokenRequest(body: Record<string, string>): Promise<YotoTokenResponse> {
  try {
    return await $fetch<YotoTokenResponse>(`${YOTO_AUTH_BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    })
  }
  catch (err: unknown) {
    const e = err as {
      statusCode?: number
      statusMessage?: string
      message?: string
      data?: { error?: string; error_description?: string }
      response?: { _data?: { error?: string; error_description?: string } }
    }
    const errorData = e.data ?? e.response?._data
    throw createError({
      statusCode: e.statusCode === 401 ? 401 : 502,
      message: errorData?.error_description ?? e.statusMessage ?? e.message ?? 'Yoto token exchange failed',
    })
  }
}

/**
 * Whether OAuth cookies should use the Secure flag.
 * LOUIS_COOKIE_SECURE=true|false overrides; when unset, secure iff NODE_ENV=production.
 * Set false for plain HTTP (e.g. Home Assistant LAN http://homeassistant.local:4000).
 */
export function isYotoCookieSecure(): boolean {
  const raw = (process.env.LOUIS_COOKIE_SECURE || process.env.NUXT_COOKIE_SECURE || '').trim().toLowerCase()
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false
  return process.env.NODE_ENV === 'production'
}

export function setPkceVerifierCookie(event: H3Event, verifier: string) {
  setCookie(event, YOTO_PKCE_VERIFIER_COOKIE, verifier, {
    httpOnly: true,
    secure: isYotoCookieSecure(),
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })
}

export function getPkceVerifierCookie(event: H3Event): string | undefined {
  return getCookie(event, YOTO_PKCE_VERIFIER_COOKIE)
}

export function clearPkceVerifierCookie(event: H3Event) {
  deleteCookie(event, YOTO_PKCE_VERIFIER_COOKIE, { path: '/' })
}

export function setAccessTokenCookie(event: H3Event, accessToken: string, expiresIn: number) {
  setCookie(event, YOTO_ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isYotoCookieSecure(),
    sameSite: 'lax',
    maxAge: Math.max(expiresIn - 60, 60),
    path: '/',
  })
}

export function getAccessTokenCookie(event: H3Event): string | undefined {
  return getCookie(event, YOTO_ACCESS_TOKEN_COOKIE)
}

export function clearAccessTokenCookie(event: H3Event) {
  deleteCookie(event, YOTO_ACCESS_TOKEN_COOKIE, { path: '/' })
}

export function setRefreshTokenCookie(event: H3Event, refreshToken: string) {
  setCookie(event, YOTO_REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isYotoCookieSecure(),
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })
}

export function getRefreshTokenCookie(event: H3Event): string | undefined {
  return getCookie(event, YOTO_REFRESH_TOKEN_COOKIE)
}

export function clearRefreshTokenCookie(event: H3Event) {
  deleteCookie(event, YOTO_REFRESH_TOKEN_COOKIE, { path: '/' })
}

export function setScopeCookie(event: H3Event, scope: string | undefined) {
  if (!scope) return
  setCookie(event, YOTO_SCOPE_COOKIE, scope, {
    httpOnly: true,
    secure: isYotoCookieSecure(),
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })
}

export function getScopeCookie(event: H3Event): string | undefined {
  return getCookie(event, YOTO_SCOPE_COOKIE)
}

export function hasContentManageScope(scope: string | undefined): boolean {
  return scope?.split(/\s+/).includes('user:content:manage') ?? false
}

export function clearScopeCookie(event: H3Event) {
  deleteCookie(event, YOTO_SCOPE_COOKIE, { path: '/' })
}

export function clearYotoAuthCookies(event: H3Event) {
  clearPkceVerifierCookie(event)
  clearAccessTokenCookie(event)
  clearRefreshTokenCookie(event)
  clearScopeCookie(event)
}
