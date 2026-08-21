import type { YoutubeVideoSummary } from '~/components/youtube-picker/types'
import { sanitizeYoutubeTitle } from '#shared/myo-editor/sanitizeYoutubeTitle'
import {
  makeTrackSplit,
  planTrackSplit,
  splitPartTitle,
  splitPartTrackId,
} from '#shared/myo-editor/splitTrack'

export type { PlaylistTrack } from '#shared/myo-editor/types'
import type { PlaylistTrack } from '#shared/myo-editor/types'
export { playlistHasTrack } from '#shared/myo-editor/playlistTrackMatch'

export function pickerVideoToPlaylistTracks(video: YoutubeVideoSummary): PlaylistTrack[] {
  const title = sanitizeYoutubeTitle(video.title)
  const duration = typeof video.durationSeconds === 'number' && video.durationSeconds > 0
    ? video.durationSeconds
    : undefined
  const plan = duration ? planTrackSplit(duration) : null

  if (!plan) {
    return [{
      id: video.id,
      title,
      subtitle: video.channelTitle,
      thumbnailUrl: video.thumbnailUrl,
      source: 'app-youtube',
      youtubeId: video.id,
      duration,
    }]
  }

  return plan.parts.map((part, index) => ({
    id: splitPartTrackId(video.id, index),
    title: splitPartTitle(title, index),
    subtitle: video.channelTitle,
    thumbnailUrl: video.thumbnailUrl,
    source: 'app-youtube' as const,
    youtubeId: video.id,
    duration: part.duration,
    split: makeTrackSplit(video.id, index, plan),
  }))
}

/** @deprecated Prefer pickerVideoToPlaylistTracks — long videos expand into multiple rows. */
export function pickerVideoToPlaylistTrack(video: YoutubeVideoSummary): PlaylistTrack {
  return pickerVideoToPlaylistTracks(video)[0]!
}

export function videosToPlaylistTracks(videos: YoutubeVideoSummary[]): PlaylistTrack[] {
  return videos.flatMap(pickerVideoToPlaylistTracks)
}
