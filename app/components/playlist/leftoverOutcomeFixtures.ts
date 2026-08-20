function isDevQueryFlag(
  query: Record<string, string | string[] | undefined>,
  key: string,
): boolean {
  if (!import.meta.dev) return false
  return query[key] !== undefined
}

export const PLAYLIST_BANNER_TEST_SKIPPED = {
  skippedUnavailable: 3,
  skippedMissingDuration: 2,
} as const

export const OVERFLOW_TOAST_TEST_TITLE = 'Couldn\'t add all tracks'
export const OVERFLOW_TOAST_TEST_MESSAGE
  = 'Added 6. 2 were already on this playlist. Couldn\'t add 12 more (100-track limit).'

export function useLeftoverOutcomeFixtures() {
  const route = useRoute()
  return {
    uncertainCreate: computed(() => isDevQueryFlag(route.query, 'testUncertainCreate')),
    createPrompts: computed(() => isDevQueryFlag(route.query, 'testCreatePrompts')),
    playlistBanner: computed(() => isDevQueryFlag(route.query, 'testPlaylistBanner')),
    overflowToast: computed(() => isDevQueryFlag(route.query, 'testOverflowToast')),
  }
}
