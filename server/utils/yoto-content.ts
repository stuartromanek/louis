import type { YotoTrackPayload } from '#shared/myo-editor/types'
import type { YotoCardMetadata } from '#shared/myo-editor/types'
import { fetchYotoApi } from './yoto'

export interface YotoContentChapter {
  key: string
  title: string
  overlayLabel?: string
  tracks: YotoTrackPayload[]
  display?: { icon16x16: string | null }
  duration?: number
  fileSize?: number
}

export interface CreateOrUpdateContentBody {
  cardId?: string
  title: string
  content: {
    version?: string
    chapters: YotoContentChapter[]
  }
  metadata: YotoCardMetadata & {
    title: string
    note?: string
    media?: {
      duration?: number
      fileSize?: number
      readableFileSize?: number
    }
  }
}

interface CreateOrUpdateContentResponse {
  card?: { cardId?: string }
  cardId?: string
}

export async function createOrUpdateContent(
  accessToken: string,
  body: CreateOrUpdateContentBody,
): Promise<CreateOrUpdateContentResponse> {
  return fetchYotoApi<CreateOrUpdateContentResponse>('/content', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}
