import { decodeHtmlEntities, fetchYoutubeApiCached } from './youtube'
import { searchYoutubeVideos, type YoutubeSearchVideoItem } from './youtube-search'
import type { YoutubeSafeSearch } from '../../shared/youtubeSafeSearch.ts'
import type { YoutubeChannelSummary } from '../../shared/myo-editor/youtubeUrl.ts'

interface YoutubeChannelListItem {
  id?: string
  snippet?: {
    title?: string
  }
  statistics?: {
    videoCount?: string
  }
  status?: {
    privacyStatus?: string
  }
}

interface YoutubeChannelsListResponse {
  items?: YoutubeChannelListItem[]
}

interface YoutubeChannelSearchItem {
  id?: { channelId?: string }
}

interface YoutubeChannelSearchResponse {
  items?: YoutubeChannelSearchItem[]
}

const CHANNEL_ID = /^UC[\w-]{21,24}$/

function parseVideoCount(value: string | undefined): number | undefined {
  if (!value) return undefined
  const count = Number(value)
  return Number.isFinite(count) ? count : undefined
}

function channelSummary(item: YoutubeChannelListItem): YoutubeChannelSummary | null {
  const id = item.id?.trim() ?? ''
  if (!CHANNEL_ID.test(id)) return null
  if (item.status?.privacyStatus === 'private') return null
  return {
    id,
    title: decodeHtmlEntities(item.snippet?.title ?? 'YouTube channel'),
    videoCount: parseVideoCount(item.statistics?.videoCount),
  }
}

async function fetchChannelByParams(
  apiKey: string,
  params: URLSearchParams,
  cacheKey: string,
): Promise<YoutubeChannelSummary | null> {
  const data = await fetchYoutubeApiCached<YoutubeChannelsListResponse>(
    cacheKey,
    `https://www.googleapis.com/youtube/v3/channels?${params}`,
  )
  const item = data.items?.[0]
  return item ? channelSummary(item) : null
}

export async function fetchYoutubeChannelViaDataApi(
  apiKey: string,
  options: {
    channelId?: string
    handle?: string
    username?: string
    custom?: string
    pageToken?: string
    maxResults: number
    safeSearch: YoutubeSafeSearch
  },
): Promise<{
  channel: YoutubeChannelSummary
  items: YoutubeSearchVideoItem[]
  nextPageToken?: string
}> {
  const channel = await resolveYoutubeChannelViaDataApi(apiKey, options)
  const videos = await searchYoutubeVideos({
    apiKey,
    channelId: channel.id,
    pageToken: options.pageToken,
    maxResults: options.maxResults,
    safeSearch: options.safeSearch,
  })
  return {
    channel,
    items: videos.items,
    nextPageToken: videos.nextPageToken,
  }
}

export async function resolveYoutubeChannelViaDataApi(
  apiKey: string,
  options: {
    channelId?: string
    handle?: string
    username?: string
    custom?: string
  },
): Promise<YoutubeChannelSummary> {
  if (options.channelId) {
    const params = new URLSearchParams({
      part: 'snippet,statistics,status',
      id: options.channelId,
      key: apiKey,
    })
    const channel = await fetchChannelByParams(apiKey, params, `channel:${options.channelId}`)
    if (channel) return channel
  }

  if (options.handle) {
    const handle = options.handle.replace(/^@/, '')
    const params = new URLSearchParams({
      part: 'snippet,statistics,status',
      forHandle: `@${handle}`,
      key: apiKey,
    })
    const channel = await fetchChannelByParams(apiKey, params, `channel-handle:${handle.toLowerCase()}`)
    if (channel) return channel
  }

  if (options.username) {
    const params = new URLSearchParams({
      part: 'snippet,statistics,status',
      forUsername: options.username,
      key: apiKey,
    })
    const channel = await fetchChannelByParams(
      apiKey,
      params,
      `channel-user:${options.username.toLowerCase()}`,
    )
    if (channel) return channel
  }

  if (options.custom) {
    const handleParams = new URLSearchParams({
      part: 'snippet,statistics,status',
      forHandle: `@${options.custom.replace(/^@/, '')}`,
      key: apiKey,
    })
    const viaHandle = await fetchChannelByParams(
      apiKey,
      handleParams,
      `channel-handle:${options.custom.replace(/^@/, '').toLowerCase()}`,
    )
    if (viaHandle) return viaHandle

    const searchParams = new URLSearchParams({
      part: 'snippet',
      type: 'channel',
      maxResults: '1',
      q: options.custom,
      key: apiKey,
    })
    const search = await fetchYoutubeApiCached<YoutubeChannelSearchResponse>(
      `channel-search:${options.custom.toLowerCase()}`,
      `https://www.googleapis.com/youtube/v3/search?${searchParams}`,
    )
    const foundId = search.items?.[0]?.id?.channelId
    if (foundId && CHANNEL_ID.test(foundId)) {
      const params = new URLSearchParams({
        part: 'snippet,statistics,status',
        id: foundId,
        key: apiKey,
      })
      const channel = await fetchChannelByParams(apiKey, params, `channel:${foundId}`)
      if (channel) return channel
    }
  }

  throw createError({
    statusCode: 404,
    message: 'Public YouTube channel not found',
  })
}
