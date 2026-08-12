/**
 * Same-origin image proxy so the Draw tab can sample icon pixels (canvas
 * getImageData requires CORS; Yoto/yotoicons CDNs typically don't send it).
 */
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

  const host = parsed.hostname
  const allowed
    = host === 'yotoicons.com'
      || host === 'www.yotoicons.com'
      || host === 'yotoplay.com'
      || host.endsWith('.yotoplay.com')
  if (!allowed) {
    throw createError({ statusCode: 400, statusMessage: 'Image host not allowed' })
  }
  return parsed
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawUrl = typeof query.url === 'string' ? query.url.trim() : ''
  if (!rawUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Missing url' })
  }
  if (rawUrl.length > 2048) {
    throw createError({ statusCode: 400, statusMessage: 'URL too long' })
  }

  const parsed = assertAllowedIconUrl(rawUrl)

  let bytes: ArrayBuffer
  try {
    bytes = await $fetch<ArrayBuffer>(parsed.toString(), {
      responseType: 'arrayBuffer',
      headers: {
        Accept: 'image/png,image/*,*/*',
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
  if (buffer.length < 16 || buffer.length > 512_000) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Icon image size out of range',
    })
  }

  const path = parsed.pathname.toLowerCase()
  const contentType = path.endsWith('.jpg') || path.endsWith('.jpeg')
    ? 'image/jpeg'
    : path.endsWith('.webp')
      ? 'image/webp'
      : path.endsWith('.gif')
        ? 'image/gif'
        : 'image/png'

  setHeader(event, 'Content-Type', contentType)
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  return send(event, buffer)
})
