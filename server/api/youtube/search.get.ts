import { parseYoutubeDurationIso } from '#shared/myo-editor/youtubeDuration'
import { decodeHtmlEntities, fetchYoutubeApiCached, getYoutubeApiKey, pickThumbnail } from '../../utils/youtube'

interface YoutubeSearchItem {
  id: { videoId: string }
  snippet: {
    title: string
    channelTitle: string
    publishedAt: string
    thumbnails: Record<string, { url: string } | undefined>
  }
}

interface YoutubeSearchResponse {
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

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q ?? '').trim()

  if (!q) {
    throw createError({ statusCode: 400, statusMessage: 'Query parameter "q" is required' })
  }

  const pageToken = query.pageToken ? String(query.pageToken) : undefined
  const maxResults = Math.min(Number(query.maxResults) || 12, 50)
  const apiKey = getYoutubeApiKey(event)

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    safeSearch: 'moderate',
    q,
    maxResults: String(maxResults),
    key: apiKey,
  })

  if (pageToken) {
    params.set('pageToken', pageToken)
  }

  const cacheKey = `search:${q}:${maxResults}:${pageToken ?? ''}`
  const data = await fetchYoutubeApiCached<YoutubeSearchResponse>(
    cacheKey,
    `https://www.googleapis.com/youtube/v3/search?${params}`,
  )

  const searchItems = data.items ?? []
  const videoIds = searchItems
    .map(item => item.id.videoId)
    .filter(Boolean)

  const durationById = new Map<string, { duration: string, durationSeconds: number }>()

  if (videoIds.length > 0) {
    const detailsParams = new URLSearchParams({
      part: 'contentDetails',
      id: videoIds.join(','),
      key: apiKey,
    })
    const detailsCacheKey = `search-details:${[...videoIds].sort().join(',')}`
    const details = await fetchYoutubeApiCached<YoutubeVideosListResponse>(
      detailsCacheKey,
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
    items: searchItems.map((item) => {
      const id = item.id.videoId
      const media = durationById.get(id)
      return {
        id,
        title: decodeHtmlEntities(item.snippet.title),
        channelTitle: decodeHtmlEntities(item.snippet.channelTitle),
        thumbnailUrl: pickThumbnail(item.snippet.thumbnails),
        publishedAt: item.snippet.publishedAt,
        duration: media?.duration,
        durationSeconds: media?.durationSeconds,
      }
    }),
    nextPageToken: data.nextPageToken,
    prevPageToken: data.prevPageToken,
  }
})
