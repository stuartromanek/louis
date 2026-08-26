import { createError } from 'h3'
import { secondsToYoutubeDurationIso } from '../../shared/myo-editor/youtubeDuration.ts'
import type { YoutubeChannelSummary } from '../../shared/myo-editor/youtubeUrl.ts'
import {
  isPlaceholderYoutubeTitle,
  type YoutubePlaylistImportItem,
  type YoutubePlaylistImportResponse,
} from '../../shared/myo-editor/youtubePlaylistImport.ts'
import type { YoutubeSearchVideoItem } from './youtube-search.ts'

const YTDLP_PAGE_PREFIX = 'ytdlp:'
const CHANNEL_ID = /^UC[\w-]{21,24}$/
const VIDEO_ID = /^[\w-]{11}$/
const UNAVAILABLE_TITLE = /\[(deleted|private|unavailable) video\]/i
const LIVE_OR_UPCOMING = new Set(['is_live', 'is_upcoming'])

export interface YtdlpDump {
  id?: string
  title?: string
  description?: string
  channel?: string
  uploader?: string
  channel_id?: string
  thumbnail?: string
  thumbnails?: Array<{ url?: string }>
  duration?: number | null
  upload_date?: string
  live_status?: string
  availability?: string
  playlist_count?: number
  n_entries?: number
  entries?: Array<YtdlpDump | null>
  webpage_url?: string
  original_url?: string
  _type?: string
}

export interface YoutubeVideoDetailsItem extends YoutubeSearchVideoItem {
  description?: string
}

export function encodeYtdlpPageToken(start: number): string {
  return `${YTDLP_PAGE_PREFIX}${start}`
}

export function decodeYtdlpPageToken(token: string | undefined): number {
  if (!token) return 1
  if (!token.startsWith(YTDLP_PAGE_PREFIX)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid page token. Run the search again.',
    })
  }
  const start = Number(token.slice(YTDLP_PAGE_PREFIX.length))
  if (!Number.isInteger(start) || start < 1) {
    throw createError({
      statusCode: 400,
      message: 'Invalid page token. Run the search again.',
    })
  }
  return start
}

export function unwrapYtdlpEntries(dump: YtdlpDump): YtdlpDump[] {
  if (Array.isArray(dump.entries)) {
    return dump.entries.filter((entry): entry is YtdlpDump => Boolean(entry))
  }
  if (dump.id || dump.title) return [dump]
  return []
}

function thumbnailFor(entry: YtdlpDump, videoId?: string): string {
  if (entry.thumbnail) return entry.thumbnail
  const fromList = entry.thumbnails?.find(item => item.url)?.url
  if (fromList) return fromList
  if (videoId) return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
  return ''
}

function publishedAtFromUploadDate(uploadDate?: string): string {
  if (!uploadDate || !/^\d{8}$/.test(uploadDate)) return ''
  return `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6, 8)}T00:00:00Z`
}

function durationFields(entry: YtdlpDump): { duration?: string, durationSeconds?: number } {
  if (typeof entry.duration !== 'number' || !Number.isFinite(entry.duration) || entry.duration <= 0) {
    return {}
  }
  const durationSeconds = Math.round(entry.duration)
  return {
    durationSeconds,
    duration: secondsToYoutubeDurationIso(durationSeconds),
  }
}

function isSearchableVideoEntry(entry: YtdlpDump): boolean {
  if (entry._type === 'playlist' || entry._type === 'channel') return false
  if (entry.live_status && LIVE_OR_UPCOMING.has(entry.live_status)) return false
  return true
}

export function mapYtdlpEntryToSearchItem(entry: YtdlpDump): YoutubeSearchVideoItem | null {
  const id = entry.id?.trim()
  if (!id || !VIDEO_ID.test(id)) return null
  if (!isSearchableVideoEntry(entry)) return null
  const title = entry.title?.trim()
  if (isPlaceholderYoutubeTitle(title)) return null
  const media = durationFields(entry)
  return {
    id,
    title,
    channelTitle: (entry.channel || entry.uploader || '').trim(),
    thumbnailUrl: thumbnailFor(entry, id),
    publishedAt: publishedAtFromUploadDate(entry.upload_date),
    duration: media.duration,
    durationSeconds: media.durationSeconds,
  }
}

export function mapYtdlpEntryToVideoDetails(entry: YtdlpDump): YoutubeVideoDetailsItem | null {
  const item = mapYtdlpEntryToSearchItem(entry)
  if (!item) return null
  return {
    ...item,
    description: entry.description ?? '',
  }
}

function isUnavailablePlaylistEntry(entry: YtdlpDump): boolean {
  if (!entry.id?.trim()) return true
  const title = entry.title ?? ''
  if (UNAVAILABLE_TITLE.test(title)) return true
  if (entry.availability === 'private' || entry.availability === 'needs_auth') return true
  return false
}

export function mapYtdlpPlaylistDump(
  dump: YtdlpDump,
  options: { playlistId: string, start: number, pageSize: number },
): YoutubePlaylistImportResponse {
  const entries = unwrapYtdlpEntries(dump)
  const items: YoutubePlaylistImportItem[] = entries.map((entry, index) => {
    const videoId = entry.id?.trim() ?? ''
    const unavailable = isUnavailablePlaylistEntry(entry)
    const media = durationFields(entry)
    const position = options.start - 1 + index
    return {
      playlistItemId: `${options.playlistId}:${videoId || 'missing'}:${position}`,
      videoId,
      position,
      title: unavailable
        ? (entry.title?.trim() || 'Unavailable video')
        : (entry.title?.trim() || ''),
      channelTitle: (entry.channel || entry.uploader || dump.channel || dump.uploader || '').trim(),
      thumbnailUrl: thumbnailFor(entry, videoId || undefined),
      duration: media.duration,
      durationSeconds: media.durationSeconds,
      available: !unavailable,
    }
  })

  const nextStart = options.start + items.length
  const total = dump.playlist_count
  const hasMore = items.length >= options.pageSize && (
    typeof total === 'number' ? nextStart <= total : true
  )

  return {
    playlist: {
      id: dump.id || options.playlistId,
      title: dump.title || 'YouTube playlist',
      channelTitle: (dump.channel || dump.uploader || '').trim(),
      itemCount: dump.playlist_count,
    },
    items,
    nextPageToken: hasMore ? encodeYtdlpPageToken(nextStart) : undefined,
  }
}

export function mapYtdlpChannelDump(
  dump: YtdlpDump,
  options: { start: number, maxResults: number },
): {
  channel: YoutubeChannelSummary
  items: YoutubeSearchVideoItem[]
  nextPageToken?: string
} {
  const entries = unwrapYtdlpEntries(dump)
  const window = entries.slice(0, options.maxResults)
  const items = window.flatMap((entry) => {
    const item = mapYtdlpEntryToSearchItem(entry)
    return item ? [item] : []
  })
  const channelId = dump.channel_id || dump.id || ''
  if (!CHANNEL_ID.test(channelId)) {
    throw createError({
      statusCode: 404,
      message: 'Public YouTube channel not found',
    })
  }
  const nextStart = options.start + window.length
  const hasMore = window.length >= options.maxResults
  return {
    channel: {
      id: channelId,
      title: (dump.channel || dump.title || 'YouTube channel').replace(/ - Videos$/, ''),
      videoCount: dump.playlist_count,
    },
    items,
    nextPageToken: hasMore ? encodeYtdlpPageToken(nextStart) : undefined,
  }
}
