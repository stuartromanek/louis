import { contentChaptersFromDetail } from '#shared/myo-editor/patchCardIcon'
import { buildProvenance } from '#shared/myo-editor/parseProvenance'
import { fetchYotoCardDetail } from '../../../../utils/yoto-card-detail'
import { createOrUpdateContent } from '../../../../utils/yoto-content'
import { mergeContentMetadata } from '../../../../utils/yoto-metadata'
import { hasContentManageScope } from '../../../../utils/yoto-auth'
import { getYotoAccessToken, getYotoAuthScope } from '../../../../utils/yoto'

interface PatchTitleBody {
  cardTitle?: string
}

export default defineEventHandler(async (event) => {
  const cardId = getRouterParam(event, 'cardId')
  if (!cardId) {
    throw createError({ statusCode: 400, statusMessage: 'cardId is required' })
  }

  const scope = getYotoAuthScope(event)
  if (!hasContentManageScope(scope)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Reconnect to Yoto to grant playlist edit permission (user:content:manage).',
    })
  }

  const accessToken = await getYotoAccessToken(event)
  const body = await readBody<PatchTitleBody>(event)
  const title = body?.cardTitle?.trim()
  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'cardTitle is required' })
  }

  const detail = await fetchYotoCardDetail(cardId, accessToken)
  const chapters = contentChaptersFromDetail(detail)

  await createOrUpdateContent(accessToken, {
    cardId,
    title,
    content: {
      version: detail.contentVersion ?? undefined,
      chapters,
    },
    metadata: mergeContentMetadata(detail.metadata, {
      title,
      note: detail.metadataNote ?? detail.metadata?.note ?? buildProvenance([]).note,
      media: {
        duration: detail.metadata?.media?.duration ?? 0,
        fileSize: detail.metadata?.media?.fileSize ?? 0,
        readableFileSize: detail.metadata?.media?.readableFileSize ?? 0,
      },
    }),
  })

  return { ok: true as const, title }
})
