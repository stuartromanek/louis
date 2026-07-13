import { clearYotoAuthCookies } from '../../../utils/yoto-auth'

export default defineEventHandler((event) => {
  clearYotoAuthCookies(event)
  return { ok: true }
})
