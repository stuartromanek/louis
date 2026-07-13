import type { PlaylistTrack } from '~/components/playlist/types'
import { buildManifestLookup, parseProvenance } from './parseProvenance'
import type { ClassifiedTrack, TrackSource, YotoCardDetail, YotoTrack } from './types'
import { extractYoutubeIdFromUrl } from './youtubeUrl'
import { playlistRowId } from '#shared/myo-editor/playlistRowId'
import { flattenCardTracks } from '#shared/myo-editor/trackLookup'
import { toYotoTrackReuseSnapshot } from '#shared/myo-editor/yotoTrackPayload'

interface YoutubeVideoApiItem {
  id: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  publishedAt: string
}

const SOURCE_LABELS: Record<TrackSource, string> = {
  'app-youtube': 'YouTube',
  'youtube-url': 'YouTube URL',
  'yoto-upload': 'Yoto upload',
  stream: 'Stream',
  unknown: 'Unknown',
}

export function yotoTrackId(chapterKey: string, trackKey: string): string {
  return `yoto:${chapterKey}:${trackKey}`
}

function classifyTrack(
  track: YotoTrack,
  manifestLookup: Map<string, { youtubeId: string; title: string }>,
): ClassifiedTrack {
  const manifestEntry = manifestLookup.get(`${track.chapterKey}:${track.trackKey}`)
  if (manifestEntry) {
    return {
      ...track,
      source: 'app-youtube',
      youtubeId: manifestEntry.youtubeId,
      title: manifestEntry.title || track.title,
    }
  }

  const youtubeId = extractYoutubeIdFromUrl(track.trackUrl)
  if (youtubeId) {
    return {
      ...track,
      source: 'youtube-url',
      youtubeId,
    }
  }

  if (track.trackUrl?.startsWith('yoto:#')) {
    return {
      ...track,
      source: 'yoto-upload',
    }
  }

  if (track.type === 'stream') {
    return {
      ...track,
      source: 'stream',
    }
  }

  return {
    ...track,
    source: 'unknown',
  }
}

function formatDurationMinutes(seconds: number): string {
  if (!seconds) return ''
  return `${Math.round(seconds / 60)} min`
}

function buildSubtitle(
  source: TrackSource,
  duration: number,
  channel?: string,
): string {
  const parts: string[] = []
  if (channel) {
    parts.push(channel)
  }
  else {
    parts.push(SOURCE_LABELS[source])
  }
  const durationLabel = formatDurationMinutes(duration)
  if (durationLabel) {
    parts.push(durationLabel)
  }
  return parts.join(' · ')
}

async function hydrateAppYoutubeTracks(
  tracks: ClassifiedTrack[],
): Promise<Map<string, YoutubeVideoApiItem>> {
  const ids = [...new Set(
    tracks
      .filter(track => track.source === 'app-youtube' && track.youtubeId)
      .map(track => track.youtubeId!),
  )]

  const map = new Map<string, YoutubeVideoApiItem>()
  if (ids.length === 0) return map

  const batchSize = 50
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)
    const data = await $fetch<{ items: YoutubeVideoApiItem[] }>(
      '/api/youtube/videos',
      { query: { ids: batch.join(',') } },
    )
    for (const item of data.items ?? []) {
      map.set(item.id, item)
    }
  }

  return map
}

function classifiedTrackToPlaylistTrack(
  track: ClassifiedTrack,
  hydratedById: Map<string, YoutubeVideoApiItem>,
): PlaylistTrack {
  const base = {
    title: track.title,
    subtitle: '',
    thumbnailUrl: '',
    source: track.source,
    youtubeId: track.youtubeId,
    chapterKey: track.chapterKey,
    trackKey: track.trackKey,
    duration: track.duration || undefined,
    chapterDisplay: track.chapterDisplay,
    yotoReuse: toYotoTrackReuseSnapshot(track),
  }

  if (track.source === 'app-youtube' && track.youtubeId) {
    const hydrated = hydratedById.get(track.youtubeId)
    const rowId = playlistRowId({
      chapterKey: track.chapterKey,
      trackKey: track.trackKey,
      id: track.youtubeId,
    })
    return {
      ...base,
      id: rowId,
      title: hydrated?.title || track.title,
      subtitle: buildSubtitle(track.source, track.duration, hydrated?.channelTitle),
      thumbnailUrl: hydrated?.thumbnailUrl ?? '',
    }
  }

  return {
    ...base,
    id: playlistRowId({
      chapterKey: track.chapterKey,
      trackKey: track.trackKey,
      id: yotoTrackId(track.chapterKey, track.trackKey),
    }),
    subtitle: buildSubtitle(track.source, track.duration),
  }
}

export interface CardToPlaylistResult {
  tracks: PlaylistTrack[]
  isPodcast: boolean
}

export async function cardToPlaylist(detail: YotoCardDetail): Promise<CardToPlaylistResult> {
  const isPodcast = Boolean(detail.feedUrl?.trim())
  const manifest = parseProvenance(detail.metadataNote, detail.contentVersion)
  const manifestLookup = buildManifestLookup(manifest)
  const classified = flattenCardTracks(detail).map(track =>
    classifyTrack(track, manifestLookup),
  )
  const hydrated = await hydrateAppYoutubeTracks(classified)

  return {
    tracks: classified.map(track => classifiedTrackToPlaylistTrack(track, hydrated)),
    isPodcast,
  }
}
