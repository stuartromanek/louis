import type { PlaylistTrack } from './types'

/** Stable row identity for playlist UI + save matching (unique per card track). */
export function playlistRowId(track: Pick<PlaylistTrack, 'chapterKey' | 'trackKey' | 'id'>): string {
  if (track.chapterKey && track.trackKey) {
    return `yoto:${track.chapterKey}:${track.trackKey}`
  }
  return track.id
}

export function baselineRowIds(baseline: PlaylistTrack[]): Set<string> {
  return new Set(baseline.map(playlistRowId))
}
