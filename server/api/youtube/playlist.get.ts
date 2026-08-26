import { isYoutubePlaylistId } from '#shared/myo-editor/youtubePlaylistImport'
import { discoverYoutubePlaylist } from '../../utils/youtube-discovery'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const playlistId = String(query.playlistId ?? '').trim()
  const pageToken = query.pageToken ? String(query.pageToken) : undefined

  if (!isYoutubePlaylistId(playlistId)) {
    throw createError({
      statusCode: 400,
      message: 'A valid YouTube playlist ID is required',
    })
  }

  return await discoverYoutubePlaylist(event, { playlistId, pageToken })
})
