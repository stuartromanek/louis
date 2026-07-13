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

  return {
    items: (data.items ?? []).map(item => ({
      id: item.id.videoId,
      title: decodeHtmlEntities(item.snippet.title),
      channelTitle: decodeHtmlEntities(item.snippet.channelTitle),
      thumbnailUrl: pickThumbnail(item.snippet.thumbnails),
      publishedAt: item.snippet.publishedAt,
    })),
    nextPageToken: data.nextPageToken,
    prevPageToken: data.prevPageToken,
  }
})
