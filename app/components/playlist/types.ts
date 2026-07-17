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
