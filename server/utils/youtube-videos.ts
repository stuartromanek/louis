import { parseYoutubeDurationIso } from '../../shared/myo-editor/youtubeDuration.ts'
import { decodeHtmlEntities, fetchYoutubeApiCached, pickThumbnail } from './youtube'
import type { YoutubeVideoDetailsItem } from './youtube-ytdlp-map.ts'

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

export async function fetchYoutubeVideosViaDataApi(
  apiKey: string,
  ids: string[],
): Promise<{ items: YoutubeVideoDetailsItem[] }> {
  const normalizedIds = [...ids].sort().join(',')
  const params = new URLSearchParams({
    part: 'snippet,contentDetails',
    id: ids.join(','),
    key: apiKey,
  })
  const data = await fetchYoutubeApiCached<YoutubeVideosResponse>(
    `videos:${normalizedIds}`,
    `https://www.googleapis.com/youtube/v3/videos?${params}`,
  )

  return {
    items: (data.items ?? []).map((item) => {
      const iso = item.contentDetails.duration
      const durationSeconds = parseYoutubeDurationIso(iso)
      const knownDuration = typeof durationSeconds === 'number' && durationSeconds > 0
        ? { duration: iso, durationSeconds }
        : {}
      return {
        id: item.id,
        title: decodeHtmlEntities(item.snippet.title),
        channelTitle: decodeHtmlEntities(item.snippet.channelTitle),
        thumbnailUrl: pickThumbnail(item.snippet.thumbnails),
        publishedAt: item.snippet.publishedAt,
        description: decodeHtmlEntities(item.snippet.description),
        ...knownDuration,
      }
    }),
  }
}
