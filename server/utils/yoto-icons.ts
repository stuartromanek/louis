import type { H3Event } from 'h3'
import { fetchYotoApi, getYotoAccessToken } from './yoto'
import { YOTO_API_BASE_URL } from './yoto-auth'

export interface YotoDisplayIconRecord {
  displayIconId?: string
  mediaId: string
  url?: string | Record<string, unknown> | null
  title?: string
  publicTags?: string[]
  userId?: string
  public?: boolean
  new?: boolean
  createdAt?: string
}

export interface YotoDisplayIconsResponse {
  displayIcons?: YotoDisplayIconRecord[]
}

export interface YotoUploadIconResponse {
  displayIcon: {
    displayIconId?: string
    mediaId: string
    url?: string | Record<string, unknown> | null
    userId?: string
    new?: boolean
  }
}

export function normalizeIconUrl(
  url: string | Record<string, unknown> | null | undefined,
  _mediaId?: string,
): string {
  if (typeof url === 'string' && url.trim()) return url.trim()
  // Re-uploads often return url: {} — never invent a CDN host (patterns differ by env).
  return ''
}

export async function fetchPublicYotoIcons(event: H3Event): Promise<YotoDisplayIconRecord[]> {
  const accessToken = await getYotoAccessToken(event)
  const data = await fetchYotoApi<YotoDisplayIconsResponse>(
    '/media/displayIcons/user/yoto',
    accessToken,
  )
  return data.displayIcons ?? []
}

export async function fetchUserYotoIcons(event: H3Event): Promise<YotoDisplayIconRecord[]> {
  const accessToken = await getYotoAccessToken(event)
  const data = await fetchYotoApi<YotoDisplayIconsResponse>(
    '/media/displayIcons/user/me',
    accessToken,
  )
  return data.displayIcons ?? []
}

/** Prefer upload response URL; if missing (re-upload), look up user icon catalog. */
export async function resolveIconPreviewUrl(
  event: H3Event,
  mediaId: string,
  responseUrl?: string | Record<string, unknown> | null,
): Promise<string> {
  const fromResponse = normalizeIconUrl(responseUrl, mediaId)
  if (fromResponse) return fromResponse

  try {
    const userIcons = await fetchUserYotoIcons(event)
    const match = userIcons.find(icon => icon.mediaId === mediaId)
    const fromUser = normalizeIconUrl(match?.url, mediaId)
    if (fromUser) return fromUser
  }
  catch {
    // best-effort
  }
  return ''
}

export async function uploadYotoIcon(
  event: H3Event,
  file: Buffer,
  options?: { filename?: string; contentType?: string; autoConvert?: boolean },
): Promise<YotoUploadIconResponse> {
  const accessToken = await getYotoAccessToken(event)
  const autoConvert = options?.autoConvert === true
  const filename = options?.filename ?? 'icon.png'
  const contentType = options?.contentType ?? 'image/png'

  const query = new URLSearchParams({
    autoConvert: autoConvert ? 'true' : 'false',
    filename,
  })

  const url = `${YOTO_API_BASE_URL}/media/displayIcons/user/me/upload?${query.toString()}`

  try {
    return await $fetch<YotoUploadIconResponse>(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
      },
      body: file,
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
        statusMessage: 'Yoto API access denied. Check your app scopes (need user:icons:manage).',
      })
    }
    throw createError({
      statusCode: e.statusCode ?? 502,
      statusMessage: e.statusMessage ?? e.message ?? 'Failed to upload icon',
    })
  }
}

/** Build mediaId → preview URL map from public + user icon catalogs. */
export function buildIconPreviewMap(
  ...lists: YotoDisplayIconRecord[][]
): Map<string, string> {
  const map = new Map<string, string>()
  for (const list of lists) {
    for (const icon of list) {
      if (!icon.mediaId || map.has(icon.mediaId)) continue
      const url = normalizeIconUrl(icon.url, icon.mediaId)
      if (!url) continue
      map.set(icon.mediaId, url)
    }
  }
  return map
}
