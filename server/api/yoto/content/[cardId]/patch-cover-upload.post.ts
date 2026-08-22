import { PLAYLIST_COVER_UPLOAD_MAX_BYTES } from '#shared/myo-editor/playlistCoverCrop'
import { hasContentManageScope } from '../../../../utils/yoto-auth'
import { getYotoAccessToken, getYotoAuthScope } from '../../../../utils/yoto'
import { applyPlaylistCoverUrl, uploadYotoCover } from '../../../../utils/yoto-cover'

function looksLikePng(buffer: Buffer): boolean {
  return buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
}

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

  const form = await readMultipartFormData(event)
  const filePart = form?.find(part => part.name === 'file' && part.data?.length)
  if (!filePart) {
    throw createError({ statusCode: 400, statusMessage: 'Missing cover image' })
  }

  const buffer = Buffer.from(filePart.data)
  if (buffer.length < 32 || buffer.length > PLAYLIST_COVER_UPLOAD_MAX_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cover image size out of range',
    })
  }
  if (!looksLikePng(buffer)) {
    throw createError({ statusCode: 400, statusMessage: 'Cover must be a PNG' })
  }

  const accessToken = await getYotoAccessToken(event)
  const { mediaUrl } = await uploadYotoCover(accessToken, buffer, 'cover.png')
  await applyPlaylistCoverUrl(accessToken, cardId, mediaUrl)
  return { ok: true as const, coverUrl: mediaUrl }
})
