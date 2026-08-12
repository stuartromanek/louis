import { resolveIconPreviewUrl, uploadYotoIcon } from '../../../utils/yoto-icons'

const ALLOWED_HOSTS = new Set([
  'yotoicons.com',
  'www.yotoicons.com',
])

function assertAllowedIconUrl(raw: string): URL {
  let parsed: URL
  try {
    parsed = new URL(raw)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid image URL' })
  }
  if (parsed.protocol !== 'https:') {
    throw createError({ statusCode: 400, statusMessage: 'Image URL must be https' })
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw createError({ statusCode: 400, statusMessage: 'Image host not allowed' })
  }
  return parsed
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ url?: string; filename?: string }>(event)
  const rawUrl = typeof body?.url === 'string' ? body.url.trim() : ''
  if (!rawUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Missing url' })
  }

  const parsed = assertAllowedIconUrl(rawUrl)
  const filename = (typeof body?.filename === 'string' && body.filename.trim())
    || 'yotoicons.png'

  let bytes: ArrayBuffer
  try {
    bytes = await $fetch<ArrayBuffer>(parsed.toString(), {
      responseType: 'arrayBuffer',
      headers: {
        Accept: 'image/png,image/*',
        'User-Agent': 'LouisYotoCards/1.0 (+https://github.com)',
      },
    })
  }
  catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to download icon image',
    })
  }

  const buffer = Buffer.from(bytes)
  if (buffer.length < 32 || buffer.length > 512_000) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Icon image size out of range',
    })
  }

  const result = await uploadYotoIcon(event, buffer, {
    filename,
    contentType: 'image/png',
    autoConvert: true,
  })

  const mediaId = result.displayIcon.mediaId
  if (!mediaId) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Icon upload succeeded but no mediaId was returned',
    })
  }

  return {
    mediaId,
    displayIconId: result.displayIcon.displayIconId ?? null,
    url: await resolveIconPreviewUrl(event, mediaId, result.displayIcon.url) || rawUrl,
    new: result.displayIcon.new === true,
  }
})
