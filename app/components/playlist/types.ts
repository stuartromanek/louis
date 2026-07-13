import type { YoutubeVideoSummary } from '~/components/youtube-picker/types'

export type { PlaylistTrack } from '#shared/myo-editor/types'
import type { PlaylistTrack } from '#shared/myo-editor/types'

export function pickerVideoToPlaylistTrack(video: YoutubeVideoSummary): PlaylistTrack {
  return {
    id: video.id,
    title: video.title,
    subtitle: video.channelTitle,
    thumbnailUrl: video.thumbnailUrl,
    source: 'app-youtube',
    youtubeId: video.id,
  }
}
