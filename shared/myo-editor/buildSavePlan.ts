import type { PlaylistTrack, SavePlan, SaveTrackAction, YotoCardDetail, YotoTrackReuseSnapshot } from './types'
import { baselineRowIds, playlistRowId } from './playlistRowId'
import { findOriginalTrack, isYotoHostedTrack } from './trackLookup'
import { toYotoTrackReuseSnapshot } from './yotoTrackPayload'

function reuseSnapshotForTrack(
  track: PlaylistTrack,
  detail: YotoCardDetail,
): YotoTrackReuseSnapshot | null {
  if (track.yotoReuse?.trackUrl?.startsWith('yoto:#')) {
    return track.yotoReuse
  }

  const original = findOriginalTrack(detail, track)
  if (original && isYotoHostedTrack(original)) {
    return toYotoTrackReuseSnapshot(original)
  }

  return null
}

function classifyTrack(
  track: PlaylistTrack,
  index: number,
  detail: YotoCardDetail,
  baselineIds: Set<string>,
): SaveTrackAction {
  if (track.source === 'unknown') {
    return {
      kind: 'unsupported',
      reason: `Unsupported track "${track.title}". Remove it before saving.`,
      playlistIndex: index,
    }
  }

  if (track.source === 'stream') {
    const snapshot = reuseSnapshotForTrack(track, detail)
    if (!snapshot) {
      return {
        kind: 'unsupported',
        reason: `Cannot save stream track "${track.title}" without original card data.`,
        playlistIndex: index,
      }
    }
    return { kind: 'passthrough-stream', snapshot, playlistIndex: index }
  }

  if (track.source === 'yoto-upload') {
    const snapshot = reuseSnapshotForTrack(track, detail)
    if (!snapshot) {
      return {
        kind: 'unsupported',
        reason: `Cannot reuse Yoto upload "${track.title}" without original track metadata.`,
        playlistIndex: index,
      }
    }
    return { kind: 'reuse-yoto', snapshot, playlistIndex: index }
  }

  const youtubeId = track.youtubeId ?? (track.source === 'app-youtube' ? track.id : undefined)

  if (track.source === 'youtube-url') {
    if (!youtubeId) {
      return {
        kind: 'unsupported',
        reason: `YouTube URL track "${track.title}" has no video ID.`,
        playlistIndex: index,
      }
    }
    return { kind: 'extract-youtube', youtubeId, playlistIndex: index }
  }

  if (track.source === 'app-youtube') {
    if (!youtubeId) {
      return {
        kind: 'unsupported',
        reason: `YouTube track "${track.title}" has no video ID.`,
        playlistIndex: index,
      }
    }

    const snapshot = reuseSnapshotForTrack(track, detail)
    const inBaseline = baselineIds.has(playlistRowId(track))

    if (inBaseline && snapshot) {
      return { kind: 'reuse-yoto', snapshot, playlistIndex: index }
    }

    return { kind: 'extract-youtube', youtubeId, playlistIndex: index }
  }

  return {
    kind: 'unsupported',
    reason: `Unsupported track source for "${track.title}".`,
    playlistIndex: index,
  }
}

export function buildSavePlan(
  baselinePlaylist: PlaylistTrack[],
  playlist: PlaylistTrack[],
  detail: YotoCardDetail,
): SavePlan {
  const errors: string[] = []

  if (detail.feedUrl?.trim()) {
    errors.push('Podcast cards cannot be edited yet.')
    return { tracks: [], errors }
  }

  const youtubeIds = playlist
    .map(track => track.youtubeId ?? (track.source === 'app-youtube' ? track.id : undefined))
    .filter((id): id is string => Boolean(id))

  const seen = new Set<string>()
  for (const id of youtubeIds) {
    if (seen.has(id)) {
      errors.push(`Duplicate YouTube video in playlist: ${id}`)
    }
    seen.add(id)
  }

  const baselineIds = baselineRowIds(baselinePlaylist)

  const tracks = playlist.map((track, index) =>
    classifyTrack(track, index, detail, baselineIds),
  )

  for (const action of tracks) {
    if (action.kind === 'unsupported') {
      errors.push(action.reason)
    }
  }

  return { tracks, errors }
}
