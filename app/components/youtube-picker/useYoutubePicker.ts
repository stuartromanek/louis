import type { PickerStatus, YoutubeSearchResponse, YoutubeVideo, YoutubeVideoSummary } from './types'

const MIN_SEARCH_LOADING_MS = 2000

export function useYoutubePicker(maxResults = 12) {
  const { playEvent } = useUiSound()
  const query = ref('')
  const submittedQuery = ref('')
  const results = ref<YoutubeVideoSummary[]>([])
  const preview = ref<YoutubeVideo | null>(null)
  const confirmed = ref<YoutubeVideo | null>(null)
  const focusedIndex = ref(-1)
  const status = ref<PickerStatus>('idle')
  const errorMessage = ref('')
  const nextPageToken = ref<string | undefined>()
  const loadingMore = ref(false)

  const videoCache = new Map<string, YoutubeVideo>()

  let searchGeneration = 0

  async function ensureMinLoadingTime(startedAt: number) {
    const remaining = MIN_SEARCH_LOADING_MS - (Date.now() - startedAt)
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining))
    }
  }

  function resetSearch() {
    searchGeneration += 1
    query.value = ''
    submittedQuery.value = ''
    results.value = []
    preview.value = null
    focusedIndex.value = -1
    status.value = 'idle'
    errorMessage.value = ''
    nextPageToken.value = undefined
    loadingMore.value = false
  }

  async function search(pageToken?: string) {
    const q = pageToken
      ? submittedQuery.value.trim()
      : query.value.trim()

    if (!q) {
      resetSearch()
      return
    }

    if (pageToken) {
      loadingMore.value = true
    }
    else {
      if (
        q === submittedQuery.value
        && status.value === 'idle'
        && results.value.length > 0
      ) {
        return
      }

      submittedQuery.value = q
      searchGeneration += 1
      const generation = searchGeneration
      const loadingStartedAt = Date.now()
      status.value = 'loading'
      errorMessage.value = ''
      preview.value = null
      focusedIndex.value = -1
      results.value = []
      nextPageToken.value = undefined

      try {
        const data = await $fetch<YoutubeSearchResponse>('/api/youtube/search', {
          query: { q, maxResults, pageToken },
        })

        if (generation !== searchGeneration) return

        results.value = data.items
        nextPageToken.value = data.nextPageToken
        await ensureMinLoadingTime(loadingStartedAt)
        if (generation !== searchGeneration) return
        status.value = 'idle'
      }
      catch (err: unknown) {
        if (generation !== searchGeneration) return
        const fetchErr = err as { statusMessage?: string; data?: { statusMessage?: string }; message?: string }
        errorMessage.value = fetchErr.data?.statusMessage ?? fetchErr.statusMessage ?? fetchErr.message ?? 'Search failed'
        results.value = []
        await ensureMinLoadingTime(loadingStartedAt)
        if (generation !== searchGeneration) return
        status.value = 'error'
      }
      return
    }

    try {
      const data = await $fetch<YoutubeSearchResponse>('/api/youtube/search', {
        query: { q, maxResults, pageToken },
      })

      if (pageToken) {
        results.value = [...results.value, ...data.items]
        playEvent('loadMoreComplete')
      }

      nextPageToken.value = data.nextPageToken
    }
    catch (err: unknown) {
      const fetchErr = err as { statusMessage?: string; data?: { statusMessage?: string }; message?: string }
      errorMessage.value = fetchErr.data?.statusMessage ?? fetchErr.statusMessage ?? fetchErr.message ?? 'Search failed'
      status.value = 'error'
    }
    finally {
      loadingMore.value = false
    }
  }

  async function loadMore() {
    if (!nextPageToken.value || loadingMore.value) return
    await search(nextPageToken.value)
  }

  async function selectVideo(id: string) {
    const summary = results.value.find(v => v.id === id)
    if (!summary) return

    const cached = videoCache.get(id)
    preview.value = cached ?? { ...summary }
    focusedIndex.value = results.value.findIndex(v => v.id === id)

    if (cached) return

    try {
      const data = await $fetch<{ items: YoutubeVideo[] }>('/api/youtube/videos', {
        query: { ids: id },
      })
      const enriched = data.items[0]
      if (enriched) {
        videoCache.set(id, enriched)
        preview.value = enriched
      }
    }
    catch {
      // Keep summary-level preview on enrichment failure
    }
  }

  function clearPreview() {
    preview.value = null
  }

  function confirmSelection() {
    if (!preview.value) return null
    confirmed.value = preview.value
    return preview.value
  }

  function clearSelection() {
    confirmed.value = null
    preview.value = null
    focusedIndex.value = -1
  }

  function moveFocus(delta: number) {
    if (results.value.length === 0) return
    const next = focusedIndex.value + delta
    if (next < 0) {
      focusedIndex.value = results.value.length - 1
    }
    else if (next >= results.value.length) {
      focusedIndex.value = 0
    }
    else {
      focusedIndex.value = next
    }
  }

  return {
    query,
    submittedQuery,
    results,
    preview,
    confirmed,
    focusedIndex,
    status,
    errorMessage,
    nextPageToken,
    loadingMore,
    search,
    resetSearch,
    loadMore,
    selectVideo,
    clearPreview,
    confirmSelection,
    clearSelection,
    moveFocus,
  }
}
