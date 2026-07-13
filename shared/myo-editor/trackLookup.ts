import type { PlaylistTrack, YotoCardDetail, YotoTrackDetail } from './types'
import { buildManifestLookup, parseProvenance } from './parseProvenance'

export function flattenCardTracks(detail: YotoCardDetail): YotoTrackDetail[] {
  const tracks: YotoTrackDetail[] = []
  for (const chapter of detail.chapters) {
    const chapterDisplay = chapter.display
    for (const track of chapter.tracks) {
      tracks.push({
        ...track,
        chapterDisplay,
      })
    }
  }
  return tracks
}

export function findOriginalTrackByKeys(
  detail: YotoCardDetail,
  chapterKey: string | undefined,
  trackKey: string | undefined,
): YotoTrackDetail | undefined {
  if (!chapterKey || !trackKey) return undefined
  return flattenCardTracks(detail).find(
    track => track.chapterKey === chapterKey && track.trackKey === trackKey,
  )
}

export function findOriginalTrackByYoutubeId(
  detail: YotoCardDetail,
  youtubeId: string,
  chapterKey?: string,
  trackKey?: string,
): YotoTrackDetail | undefined {
  const manifest = parseProvenance(detail.metadataNote, detail.contentVersion)
  const lookup = buildManifestLookup(manifest)

  for (const track of flattenCardTracks(detail)) {
    if (chapterKey && trackKey) {
      if (track.chapterKey !== chapterKey || track.trackKey !== trackKey) continue
    }

    const entry = lookup.get(`${track.chapterKey}:${track.trackKey}`)
    if (entry?.youtubeId === youtubeId) {
      return track
    }
  }

  return undefined
}

export function findOriginalTrack(
  detail: YotoCardDetail,
  playlistTrack: PlaylistTrack,
): YotoTrackDetail | undefined {
  const byKeys = findOriginalTrackByKeys(
    detail,
    playlistTrack.chapterKey,
    playlistTrack.trackKey,
  )
  if (byKeys) return byKeys

  if (playlistTrack.youtubeId) {
    return findOriginalTrackByYoutubeId(
      detail,
      playlistTrack.youtubeId,
      playlistTrack.chapterKey,
      playlistTrack.trackKey,
    )
  }

  return undefined
}

export function isYotoHostedTrack(track: YotoTrackDetail): boolean {
  return track.trackUrl?.startsWith('yoto:#') ?? false
}
