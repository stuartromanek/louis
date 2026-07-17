import { getScopeCookie, hasContentManageScope } from '../../../../utils/yoto-auth'
import { startSaveJob } from '../../../../utils/save-jobs'
import { getYotoAccessToken } from '../../../../utils/yoto'
import type { PlaylistTrack } from '#shared/myo-editor/types'

interface SaveRequestBody {
  playlist: PlaylistTrack[]
  baselinePlaylist: PlaylistTrack[]
  cardTitle: string
  /** When true, skip our MYO capacity gates and let Yoto decide. */
  acknowledgeCapacityRisk?: boolean
}

export default defineEventHandler(async (event) => {
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

  const body = await readBody<SaveRequestBody>(event)
  if (!Array.isArray(body?.playlist) || body.playlist.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'playlist is required' })
  }

  const job = startSaveJob(
    event,
    cardId,
    body.playlist,
    body.cardTitle?.trim() || 'My Card',
    Array.isArray(body.baselinePlaylist) ? body.baselinePlaylist : [],
    { acknowledgeCapacityRisk: body.acknowledgeCapacityRisk === true },
  )

  return { jobId: job.id, status: job.status }
})
