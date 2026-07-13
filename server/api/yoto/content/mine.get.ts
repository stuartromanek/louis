import { fetchYotoApi, getYotoAccessToken } from '../../../utils/yoto'

interface YotoApiCard {
  cardId: string
  title: string
  updatedAt: string
  deleted?: boolean
  metadata?: {
    author?: string
    cover?: { imageL?: string | null }
    media?: { duration?: number }
  }
}

interface YotoContentMineResponse {
  cards?: YotoApiCard[]
}

interface YotoApiChapter {
  tracks?: unknown[]
}

interface YotoApiCardDetail {
  content?: {
    chapters?: YotoApiChapter[]
  }
}

interface YotoApiCardDetailResponse {
  card?: YotoApiCardDetail
}

const DETAIL_FETCH_CONCURRENCY = 5

function unwrapCard(data: YotoApiCardDetailResponse & YotoApiCardDetail): YotoApiCardDetail {
  return data.card ?? data
}

function countTracks(chapters: YotoApiChapter[] | undefined): number {
  return (chapters ?? []).reduce((sum, chapter) => sum + (chapter.tracks?.length ?? 0), 0)
}

async function fetchTrackCount(cardId: string, accessToken: string): Promise<number> {
  try {
    const raw = await fetchYotoApi<YotoApiCardDetailResponse & YotoApiCardDetail>(
      `/content/${cardId}`,
      accessToken,
    )
    return countTracks(unwrapCard(raw).content?.chapters)
  }
  catch {
    return 0
  }
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

export default defineEventHandler(async (event) => {
  const accessToken = await getYotoAccessToken(event)
  const data = await fetchYotoApi<YotoContentMineResponse>('/content/mine', accessToken)

  const activeCards = (data.cards ?? []).filter(card => !card.deleted)

  const trackCounts = await mapInBatches(
    activeCards,
    DETAIL_FETCH_CONCURRENCY,
    card => fetchTrackCount(card.cardId, accessToken),
  )

  return {
    cards: activeCards.map((card, index) => ({
      cardId: card.cardId,
      title: card.title,
      author: card.metadata?.author ?? '',
      coverUrl: card.metadata?.cover?.imageL ?? null,
      duration: card.metadata?.media?.duration ?? 0,
      trackCount: trackCounts[index] ?? 0,
      updatedAt: card.updatedAt,
    })),
  }
})
