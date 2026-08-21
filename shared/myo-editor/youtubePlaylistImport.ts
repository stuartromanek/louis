const YOUTUBE_PLAYLIST_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
])

const YOUTUBE_PLAYLIST_ID = /^[A-Za-z0-9_-]{10,100}$/

export interface YoutubePlaylistSummary {
  id: string
  title: string
  channelTitle: string
  itemCount?: number
}

export interface YoutubePlaylistImportItem {
  playlistItemId: string
  videoId: string
  position: number
  title: string
  channelTitle: string
  thumbnailUrl: string
  duration?: string
  durationSeconds?: number
  available: boolean
}

export interface YoutubePlaylistImportResponse {
  playlist?: YoutubePlaylistSummary
  items: YoutubePlaylistImportItem[]
  nextPageToken?: string
}

export type YoutubePlaylistImportBlockReason =
  | 'unavailable'
  | 'missing-duration'

/** Picker row shape produced from a playlist item (matches YoutubeVideoSummary). */
export interface YoutubePlaylistResultVideo {
  id: string
  resultKey: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  publishedAt: string
  duration?: string
  durationSeconds?: number
}

export function isYoutubePlaylistId(value: string): boolean {
  return YOUTUBE_PLAYLIST_ID.test(value)
}

export function parseYoutubePlaylistUrl(value: string): string | null {
  let url: URL
  try {
    url = new URL(value.trim())
  }
  catch {
    return null
  }

  if (url.protocol !== 'https:' || !YOUTUBE_PLAYLIST_HOSTS.has(url.hostname.toLowerCase())) {
    return null
  }

  const values = url.searchParams.getAll('list')
  if (values.length !== 1) return null

  const playlistId = values[0]?.trim() ?? ''
  return isYoutubePlaylistId(playlistId) ? playlistId : null
}

export function videoResultKey(video: { id: string, resultKey?: string }): string {
  return video.resultKey || video.id
}

export function youtubePlaylistItemBlockReason(
  item: YoutubePlaylistImportItem,
): YoutubePlaylistImportBlockReason | undefined {
  if (!item.available) return 'unavailable'
  if (
    typeof item.durationSeconds !== 'number'
    || !Number.isFinite(item.durationSeconds)
    || item.durationSeconds <= 0
  ) {
    return 'missing-duration'
  }
  return undefined
}

export function isYoutubePlaylistItemImportable(
  item: YoutubePlaylistImportItem,
): boolean {
  return youtubePlaylistItemBlockReason(item) === undefined
}

export function isImportableYoutubeResult(
  video: { durationSeconds?: number },
): boolean {
  if (
    typeof video.durationSeconds !== 'number'
    || !Number.isFinite(video.durationSeconds)
    || video.durationSeconds <= 0
  ) {
    return false
  }
  return true
}

export function playlistImportItemToResultVideo(
  item: YoutubePlaylistImportItem,
): YoutubePlaylistResultVideo {
  return {
    id: item.videoId,
    resultKey: item.playlistItemId,
    title: item.title,
    channelTitle: item.channelTitle,
    thumbnailUrl: item.thumbnailUrl,
    publishedAt: '',
    duration: item.duration,
    durationSeconds: item.durationSeconds,
  }
}

function hasKnownDuration(item: YoutubePlaylistImportItem): boolean {
  return typeof item.durationSeconds === 'number'
    && Number.isFinite(item.durationSeconds)
    && item.durationSeconds > 0
}

export function mapPlaylistImportItems(
  items: YoutubePlaylistImportItem[],
): {
  videos: YoutubePlaylistResultVideo[]
  skippedUnavailable: number
  skippedMissingDuration: number
} {
  const videos: YoutubePlaylistResultVideo[] = []
  let skippedUnavailable = 0
  let skippedMissingDuration = 0
  for (const item of items) {
    if (!item.available) {
      skippedUnavailable += 1
      continue
    }
    videos.push(playlistImportItemToResultVideo(item))
    if (!hasKnownDuration(item)) skippedMissingDuration += 1
  }
  return { videos, skippedUnavailable, skippedMissingDuration }
}

export function importableResultKeys<T extends { id: string, resultKey?: string, durationSeconds?: number }>(
  videos: T[],
): string[] {
  return videos
    .filter(video => isImportableYoutubeResult(video))
    .map(video => videoResultKey(video))
}

/**
 * Dragging a checked row stages every checked row in results order.
 * Dragging an unchecked row stages that row only.
 */
export function videosForGroupDrag<T extends { id: string, resultKey?: string }>(
  results: T[],
  selectedKeys: ReadonlySet<string>,
  source: T,
): T[] {
  const sourceKey = videoResultKey(source)
  if (!selectedKeys.has(sourceKey)) return [source]
  return results.filter(video => selectedKeys.has(videoResultKey(video)))
}
