import { Feedback } from '@dnd-kit/dom'
import type { Plugins } from '@dnd-kit/abstract'
import type { PlaylistTrack } from '~/components/playlist/types'
import type { YoutubeVideoSummary } from '~/components/youtube-picker/types'

export const PLAYLIST_DROPZONE_ID = 'playlist-dropzone'

export type ResultDragData = {
  type: 'result'
  video: YoutubeVideoSummary
}

export type PlaylistDragData = {
  type: 'playlist'
  track: PlaylistTrack
}

export type DndItemData = ResultDragData | PlaylistDragData

export function resultDragId(videoId: string) {
  return `result:${videoId}`
}

export function playlistDragId(trackId: string) {
  return `playlist:${trackId}`
}

/** Clone drag feedback and skip the snap-back drop animation. */
export function configurePlaylistDndPlugins(defaults: Plugins): Plugins {
  return defaults.map(plugin =>
    plugin === Feedback
      ? Feedback.configure({ feedback: 'clone', dropAnimation: null })
      : plugin,
  )
}
