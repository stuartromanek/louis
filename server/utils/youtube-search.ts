import { parseYoutubeDurationIso } from '#shared/myo-editor/youtubeDuration'
import { decodeHtmlEntities, fetchYoutubeApiCached, pickThumbnail } from './youtube'

interface YoutubeSearchItem {
  id?: { videoId?: string }
  snippet?: {
    title?: string
    channelTitle?: string
    publishedAt?: string
    thumbnails?: Record<string, { url: string } | undefined>
  }
}

interface YoutubeSearchListResponse {
  items?: YoutubeSearchItem[]
  nextPageToken?: string
  prevPageToken?: string
}

interface YoutubeVideosListItem {
  id: string
  contentDetails?: {
    duration?: string
  }
}

interface YoutubeVideosListResponse {
  items?: YoutubeVideosListItem[]
}

export interface YoutubeSearchVideoItem {
  id: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  publishedAt: string
  duration?: string
  durationSeconds?: number
}

export async function searchYoutubeVideos(options: {
  apiKey: string
  q?: string
  channelId?: string
  pageToken?: string
  maxResults: number
}): Promise<{
  items: YoutubeSearchVideoItem[]
  nextPageToken?: string
  prevPageToken?: string
}> {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    safeSearch: 'moderate',
    maxResults: String(options.maxResults),
    key: options.apiKey,
  })

  if (options.channelId) {
    params.set('channelId', options.channelId)
    params.set('order', 'date')
  }
  if (options.q) params.set('q', options.q)
  if (options.pageToken) params.set('pageToken', options.pageToken)

  const cacheKey = `search:${options.q ?? ''}:${options.channelId ?? ''}:${options.maxResults}:${options.pageToken ?? ''}`
  const data = await fetchYoutubeApiCached<YoutubeSearchListResponse>(
    cacheKey,
    `https://www.googleapis.com/youtube/v3/search?${params}`,
  )

  const searchItems = data.items ?? []
  const videoIds = searchItems
    .map(item => item.id?.videoId)
    .filter((id): id is string => Boolean(id))

  const durationById = new Map<string, { duration: string, durationSeconds: number }>()

  if (videoIds.length > 0) {
    const detailsParams = new URLSearchParams({
      part: 'contentDetails',
      id: videoIds.join(','),
      key: options.apiKey,
    })
    const details = await fetchYoutubeApiCached<YoutubeVideosListResponse>(
      `search-details:${[...videoIds].sort().join(',')}`,
      `https://www.googleapis.com/youtube/v3/videos?${detailsParams}`,
    )

    for (const item of details.items ?? []) {
      const iso = item.contentDetails?.duration
      if (!iso) continue
      const durationSeconds = parseYoutubeDurationIso(iso)
      if (durationSeconds === null) continue
      durationById.set(item.id, { duration: iso, durationSeconds })
    }
  }

  return {
    items: searchItems.flatMap((item) => {
      const id = item.id?.videoId
      if (!id || !item.snippet) return []
      const media = durationById.get(id)
      return [{
        id,
        title: decodeHtmlEntities(item.snippet.title ?? ''),
        channelTitle: decodeHtmlEntities(item.snippet.channelTitle ?? ''),
        thumbnailUrl: pickThumbnail(item.snippet.thumbnails ?? {}),
        publishedAt: item.snippet.publishedAt ?? '',
        duration: media?.duration,
        durationSeconds: media?.durationSeconds,
      }]
    }),
    nextPageToken: data.nextPageToken,
    prevPageToken: data.prevPageToken,
  }
}
