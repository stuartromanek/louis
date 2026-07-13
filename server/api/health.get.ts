import { getSystemDepsStatus, isSystemReady } from '../utils/system-deps'

export default defineEventHandler(async (event) => {
  const status = await getSystemDepsStatus(event)
  const ready = isSystemReady(status)

  setResponseStatus(event, ready ? 200 : 503)

  return {
    status: ready ? 'ok' : 'degraded',
    checks: status,
  }
})
