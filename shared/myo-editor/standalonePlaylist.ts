import type { PlaylistTrack, SaveJobState } from './types.ts'

export const NEW_PLAYLIST_SAVE_KEY = 'new-playlist-draft'
export const UNCERTAIN_CREATE_START_MESSAGE
  = 'Could not confirm whether Louis started creating this playlist. Check Playlists before trying again.'
export const PLAYLIST_NOT_ON_YOTO_YET_MESSAGE = 'This playlist is not on Yoto yet.'

export type SaveOperation = NonNullable<SaveJobState['operation']>

export type ClientSaveTarget =
  | { operation: 'create' }
  | { operation: 'update'; cardId: string }

export type ClientSaveIdentity =
  | {
    operation: 'create'
    saveKey: typeof NEW_PLAYLIST_SAVE_KEY
    endpoint: '/api/yoto/content/save'
  }
  | {
    operation: 'update'
    saveKey: string
    cardId: string
    endpoint: string
  }

interface FetchErrorLike {
  statusCode?: number
  statusMessage?: string
  data?: { statusMessage?: string, message?: string }
  message?: string
}

export function isPlaylistEditorActive(
  selectedCardId: string | null,
  isNewPlaylist: boolean,
): boolean {
  return isNewPlaylist || Boolean(selectedCardId)
}

export const UNNAMED_PLAYLIST_ADD_MESSAGE = 'Name this playlist before adding tracks.'

export function canAcceptPlaylistTracks(input: {
  isEditing: boolean
  isNewPlaylist: boolean
  title: string
}): boolean {
  if (!input.isEditing) return false
  if (input.isNewPlaylist && !input.title.trim()) return false
  return true
}

export function resolveClientSaveTarget(target: ClientSaveTarget): ClientSaveIdentity {
  if (target.operation === 'create') {
    return {
      operation: 'create',
      saveKey: NEW_PLAYLIST_SAVE_KEY,
      endpoint: '/api/yoto/content/save',
    }
  }

  const cardId = target.cardId.trim()
  if (!cardId) throw new Error('Existing card ID is required for an update.')

  return {
    operation: 'update',
    saveKey: cardId,
    cardId,
    endpoint: `/api/yoto/content/${cardId}/save`,
  }
}

export function isSupportedYoutubeTrack(track: PlaylistTrack): boolean {
  if (!track || typeof track !== 'object') return false
  if (track.source !== 'app-youtube' && track.source !== 'youtube-url') return false
  const youtubeId = typeof track.youtubeId === 'string' ? track.youtubeId.trim() : ''
  const appYoutubeId = track.source === 'app-youtube' && typeof track.id === 'string'
    ? track.id.trim()
    : ''
  return Boolean(youtubeId || appYoutubeId)
}

export function getStandalonePlaylistCreateError(
  title: string,
  playlist: PlaylistTrack[],
): string | null {
  if (!title.trim()) {
    return 'Give this playlist a title before creating it.'
  }
  if (playlist.some(track => !isSupportedYoutubeTrack(track))) {
    return 'New playlists can only include supported YouTube tracks.'
  }
  return null
}

export function getStandalonePlaylistValidationError(
  title: string,
  playlist: PlaylistTrack[],
): string | null {
  const createError = getStandalonePlaylistCreateError(title, playlist)
  if (createError) return createError
  if (playlist.length === 0) {
    return 'Add at least one YouTube track before creating this playlist.'
  }
  return null
}

export function resolveSavedCardId(
  operation: SaveOperation,
  existingCardId: string | null,
  returnedCardId?: string,
): string {
  if (operation === 'update') {
    const cardId = existingCardId?.trim()
    if (!cardId) throw new Error('Existing card ID is required for an update.')
    return cardId
  }

  const cardId = returnedCardId?.trim()
  if (!cardId) {
    throw new Error(
      'Yoto did not return an ID for the created playlist. Check Playlists before trying again.',
    )
  }
  return cardId
}

export function notifyConfirmedPlaylistCreated(
  operation: SaveOperation,
  cardId: string,
  notify?: (cardId: string) => void,
): void {
  if (operation === 'create') notify?.(cardId)
}

export function classifyCreateStartFailure(error: unknown): {
  message: string
  outcomeUncertain: boolean
} {
  const fetchError = error as FetchErrorLike
  const message = fetchError.data?.message
    ?? fetchError.data?.statusMessage
    ?? fetchError.statusMessage
    ?? fetchError.message
    ?? 'Failed to create playlist'

  if (
    fetchError.statusCode === 400
    || fetchError.statusCode === 401
    || fetchError.statusCode === 403
  ) {
    return { message, outcomeUncertain: false }
  }

  return {
    message: UNCERTAIN_CREATE_START_MESSAGE,
    outcomeUncertain: true,
  }
}

export function shouldWarnBeforeUnload(isDirty: boolean, isLocked: boolean): boolean {
  return isDirty && !isLocked
}

export type InsertTracksOutcome =
  | { kind: 'none' }
  | { kind: 'added' }
  | { kind: 'duplicate' }
  | { kind: 'overflow', title: string, message: string }
  | { kind: 'mixed', title: string, message: string }

export function classifyInsertTracksOutcome(result: {
  added: number
  skipped: number
  overflow: number
}): InsertTracksOutcome {
  const added = Math.max(0, result.added)
  const skipped = Math.max(0, result.skipped)
  const overflow = Math.max(0, result.overflow)
  if (added === 0 && skipped === 0 && overflow === 0) return { kind: 'none' }

  const categories = Number(added > 0) + Number(skipped > 0) + Number(overflow > 0)
  if (categories > 1) {
    const parts: string[] = []
    if (added > 0) parts.push(`Added ${added}.`)
    if (skipped > 0) {
      parts.push(
        skipped === 1
          ? '1 was already on this playlist.'
          : `${skipped} were already on this playlist.`,
      )
    }
    if (overflow > 0) {
      parts.push(`Couldn't add ${overflow} more (100-track limit).`)
    }
    return {
      kind: 'mixed',
      title: 'Couldn\'t add all tracks',
      message: parts.join(' '),
    }
  }

  if (overflow > 0) {
    const extra = overflow === 1 ? 'track' : 'tracks'
    return {
      kind: 'overflow',
      title: 'Playlist is full',
      message: `Couldn't add ${overflow} more ${extra}. Yoto playlists allow up to 100 tracks.`,
    }
  }
  if (skipped > 0) return { kind: 'duplicate' }
  return { kind: 'added' }
}
