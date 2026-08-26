import type { H3Event } from 'h3'
import {
  isRecoverableYoutubeApiError,
  tryGetYoutubeApiKey,
  tryGetYoutubeSafeSearch,
} from './youtube'
import { searchYoutubeVideos, type YoutubeSearchVideoItem } from './youtube-search'
import { fetchYoutubeVideosViaDataApi } from './youtube-videos'
import { fetchYoutubePlaylistViaDataApi } from './youtube-playlist'
import { fetchYoutubeChannelViaDataApi } from './youtube-channel'
import {
  fetchYoutubeChannelViaYtdlp,
  fetchYoutubePlaylistViaYtdlp,
  fetchYoutubeVideosViaYtdlp,
  searchYoutubeViaYtdlp,
} from './youtube-ytdlp-discovery'
import type { YoutubeVideoDetailsItem } from './youtube-ytdlp-map'
import type { YoutubeChannelSummary } from '../../shared/myo-editor/youtubeUrl.ts'
import type { YoutubePlaylistImportResponse } from '../../shared/myo-editor/youtubePlaylistImport.ts'
import { listableYoutubeSearchResults } from '../../shared/myo-editor/youtubePlaylistImport.ts'

function logFallback(surface: string, err: unknown) {
  const message = (err as { message?: string }).message ?? String(err)
  console.warn(`[youtube] Data API ${surface} failed, falling back to yt-dlp: ${message}`)
}

function listableSearchPage<T extends { items: YoutubeSearchVideoItem[] }>(page: T): T {
  return { ...page, items: listableYoutubeSearchResults(page.items) }
}

export async function discoverYoutubeSearch(
  event: H3Event,
  options: {
    q?: string
    channelId?: string
    pageToken?: string
    maxResults: number
  },
): Promise<{
  items: YoutubeSearchVideoItem[]
  nextPageToken?: string
  prevPageToken?: string
}> {
  const apiKey = tryGetYoutubeApiKey(event)
  if (apiKey) {
    const safeSearch = tryGetYoutubeSafeSearch(event)
    try {
      return listableSearchPage(await searchYoutubeVideos({
        apiKey,
        q: options.q,
        channelId: options.channelId,
        pageToken: options.pageToken,
        maxResults: options.maxResults,
        safeSearch,
      }))
    }
    catch (err: unknown) {
      if (!isRecoverableYoutubeApiError(err)) throw err
      logFallback('search', err)
    }
  }

  if (options.channelId) {
    const page = await fetchYoutubeChannelViaYtdlp(event, {
      channelId: options.channelId,
      pageToken: options.pageToken,
      maxResults: options.maxResults,
    })
    return listableSearchPage({ items: page.items, nextPageToken: page.nextPageToken })
  }

  const q = options.q?.trim() ?? ''
  if (!q) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Query parameter "q" is required',
    })
  }

  return listableSearchPage(await searchYoutubeViaYtdlp(event, {
    q,
    pageToken: options.pageToken,
    maxResults: options.maxResults,
  }))
}

export async function discoverYoutubeVideos(
  event: H3Event,
  ids: string[],
): Promise<{ items: YoutubeVideoDetailsItem[] }> {
  const apiKey = tryGetYoutubeApiKey(event)
  if (apiKey) {
    try {
      return await fetchYoutubeVideosViaDataApi(apiKey, ids)
    }
    catch (err: unknown) {
      if (!isRecoverableYoutubeApiError(err)) throw err
      logFallback('videos', err)
    }
  }
  return await fetchYoutubeVideosViaYtdlp(event, ids)
}

export async function discoverYoutubePlaylist(
  event: H3Event,
  options: { playlistId: string, pageToken?: string },
): Promise<YoutubePlaylistImportResponse> {
  const apiKey = tryGetYoutubeApiKey(event)
  if (apiKey) {
    try {
      return await fetchYoutubePlaylistViaDataApi(apiKey, options)
    }
    catch (err: unknown) {
      if (!isRecoverableYoutubeApiError(err)) throw err
      logFallback('playlist', err)
    }
  }
  return await fetchYoutubePlaylistViaYtdlp(event, options)
}

export async function discoverYoutubeChannel(
  event: H3Event,
  options: {
    channelId?: string
    handle?: string
    username?: string
    custom?: string
    pageToken?: string
    maxResults: number
  },
): Promise<{
  channel: YoutubeChannelSummary
  items: YoutubeSearchVideoItem[]
  nextPageToken?: string
}> {
  const apiKey = tryGetYoutubeApiKey(event)
  if (apiKey) {
    try {
      return listableSearchPage(await fetchYoutubeChannelViaDataApi(apiKey, {
        ...options,
        safeSearch: tryGetYoutubeSafeSearch(event),
      }))
    }
    catch (err: unknown) {
      if (!isRecoverableYoutubeApiError(err)) throw err
      logFallback('channel', err)
    }
  }
  return listableSearchPage(await fetchYoutubeChannelViaYtdlp(event, options))
}
