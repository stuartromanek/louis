import type { PlaylistTrack } from './types.ts'

export function playlistTrackYoutubeId(track: PlaylistTrack): string | undefined {
  const id = track.youtubeId || (track.source === 'app-youtube' ? track.id : undefined)
  const trimmed = id?.trim()
  return trimmed || undefined
}

export function playlistHasYoutubeVideo(playlist: PlaylistTrack[], youtubeId: string): boolean {
  const needle = youtubeId.trim()
  if (!needle) return false
  return playlist.some(item =>
    item.id === needle
    || item.youtubeId === needle
    || playlistTrackYoutubeId(item) === needle,
  )
}

/** Same playlist row id, or the same YouTube video already on the card. */
export function playlistHasTrack(playlist: PlaylistTrack[], track: PlaylistTrack): boolean {
  if (playlist.some(item => item.id === track.id)) return true
  const youtubeId = playlistTrackYoutubeId(track)
  if (!youtubeId) return false
  return playlistHasYoutubeVideo(playlist, youtubeId)
}
