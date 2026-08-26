import { discoverYoutubeChannel } from '../../utils/youtube-discovery'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const channelId = String(query.channelId ?? '').trim()
  const handle = String(query.handle ?? '').trim()
  const username = String(query.username ?? '').trim()
  const custom = String(query.custom ?? '').trim()
  const pageToken = query.pageToken ? String(query.pageToken) : undefined
  const maxResults = Math.min(Number(query.maxResults) || 12, 50)

  if (pageToken && !channelId) {
    throw createError({
      statusCode: 400,
      message: 'channelId is required when loading more channel videos',
    })
  }

  if (!channelId && !handle && !username && !custom) {
    throw createError({
      statusCode: 400,
      message: 'A YouTube channel id, handle, username, or custom URL is required',
    })
  }

  return await discoverYoutubeChannel(event, {
    channelId: channelId || undefined,
    handle: handle || undefined,
    username: username || undefined,
    custom: custom || undefined,
    pageToken,
    maxResults,
  })
})
