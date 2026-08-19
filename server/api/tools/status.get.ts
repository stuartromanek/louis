import { getToolsStatus } from '../../utils/ytdlp-update'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const check = query.check === '1' || query.check === 'true'
  return getToolsStatus(event, { check })
})
