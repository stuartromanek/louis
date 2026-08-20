export interface YotoContentResponse {
  card?: { cardId?: string }
  cardId?: string
}

export const UNCERTAIN_CREATE_POST_MESSAGE
  = 'Could not confirm whether Yoto created this playlist. Check Playlists before trying again.'

export function isUncertainCreatePostError(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number }).statusCode
  return statusCode === undefined || statusCode === 408 || statusCode >= 500
}

export function withContentCardId<T extends object>(
  operation: 'create' | 'update',
  cardId: string | undefined,
  body: T,
): T & { cardId?: string } {
  if (operation === 'create') return body

  const existingCardId = cardId?.trim()
  if (!existingCardId) throw new Error('Existing card ID is required for an update.')
  return { ...body, cardId: existingCardId }
}

export function requireCreatedCardId(response: YotoContentResponse): string {
  const nestedCardId = response.card?.cardId?.trim()
  const topLevelCardId = response.cardId?.trim()

  if (!nestedCardId) {
    throw new Error(
      'Yoto did not return card.cardId after creating the playlist. It may already exist; check Playlists before trying again.',
    )
  }
  if (topLevelCardId && topLevelCardId !== nestedCardId) {
    throw new Error(
      'Yoto returned conflicting card IDs after creating the playlist. Check Playlists before trying again.',
    )
  }
  return nestedCardId
}
