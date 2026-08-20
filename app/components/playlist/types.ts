import type { YoutubeVideoSummary } from '~/components/youtube-picker/types'
import { sanitizeYoutubeTitle } from '#shared/myo-editor/sanitizeYoutubeTitle'

export type { PlaylistTrack } from '#shared/myo-editor/types'
import type { PlaylistTrack } from '#shared/myo-editor/types'

export function pickerVideoToPlaylistTrack(video: YoutubeVideoSummary): PlaylistTrack {
  return {
    id: video.id,
    title: sanitizeYoutubeTitle(video.title),
    subtitle: video.channelTitle,
    thumbnailUrl: video.thumbnailUrl,
    source: 'app-youtube',
    youtubeId: video.id,
    duration: typeof video.durationSeconds === 'number' && video.durationSeconds > 0
      ? video.durationSeconds
      : undefined,
  }
}

function incomingYoutubeId(track: PlaylistTrack): string | undefined {
  const id = track.youtubeId || (track.source === 'app-youtube' ? track.id : undefined)
  const trimmed = id?.trim()
  return trimmed || undefined
}

/** Same playlist row id, or the same YouTube video already on the card. */
export function playlistHasTrack(playlist: PlaylistTrack[], track: PlaylistTrack): boolean {
  if (playlist.some(item => item.id === track.id)) return true
  const youtubeId = incomingYoutubeId(track)
  if (!youtubeId) return false
  return playlist.some(item => item.youtubeId === youtubeId || item.id === youtubeId)
}
