import { PatchCardIconError, patchCardDetailIcons } from '#shared/myo-editor/patchCardIcon'
import { buildProvenance } from '#shared/myo-editor/parseProvenance'
import { fetchYotoCardDetail } from '../../../../utils/yoto-card-detail'
import { createOrUpdateContent } from '../../../../utils/yoto-content'
import { mergeContentMetadata } from '../../../../utils/yoto-metadata'
import { getScopeCookie, hasContentManageScope } from '../../../../utils/yoto-auth'
import { getYotoAccessToken } from '../../../../utils/yoto'

interface PatchIconBody {
  chapterKey?: string
  trackKey?: string
  icon16x16?: string
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

  const accessToken = await getYotoAccessToken(event)
  const body = await readBody<PatchIconBody>(event)

  const chapterKey = body?.chapterKey?.trim()
  const trackKey = body?.trackKey?.trim()
  const icon16x16 = body?.icon16x16?.trim()

  if (!chapterKey || !trackKey || !icon16x16) {
    throw createError({
      statusCode: 400,
      statusMessage: 'chapterKey, trackKey, and icon16x16 are required',
    })
  }

  const detail = await fetchYotoCardDetail(cardId, accessToken)

  let chapters
  try {
    chapters = patchCardDetailIcons(detail, chapterKey, trackKey, icon16x16)
  }
  catch (err: unknown) {
    if (err instanceof PatchCardIconError) {
      throw createError({ statusCode: 404, statusMessage: err.message })
    }
    throw err
  }

  await createOrUpdateContent(accessToken, {
    cardId,
    title: detail.title,
    content: {
      version: detail.contentVersion ?? undefined,
      chapters,
    },
    metadata: mergeContentMetadata(detail.metadata, {
      title: detail.title,
      note: detail.metadataNote ?? detail.metadata?.note ?? buildProvenance([]).note,
      media: {
        duration: detail.metadata?.media?.duration ?? 0,
        fileSize: detail.metadata?.media?.fileSize ?? 0,
        readableFileSize: detail.metadata?.media?.readableFileSize ?? 0,
      },
    }),
  })

  return { ok: true as const }
})
