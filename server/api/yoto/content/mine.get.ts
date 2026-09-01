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
  content?: {
    chapters?: Array<{ tracks?: unknown[] }>
  }
}

interface YotoContentMineResponse {
  cards?: YotoApiCard[]
}

function countTracks(chapters: Array<{ tracks?: unknown[] }> | undefined): number {
  return (chapters ?? []).reduce((sum, chapter) => sum + (chapter.tracks?.length ?? 0), 0)
}

export default defineEventHandler(async (event) => {
  const accessToken = await getYotoAccessToken(event)
  const data = await fetchYotoApi<YotoContentMineResponse>('/content/mine', accessToken)

  const activeCards = (data.cards ?? []).filter(card => !card.deleted)

  return {
    cards: activeCards.map(card => ({
      cardId: card.cardId,
      title: card.title,
      author: card.metadata?.author ?? '',
      coverUrl: card.metadata?.cover?.imageL ?? null,
      duration: card.metadata?.media?.duration ?? 0,
      trackCount: countTracks(card.content?.chapters),
      updatedAt: card.updatedAt,
    })),
  }
})
