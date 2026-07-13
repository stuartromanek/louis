import { fetchYotoCardDetail } from '../../../../utils/yoto-card-detail'
import { getYotoAccessToken } from '../../../../utils/yoto'

export default defineEventHandler(async (event) => {
  const cardId = getRouterParam(event, 'cardId')
  if (!cardId) {
    throw createError({ statusCode: 400, statusMessage: 'cardId is required' })
  }

  const accessToken = await getYotoAccessToken(event)
  return fetchYotoCardDetail(cardId, accessToken)
})
