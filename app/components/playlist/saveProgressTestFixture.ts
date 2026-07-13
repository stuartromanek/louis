import type { SaveProgress } from '~/components/myo-editor/useMyoEditor'

function isSaveProgressTestMode(query: Record<string, string | string[] | undefined>): boolean {
  if (!import.meta.dev) return false
  return query.testSaveProgress !== undefined
}

/** Fake save progress for `?testSaveProgress` overlay review in dev. */
export const SAVE_PROGRESS_TEST_FIXTURE: SaveProgress = {
  phase: 'uploading',
  progress: 81,
  operationProgress: 62,
  tracks: [
    { playlistIndex: 0, title: 'Justin Bieber - Baby ft. Ludacris', status: 'transcoding' },
    { playlistIndex: 1, title: 'Queen - Another One Bites the Dust (Official Video)', status: 'ready' },
    { playlistIndex: 2, title: 'Michael Jackson - Billie Jean', status: 'pending' },
    { playlistIndex: 3, title: 'Taylor Swift - Shake It Off', status: 'pending' },
    { playlistIndex: 4, title: 'The Beatles - Here Comes The Sun', status: 'pending' },
    { playlistIndex: 5, title: 'Bruno Mars - Uptown Funk', status: 'pending' },
  ],
}

export function useSaveProgressTestMode() {
  const route = useRoute()
  return computed(() => isSaveProgressTestMode(route.query))
}
