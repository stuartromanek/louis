import type { H3Event } from 'h3'
import {
  getAccessTokenCookie,
  getRefreshTokenCookie,
  getScopeCookie,
  refreshAccessToken,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  setScopeCookie,
  YOTO_API_BASE_URL,
  type YotoConfig,
} from './yoto-auth'
import {
  clearYotoDesktopSession,
  isDesktopAuthMode,
  readYotoDesktopSession,
  writeYotoDesktopSession,
} from './yoto-desktop-session'
import { withMappedYotoLimitError } from '#shared/myo-editor/yotoMyoLimits'

export function getYotoRedirectUri(event: H3Event): string {
  const config = useRuntimeConfig(event)
  if (process.env.NODE_ENV === 'production' && config.yotoRedirectUri) {
    return config.yotoRedirectUri
  }

  const url = getRequestURL(event)
  return `${url.origin}/api/yoto/auth/callback`
}

export function getYotoConfig(event: H3Event): YotoConfig {
  const config = useRuntimeConfig(event)
  const clientId = config.yotoClientId
  const clientSecret = config.yotoClientSecret || ''
  const redirectUri = getYotoRedirectUri(event)

  if (!clientId) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Yoto API not configured. Set LOUIS_YOTO_CLIENT_ID in .env',
    })
  }

  return { clientId, clientSecret, redirectUri }
}

export function isYotoConfigured(event: H3Event): boolean {
  const config = useRuntimeConfig(event)
  return Boolean(config.yotoClientId)
}

export function isYotoConnected(event: H3Event): boolean {
  if (getRefreshTokenCookie(event) || getAccessTokenCookie(event)) return true
  const session = readYotoDesktopSession()
  return Boolean(session?.refreshToken || session?.accessToken)
}

export function getYotoAuthScope(event: H3Event): string | undefined {
  return getScopeCookie(event) || readYotoDesktopSession()?.scope || undefined
}

export async function getYotoAccessToken(event: H3Event): Promise<string> {
  const config = getYotoConfig(event)
  const refreshToken = getRefreshTokenCookie(event) || readYotoDesktopSession()?.refreshToken || ''

  if (refreshToken) {
    try {
      const tokens = await refreshAccessToken(config, refreshToken)

      setAccessTokenCookie(event, tokens.access_token, tokens.expires_in)
      if (tokens.refresh_token) {
        setRefreshTokenCookie(event, tokens.refresh_token)
      }
      if (tokens.scope) {
        setScopeCookie(event, tokens.scope)
      }

      if (isDesktopAuthMode()) {
        writeYotoDesktopSession({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || refreshToken,
          scope: tokens.scope || readYotoDesktopSession()?.scope || '',
          accessExpiresAt: Date.now() + Math.max(tokens.expires_in - 60, 60) * 1000,
        })
      }

      return tokens.access_token
    }
    catch (err: unknown) {
      const e = err as { statusCode?: number }
      if (e.statusCode === 401) {
        clearYotoDesktopSession()
        throw createError({
          statusCode: 401,
          statusMessage: 'Yoto session expired. Please reconnect.',
        })
      }
      throw err
    }
  }

  const accessToken = getAccessTokenCookie(event) || readYotoDesktopSession()?.accessToken || ''
  if (accessToken) {
    return accessToken
  }

  throw createError({
    statusCode: 401,
    statusMessage: 'Not connected to Yoto. Click Connect to sign in.',
  })
}

export async function fetchYotoApi<T>(
  path: string,
  accessToken: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT'
    headers?: Record<string, string>
    body?: unknown
  },
): Promise<T> {
  const url = path.startsWith('http') ? path : `${YOTO_API_BASE_URL}${path}`

  try {
    return await $fetch<T>(url, {
      method: options?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...options?.headers,
      },
      body: options?.body,
    })
  }
  catch (err: unknown) {
    const e = err as { statusCode?: number; statusMessage?: string; message?: string }
    if (e.statusCode === 401) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Yoto session expired. Please reconnect.',
      })
    }
    if (e.statusCode === 403) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Yoto API access denied. Check your app scopes.',
      })
    }
    const rawMessage = e.statusMessage ?? e.message ?? 'Yoto API error'
    throw createError({
      statusCode: e.statusCode ?? 502,
      message: withMappedYotoLimitError(rawMessage),
    })
  }
}
