import { resolveIconPreviewUrl, uploadYotoIcon } from '../../../utils/yoto-icons'

export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  if (!form?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Expected multipart form with a file field',
    })
  }

  const filePart = form.find(part => part.name === 'file' && part.data?.length)
  if (!filePart) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing file',
    })
  }

  const filenamePart = form.find(part => part.name === 'filename')
  const filename = (
    (filenamePart?.data ? Buffer.from(filenamePart.data).toString('utf8') : '')
    || filePart.filename
    || 'icon.png'
  ).trim() || 'icon.png'

  const autoConvertPart = form.find(part => part.name === 'autoConvert')
  const autoConvertRaw = autoConvertPart?.data
    ? Buffer.from(autoConvertPart.data).toString('utf8').trim().toLowerCase()
    : 'false'
  const autoConvert = autoConvertRaw === '1' || autoConvertRaw === 'true'

  const contentType = filePart.type || 'image/png'
  const buffer = Buffer.from(filePart.data)

  if (buffer.length < 16 || buffer.length > 512_000) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Icon image size out of range (max 512 KB)',
    })
  }

  const result = await uploadYotoIcon(event, buffer, {
    filename,
    contentType,
    autoConvert,
  })

  const mediaId = result.displayIcon.mediaId
  if (!mediaId) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Icon upload succeeded but no mediaId was returned',
    })
  }

  const url = await resolveIconPreviewUrl(event, mediaId, result.displayIcon.url)

  return {
    mediaId,
    displayIconId: result.displayIcon.displayIconId ?? null,
    url,
    new: result.displayIcon.new === true,
  }
})
