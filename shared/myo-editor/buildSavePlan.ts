import type { PlaylistTrack, SavePlan, SaveTrackAction, YotoCardDetail, YotoTrackReuseSnapshot } from './types.ts'
import { baselineRowIds, playlistRowId } from './playlistRowId.ts'
import { findOriginalTrack, isYotoHostedTrack } from './trackLookup.ts'
import { toYotoTrackReuseSnapshot } from './yotoTrackPayload.ts'
import { isCompleteSplitCopy } from './splitTrack.ts'

function youtubeIdForTrack(track: PlaylistTrack): string | undefined {
  const id = track.youtubeId ?? (track.source === 'app-youtube' ? track.id : undefined)
  const trimmed = id?.trim()
  return trimmed || undefined
}

function duplicateYoutubeError(playlist: PlaylistTrack[]): string | null {
  const byId = new Map<string, PlaylistTrack[]>()
  for (const track of playlist) {
    const youtubeId = youtubeIdForTrack(track)
    if (!youtubeId) continue
    const list = byId.get(youtubeId) ?? []
    list.push(track)
    byId.set(youtubeId, list)
  }

  for (const [youtubeId, tracks] of byId) {
    if (tracks.length === 1) continue
    if (isCompleteSplitCopy(tracks)) continue
    return `Duplicate YouTube video in playlist: ${youtubeId}`
  }
  return null
}

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
    return { kind: 'extract-youtube', youtubeId, playlistIndex: index, split: track.split }
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

    return { kind: 'extract-youtube', youtubeId, playlistIndex: index, split: track.split }
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
    errors.push('Podcasts cannot be edited yet.')
    return { tracks: [], errors }
  }

  const duplicateError = duplicateYoutubeError(playlist)
  if (duplicateError) errors.push(duplicateError)

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

export const EMPTY_CARD_DETAIL: YotoCardDetail = {
  cardId: '',
  title: '',
  contentVersion: null,
  metadataNote: null,
  feedUrl: null,
  metadata: null,
  chapters: [],
}

/** True when this Update will download/transcode at least one YouTube track. */
export function playlistSaveExtractsYoutube(
  baselinePlaylist: PlaylistTrack[],
  playlist: PlaylistTrack[],
  detail: YotoCardDetail | null,
): boolean {
  const plan = buildSavePlan(baselinePlaylist, playlist, detail ?? EMPTY_CARD_DETAIL)
  return plan.tracks.some(action => action.kind === 'extract-youtube')
}
