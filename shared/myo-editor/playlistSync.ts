export const YOTO_RESUME_REFRESH_INTERVAL_MS = 30_000

export function canRefreshSelectedPlaylist(input: {
  selectedCardId: string | null
  isNewPlaylist: boolean
  loading: boolean
  isDirty: boolean
  isSaving: boolean
}): boolean {
  return Boolean(
    input.selectedCardId
    && !input.isNewPlaylist
    && !input.loading
    && !input.isDirty
    && !input.isSaving,
  )
}

export function shouldRefreshYotoOnResume(input: {
  connected: boolean
  lastSuccessfulFetchAt: number
  now: number
  minIntervalMs?: number
}): boolean {
  if (!input.connected) return false
  const minIntervalMs = input.minIntervalMs ?? YOTO_RESUME_REFRESH_INTERVAL_MS
  return input.lastSuccessfulFetchAt <= 0
    || input.now - input.lastSuccessfulFetchAt >= minIntervalMs
}
