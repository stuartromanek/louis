import { searchYotoicons } from '../../utils/yotoicons'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''

  if (!q) {
    return { icons: [] as Awaited<ReturnType<typeof searchYotoicons>> }
  }

  if (q.length > 80) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Search query too long',
    })
  }

  try {
    const icons = await searchYotoicons(q)
    return { icons }
  }
  catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string }
    throw createError({
      statusCode: e.statusCode ?? 502,
      statusMessage: e.message ?? 'Failed to search yotoicons.com',
    })
  }
})
