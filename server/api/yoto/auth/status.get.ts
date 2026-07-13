import { isYotoConfigured, isYotoConnected } from '../../../utils/yoto'
import { getScopeCookie, hasContentManageScope } from '../../../utils/yoto-auth'

export default defineEventHandler((event) => {
  const scope = getScopeCookie(event)
  return {
    configured: isYotoConfigured(event),
    connected: isYotoConnected(event),
    hasWriteScope: hasContentManageScope(scope),
  }
})
