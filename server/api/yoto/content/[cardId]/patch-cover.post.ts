import { parsePlaylistArtworkSpec } from '#shared/myo-editor/playlistArtwork'
import { hasContentManageScope } from '../../../../utils/yoto-auth'
import { getYotoAccessToken, getYotoAuthScope } from '../../../../utils/yoto'
import { applyPlaylistCoverUrl, generateAndUploadPlaylistCover } from '../../../../utils/yoto-cover'

export default defineEventHandler(async (event) => {
  const cardId = getRouterParam(event, 'cardId')
  if (!cardId) {
    throw createError({ statusCode: 400, statusMessage: 'cardId is required' })
  }

  const scope = getYotoAuthScope(event)
  if (!hasContentManageScope(scope)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Reconnect to Yoto to grant playlist edit permission (user:content:manage).',
    })
  }

  const accessToken = await getYotoAccessToken(event)
  const spec = parsePlaylistArtworkSpec(await readBody(event))
  if (!spec) {
    throw createError({
      statusCode: 400,
      statusMessage: 'style, seed, and backgroundColor are required',
    })
  }

  const { mediaUrl } = await generateAndUploadPlaylistCover(accessToken, spec)
  await applyPlaylistCoverUrl(accessToken, cardId, mediaUrl)
  return { ok: true as const, coverUrl: mediaUrl }
})
