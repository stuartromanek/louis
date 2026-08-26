import type { H3Event } from 'h3'
import { createError } from 'h3'
import type { YoutubeChannelSummary } from '../../shared/myo-editor/youtubeUrl.ts'
import type { YoutubePlaylistImportResponse } from '../../shared/myo-editor/youtubePlaylistImport.ts'
import { rememberYoutubeCache } from './youtube.ts'
import type { YoutubeSearchVideoItem } from './youtube-search.ts'
import { runYtdlpJson } from './youtube-ytdlp-json.ts'
import {
  decodeYtdlpPageToken,
  encodeYtdlpPageToken,
  mapYtdlpChannelDump,
  mapYtdlpEntryToSearchItem,
  mapYtdlpEntryToVideoDetails,
  mapYtdlpPlaylistDump,
  unwrapYtdlpEntries,
  type YoutubeVideoDetailsItem,
} from './youtube-ytdlp-map.ts'

function rangeArgs(start: number, maxResults: number): string[] {
  const end = start + maxResults - 1
  return ['--flat-playlist', '--playlist-start', String(start), '--playlist-end', String(end)]
}

export async function searchYoutubeViaYtdlp(
  event: H3Event | undefined,
  options: { q: string, pageToken?: string, maxResults: number },
): Promise<{ items: YoutubeSearchVideoItem[], nextPageToken?: string }> {
  const start = decodeYtdlpPageToken(options.pageToken)
  const cacheKey = `ytdlp-search:${options.q}:${start}:${options.maxResults}`
  return rememberYoutubeCache(cacheKey, async () => {
    const dump = await runYtdlpJson({
      event,
      cacheKey,
      args: [
        ...rangeArgs(start, options.maxResults),
        '--',
        `ytsearch${start + options.maxResults - 1}:${options.q}`,
      ],
    })
    const window = unwrapYtdlpEntries(dump).slice(0, options.maxResults)
    const items = window.flatMap((entry) => {
      const item = mapYtdlpEntryToSearchItem(entry)
      return item ? [item] : []
    })
    return {
      items,
      nextPageToken: window.length >= options.maxResults
        ? encodeYtdlpPageToken(start + window.length)
        : undefined,
    }
  })
}

export async function fetchYoutubeVideosViaYtdlp(
  event: H3Event | undefined,
  ids: string[],
): Promise<{ items: YoutubeVideoDetailsItem[] }> {
  const cacheKey = `ytdlp-videos:${[...ids].sort().join(',')}`
  return rememberYoutubeCache(cacheKey, async () => {
    const dump = await runYtdlpJson({
      event,
      cacheKey,
      args: [
        '--no-playlist',
        '--',
        ...ids.map(id => `https://www.youtube.com/watch?v=${id}`),
      ],
    })
    const byId = new Map<string, YoutubeVideoDetailsItem>()
    for (const entry of unwrapYtdlpEntries(dump)) {
      const item = mapYtdlpEntryToVideoDetails(entry)
      if (item) byId.set(item.id, item)
    }
    return {
      items: ids.flatMap((id) => {
        const item = byId.get(id)
        return item ? [item] : []
      }),
    }
  })
}

export async function fetchYoutubePlaylistViaYtdlp(
  event: H3Event | undefined,
  options: { playlistId: string, pageToken?: string, maxResults?: number },
): Promise<YoutubePlaylistImportResponse> {
  const start = decodeYtdlpPageToken(options.pageToken)
  const maxResults = options.maxResults ?? 50
  const cacheKey = `ytdlp-playlist:${options.playlistId}:${start}:${maxResults}`
  return rememberYoutubeCache(cacheKey, async () => {
    const dump = await runYtdlpJson({
      event,
      cacheKey,
      args: [
        ...rangeArgs(start, maxResults),
        '--',
        `https://www.youtube.com/playlist?list=${options.playlistId}`,
      ],
    })
    const mapped = mapYtdlpPlaylistDump(dump, {
      playlistId: options.playlistId,
      start,
      pageSize: maxResults,
    })
    if (start === 1 && !dump.id && !dump.title && mapped.items.length === 0) {
      throw createError({
        statusCode: 404,
        message: 'Playlist not found or not public',
      })
    }
    return mapped
  })
}

function channelVideosUrl(options: {
  channelId?: string
  handle?: string
  username?: string
  custom?: string
}): string {
  if (options.channelId) {
    return `https://www.youtube.com/channel/${options.channelId}/videos`
  }
  if (options.handle) {
    return `https://www.youtube.com/@${options.handle.replace(/^@/, '')}/videos`
  }
  if (options.username) {
    return `https://www.youtube.com/user/${options.username}/videos`
  }
  const custom = options.custom?.replace(/^@/, '') ?? ''
  return `https://www.youtube.com/c/${custom}/videos`
}

export async function fetchYoutubeChannelViaYtdlp(
  event: H3Event | undefined,
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
  const start = decodeYtdlpPageToken(options.pageToken)
  const url = channelVideosUrl(options)
  const cacheKey = `ytdlp-channel:${url}:${start}:${options.maxResults}`
  return rememberYoutubeCache(cacheKey, async () => {
    const tryUrls = [url]
    if (options.custom && !options.channelId && !options.handle && !options.username) {
      tryUrls.push(`https://www.youtube.com/@${options.custom.replace(/^@/, '')}/videos`)
    }

    let lastError: unknown
    for (const candidate of tryUrls) {
      try {
        const dump = await runYtdlpJson({
          event,
          cacheKey: `${cacheKey}:${candidate}`,
          args: [
            ...rangeArgs(start, options.maxResults),
            '--',
            candidate,
          ],
        })
        return mapYtdlpChannelDump(dump, {
          start,
          maxResults: options.maxResults,
        })
      }
      catch (err: unknown) {
        lastError = err
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode && statusCode !== 404) throw err
      }
    }
    throw lastError ?? createError({
      statusCode: 404,
      message: 'Public YouTube channel not found',
    })
  })
}
