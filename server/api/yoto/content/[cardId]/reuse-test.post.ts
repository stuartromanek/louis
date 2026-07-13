import { testReuseContentUpdate } from '../../../../utils/save-jobs'
import { getScopeCookie, hasContentManageScope } from '../../../../utils/yoto-auth'
import { getYotoAccessToken } from '../../../../utils/yoto'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.enableDebugRoutes) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const cardId = getRouterParam(event, 'cardId')
  if (!cardId) {
    throw createError({ statusCode: 400, statusMessage: 'cardId is required' })
  }

  const scope = getScopeCookie(event)
  if (!hasContentManageScope(scope)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Reconnect to Yoto to grant playlist edit permission (user:content:manage).',
    })
  }

  await getYotoAccessToken(event)
  return testReuseContentUpdate(event, cardId)
})
