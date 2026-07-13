import { decodeHtmlEntities, fetchYoutubeApiCached, getYoutubeApiKey, pickThumbnail } from '../../utils/youtube'

interface YoutubeVideoItem {
  id: string
  snippet: {
    title: string
    channelTitle: string
    publishedAt: string
    description: string
    thumbnails: Record<string, { url: string } | undefined>
  }
  contentDetails: {
    duration: string
  }
}

interface YoutubeVideosResponse {
  items?: YoutubeVideoItem[]
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const ids = String(query.ids ?? '').trim()

  if (!ids) {
    throw createError({ statusCode: 400, statusMessage: 'Query parameter "ids" is required' })
  }

  const idList = ids.split(',').map(id => id.trim()).filter(Boolean)
  if (idList.length === 0 || idList.length > 50) {
    throw createError({ statusCode: 400, statusMessage: 'Provide 1–50 comma-separated video IDs' })
  }

  const normalizedIds = [...idList].sort().join(',')

  const apiKey = getYoutubeApiKey(event)

  const params = new URLSearchParams({
    part: 'snippet,contentDetails',
    id: idList.join(','),
    key: apiKey,
  })

  const cacheKey = `videos:${normalizedIds}`
  const data = await fetchYoutubeApiCached<YoutubeVideosResponse>(
    cacheKey,
    `https://www.googleapis.com/youtube/v3/videos?${params}`,
  )

  return {
    items: (data.items ?? []).map(item => ({
      id: item.id,
      title: decodeHtmlEntities(item.snippet.title),
      channelTitle: decodeHtmlEntities(item.snippet.channelTitle),
      thumbnailUrl: pickThumbnail(item.snippet.thumbnails),
      publishedAt: item.snippet.publishedAt,
      description: decodeHtmlEntities(item.snippet.description),
      duration: item.contentDetails.duration,
    })),
  }
})
