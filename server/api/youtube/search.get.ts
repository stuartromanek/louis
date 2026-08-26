import { discoverYoutubeSearch } from '../../utils/youtube-discovery'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q ?? '').trim()
  const channelId = String(query.channelId ?? '').trim()

  if (!q && !channelId) {
    throw createError({ statusCode: 400, statusMessage: 'Query parameter "q" is required' })
  }

  const pageToken = query.pageToken ? String(query.pageToken) : undefined
  const maxResults = Math.min(Number(query.maxResults) || 12, 50)

  return await discoverYoutubeSearch(event, {
    q: q || undefined,
    channelId: channelId || undefined,
    pageToken,
    maxResults,
  })
})
