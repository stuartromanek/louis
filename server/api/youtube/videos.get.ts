import { discoverYoutubeVideos } from '../../utils/youtube-discovery'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const ids = String(query.ids ?? '').trim()

  if (!ids) {
    throw createError({ statusCode: 400, statusMessage: 'Query parameter "ids" is required' })
  }

  const idList = ids.split(',').map(id => id.trim()).filter(Boolean)
  if (idList.length === 0 || idList.length > 50) {
    throw createError({ statusCode: 400, statusMessage: 'Provide 1–50 comma-separated video IDs' })
  }

  return await discoverYoutubeVideos(event, idList)
})
