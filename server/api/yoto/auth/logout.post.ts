import { clearYotoAuthCookies } from '../../../utils/yoto-auth'
import { clearYotoDesktopSession } from '../../../utils/yoto-desktop-session'

export default defineEventHandler((event) => {
  clearYotoAuthCookies(event)
  clearYotoDesktopSession()
  return { ok: true }
})
