import { getSystemDepsStatus, isSystemReady } from '../utils/system-deps'
import { getPipelineLogStatus } from '../utils/pipeline-log'

export default defineEventHandler(async (event) => {
  const status = await getSystemDepsStatus(event)
  const ready = isSystemReady(status)
  const pipelineLog = await getPipelineLogStatus(event)

  setResponseStatus(event, ready ? 200 : 503)

  return {
    status: ready ? 'ok' : 'degraded',
    checks: status,
    pipelineLog,
  }
})
