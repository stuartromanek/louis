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
      statusMessage: 'YouTube API key not configured. Set NUXT_YOUTUBE_API_KEY in .env',
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
        statusMessage: 'YouTube API quota exceeded or key invalid',
      })
    }
    throw createError({
      statusCode: e.statusCode ?? 502,
      statusMessage: e.statusMessage ?? e.message ?? 'YouTube API error',
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
