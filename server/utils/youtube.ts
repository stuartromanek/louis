import type { H3Event } from 'h3'

const YOUTUBE_API_CACHE_TTL_MS = 60_000

type CacheEntry = {
  expiresAt: number
  value: unknown
}

const youtubeApiCache = new Map<string, CacheEntry>()

export function getYoutubeApiKey(event: H3Event): string {
  const config = useRuntimeConfig(event)
  const key = config.youtubeApiKey
  if (!key) {
    throw createError({
      statusCode: 503,
      message: 'YouTube API key not configured. Set NUXT_YOUTUBE_API_KEY in .env',
    })
  }
  return key
}

export async function fetchYoutubeApi<T>(url: string): Promise<T> {
  try {
    return await $fetch<T>(url)
  }
  catch (err: unknown) {
    const e = err as { statusCode?: number; statusMessage?: string; message?: string }
    if (e.statusCode === 403) {
      throw createError({
        statusCode: 403,
        message: 'YouTube API quota exceeded or key invalid',
      })
    }
    throw createError({
      statusCode: e.statusCode ?? 502,
      message: e.statusMessage ?? e.message ?? 'YouTube API error',
    })
  }
}

export async function fetchYoutubeApiCached<T>(cacheKey: string, url: string): Promise<T> {
  const now = Date.now()
  const cached = youtubeApiCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.value as T
  }

  const value = await fetchYoutubeApi<T>(url)
  youtubeApiCache.set(cacheKey, {
    expiresAt: now + YOUTUBE_API_CACHE_TTL_MS,
    value,
  })
  return value
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function pickThumbnail(thumbnails: Record<string, { url: string } | undefined>): string {
  return (
    thumbnails.medium?.url
    ?? thumbnails.default?.url
    ?? thumbnails.high?.url
    ?? ''
  )
}

interface YoutubeVideosListResponse {
  items?: Array<{
    id?: string
    status?: {
      uploadStatus?: string
      privacyStatus?: string
      embeddable?: boolean
    }
  }>
}

/**
 * Soft Data API check before yt-dlp.
 * Returns null when the key is missing or the API call fails (caller should continue to yt-dlp).
 */
export async function checkYoutubeVideoAvailability(
  event: H3Event,
  youtubeId: string,
): Promise<{ ok: true } | { ok: false, message: string } | null> {
  let key: string
  try {
    key = getYoutubeApiKey(event)
  }
  catch {
    return null
  }

  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos')
    url.searchParams.set('part', 'status')
    url.searchParams.set('id', youtubeId)
    url.searchParams.set('key', key)

    const data = await fetchYoutubeApiCached<YoutubeVideosListResponse>(
      `videos.status:${youtubeId}`,
      url.toString(),
    )

    const item = data.items?.[0]
    if (!item) {
      return {
        ok: false,
        message: `YouTube video ${youtubeId} was not found or has been removed.`,
      }
    }

    const uploadStatus = item.status?.uploadStatus?.toLowerCase()
    const privacyStatus = item.status?.privacyStatus?.toLowerCase()

    if (uploadStatus && uploadStatus !== 'processed' && uploadStatus !== 'uploaded') {
      return {
        ok: false,
        message: `YouTube video ${youtubeId} is not available for download (${uploadStatus}).`,
      }
    }

    if (privacyStatus === 'private') {
      return {
        ok: false,
        message: `YouTube video ${youtubeId} is private and cannot be downloaded.`,
      }
    }

    return { ok: true }
  }
  catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    console.warn(
      `[yt-dlp] Data API preflight skipped for ${youtubeId}:`,
      e.statusMessage ?? e.message ?? err,
    )
    return null
  }
}
