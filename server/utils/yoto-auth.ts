import type { H3Event } from 'h3'
import pkceChallenge from 'pkce-challenge'

export const YOTO_PKCE_VERIFIER_COOKIE = 'yoto_pkce_verifier'
export const YOTO_REFRESH_TOKEN_COOKIE = 'yoto_refresh_token'
export const YOTO_ACCESS_TOKEN_COOKIE = 'yoto_access_token'

export const YOTO_AUTH_BASE_URL = 'https://login.yotoplay.com'
export const YOTO_API_AUDIENCE = 'https://api.yotoplay.com'
export const YOTO_API_BASE_URL = 'https://api.yotoplay.com'
export const YOTO_SCOPES = 'user:content:view user:content:manage'
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

export function buildAuthorizeUrl(config: YotoConfig, codeChallenge?: string): string {
  const params = new URLSearchParams({
    audience: YOTO_API_AUDIENCE,
    scope: YOTO_SCOPES,
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
  })

  if (codeChallenge) {
    params.set('code_challenge', codeChallenge)
    params.set('code_challenge_method', 'S256')
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
      statusMessage: errorData?.error_description ?? e.statusMessage ?? e.message ?? 'Yoto token exchange failed',
    })
  }
}

export function setPkceVerifierCookie(event: H3Event, verifier: string) {
  setCookie(event, YOTO_PKCE_VERIFIER_COOKIE, verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
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
    secure: process.env.NODE_ENV === 'production',
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
    secure: process.env.NODE_ENV === 'production',
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
    secure: process.env.NODE_ENV === 'production',
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
