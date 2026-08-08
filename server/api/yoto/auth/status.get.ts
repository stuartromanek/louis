import { isYotoConfigured, isYotoConnected, getYotoAuthScope } from '../../../utils/yoto'
import { hasContentManageScope } from '../../../utils/yoto-auth'

export default defineEventHandler((event) => {
  const scope = getYotoAuthScope(event)
  return {
    configured: isYotoConfigured(event),
    connected: isYotoConnected(event),
    hasWriteScope: hasContentManageScope(scope),
  }
})
