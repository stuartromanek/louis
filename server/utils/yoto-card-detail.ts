import type { YotoCardDetail, YotoTrackDetail } from '#shared/myo-editor/types'
import type { YotoCardMetadata } from '#shared/myo-editor/types'
import { fetchYotoApi } from './yoto'

interface YotoApiTrack {
  key: string
  title: string
  trackUrl: string
  type: string
  duration?: number
  format?: string
  fileSize?: number
  channels?: string | number
  overlayLabel?: string
  display?: { icon16x16?: string | null }
  uid?: string
}

interface YotoApiChapter {
  key: string
  title: string
  display?: { icon16x16?: string | null }
  tracks?: YotoApiTrack[]
}

interface YotoApiCardDetail {
  cardId: string
  title: string
  content?: {
    version?: string
    chapters?: YotoApiChapter[]
  }
  metadata?: YotoCardMetadata
}

interface YotoApiCardDetailResponse {
  card?: YotoApiCardDetail
}

function unwrapCard(data: YotoApiCardDetailResponse & YotoApiCardDetail): YotoApiCardDetail {
  return data.card ?? data
}

function mapChannels(channels: string | number | undefined): 'stereo' | 'mono' | undefined {
  if (channels === 'stereo' || channels === 2 || channels === '2') return 'stereo'
  if (channels === 'mono' || channels === 1 || channels === '1') return 'mono'
  return undefined
}

function mapTrack(chapterKey: string, track: YotoApiTrack): YotoTrackDetail {
  return {
    chapterKey,
    trackKey: track.key,
    key: track.key,
    title: track.title,
    trackUrl: track.trackUrl,
    type: track.type === 'stream' ? 'stream' : 'audio',
    format: track.format ?? '',
    duration: track.duration ?? 0,
    fileSize: track.fileSize ?? 0,
    overlayLabel: track.overlayLabel ?? track.key,
    channels: mapChannels(track.channels),
    display: track.display ? { icon16x16: track.display.icon16x16 ?? null } : undefined,
    uid: track.uid,
  }
}

export function mapYotoCardDetail(data: YotoApiCardDetail): YotoCardDetail {
  const chapters = (data.content?.chapters ?? []).map(chapter => ({
    key: chapter.key,
    title: chapter.title,
    display: chapter.display
      ? { icon16x16: chapter.display.icon16x16 ?? null }
      : undefined,
    tracks: (chapter.tracks ?? []).map(track => mapTrack(chapter.key, track)),
  }))

  const metadata = data.metadata ?? null

  return {
    cardId: data.cardId,
    title: data.title,
    contentVersion: data.content?.version ?? null,
    metadataNote: metadata?.note ?? null,
    feedUrl: metadata?.feedUrl ?? null,
    metadata,
    chapters,
  }
}

export async function fetchYotoCardDetail(
  cardId: string,
  accessToken: string,
): Promise<YotoCardDetail> {
  const raw = await fetchYotoApi<YotoApiCardDetailResponse & YotoApiCardDetail>(
    `/content/${cardId}`,
    accessToken,
  )
  return mapYotoCardDetail(unwrapCard(raw))
}
