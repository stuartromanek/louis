import { updateManagedYtdlp } from '../../utils/ytdlp-update'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ target?: string }>(event).catch(() => ({}))
  const target = String(body?.target || 'ytdlp')
  if (target !== 'ytdlp') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only target=ytdlp is supported.',
    })
  }
  const result = await updateManagedYtdlp(event)
  return {
    target: 'ytdlp',
    version: result.version,
    path: result.path,
    restartSuggested: Boolean(useRuntimeConfig(event).public.desktop),
  }
})
