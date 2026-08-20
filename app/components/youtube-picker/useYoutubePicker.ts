import type { InjectionKey, Ref } from 'vue'
import type { PickerStatus, YoutubeSearchResponse, YoutubeVideo, YoutubeVideoSummary } from './types'
import {
  importableResultKeys,
  mapPlaylistImportItems,
  videoResultKey,
  type YoutubePlaylistImportResponse,
  type YoutubePlaylistSummary,
} from '#shared/myo-editor/youtubePlaylistImport'
import {
  classifyYoutubeSearchInput,
  type YoutubeChannelSummary,
} from '#shared/myo-editor/youtubeUrl'
import { pickerVideoToPlaylistTrack } from '~/components/playlist/types'

const MIN_SEARCH_LOADING_MS = 2000

export type YoutubePickerSource = 'text' | 'playlist' | 'video' | 'channel'

export const YOUTUBE_PICKER_RESULTS_KEY: InjectionKey<Ref<YoutubeVideoSummary[]>>
  = Symbol('youtubePickerResults')
export const YOUTUBE_PICKER_RESULTS_STATE = 'youtube-picker-results'

export function useYoutubePicker(maxResults = 12) {
  const { playEvent } = useUiSound()
  const { allowLongTracks } = useUserPreferences()
  const {
    selectedCount,
    selectedKeySet,
    setSelectedKeys,
    addSelectedKeys,
    clear: clearResultSelection,
  } = useYoutubeResultSelection()

  const query = ref('')
  const submittedQuery = ref('')
  const results = useState<YoutubeVideoSummary[]>(YOUTUBE_PICKER_RESULTS_STATE, () => [])
  const pendingEnableLongTracks = ref(false)
  const focusedIndex = ref(-1)
  const status = ref<PickerStatus>('idle')
  const errorMessage = ref('')
  const nextPageToken = ref<string | undefined>()
  const loadingMore = ref(false)
  const playlistSummary = ref<YoutubePlaylistSummary | null>(null)
  const activePlaylistId = ref<string | null>(null)
  const skippedUnavailable = ref(0)
  const skippedMissingDuration = ref(0)
  const channelSummary = ref<YoutubeChannelSummary | null>(null)
  const activeChannelId = ref<string | null>(null)
  const searchSource = ref<YoutubePickerSource>('text')

  const videoCache = new Map<string, YoutubeVideo>()

  let searchGeneration = 0

  async function ensureMinLoadingTime(startedAt: number) {
    const remaining = MIN_SEARCH_LOADING_MS - (Date.now() - startedAt)
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining))
    }
  }

  function fetchErrorMessage(err: unknown, fallback: string): string {
    const fetchErr = err as {
      statusMessage?: string
      data?: string | { message?: string, statusMessage?: string }
      message?: string
    }
    const data = fetchErr.data
    const fromData = typeof data === 'string'
      ? data
      : data?.message || data?.statusMessage
    const candidate = fromData
      ?? fetchErr.statusMessage
      ?? fetchErr.message
      ?? fallback
    const generic = /^(Not Found|Bad Request|Unauthorized|Forbidden|Internal Server Error)$/i
    if (generic.test(candidate.trim())) return fallback
    return candidate
  }

  function resetPlaylistState() {
    playlistSummary.value = null
    activePlaylistId.value = null
    skippedUnavailable.value = 0
    skippedMissingDuration.value = 0
  }

  function resetChannelState() {
    channelSummary.value = null
    activeChannelId.value = null
  }

  function resetPasteState() {
    resetPlaylistState()
    resetChannelState()
    searchSource.value = 'text'
  }

  function resetSearch() {
    searchGeneration += 1
    query.value = ''
    submittedQuery.value = ''
    results.value = []
    pendingEnableLongTracks.value = false
    focusedIndex.value = -1
    status.value = 'idle'
    errorMessage.value = ''
    nextPageToken.value = undefined
    loadingMore.value = false
    resetPasteState()
    clearResultSelection()
  }

  function precheckImportable(videos: YoutubeVideoSummary[], replace: boolean) {
    const keys = importableResultKeys(videos, allowLongTracks.value)
    if (replace) setSelectedKeys(keys)
    else addSelectedKeys(keys)
  }

  async function fetchPlaylistPage(playlistId: string, pageToken?: string) {
    return await $fetch<YoutubePlaylistImportResponse>('/api/youtube/playlist', {
      query: { playlistId, pageToken },
    })
  }

  async function loadPlaylist(playlistId: string, q: string) {
    searchGeneration += 1
    const generation = searchGeneration
    const loadingStartedAt = Date.now()
    submittedQuery.value = q
    status.value = 'loading'
    errorMessage.value = ''
    pendingEnableLongTracks.value = false
    focusedIndex.value = -1
    results.value = []
    nextPageToken.value = undefined
    playlistSummary.value = null
    activePlaylistId.value = playlistId
    skippedUnavailable.value = 0
    skippedMissingDuration.value = 0
    resetChannelState()
    searchSource.value = 'playlist'
    clearResultSelection()
    playEvent('buttonClick')

    try {
      const data = await fetchPlaylistPage(playlistId)
      if (generation !== searchGeneration) return

      const mapped = mapPlaylistImportItems(data.items)
      playlistSummary.value = data.playlist ?? null
      results.value = mapped.videos
      skippedUnavailable.value = mapped.skippedUnavailable
      skippedMissingDuration.value = mapped.skippedMissingDuration
      nextPageToken.value = data.nextPageToken
      precheckImportable(mapped.videos, true)
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return
      status.value = 'idle'
    }
    catch (err: unknown) {
      if (generation !== searchGeneration) return
      errorMessage.value = fetchErrorMessage(err, 'Playlist not found or not public')
      results.value = []
      resetPasteState()
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return
      status.value = 'error'
    }
  }

  async function loadMorePlaylist() {
    const playlistId = activePlaylistId.value
    const token = nextPageToken.value
    if (!playlistId || !token || loadingMore.value) return

    loadingMore.value = true
    try {
      const data = await fetchPlaylistPage(playlistId, token)
      const mapped = mapPlaylistImportItems(data.items)
      results.value = [...results.value, ...mapped.videos]
      skippedUnavailable.value += mapped.skippedUnavailable
      skippedMissingDuration.value += mapped.skippedMissingDuration
      nextPageToken.value = data.nextPageToken
      if (data.playlist) playlistSummary.value = data.playlist
      precheckImportable(mapped.videos, false)
      playEvent('loadMoreComplete')
    }
    catch (err: unknown) {
      errorMessage.value = fetchErrorMessage(err, 'Couldn\'t load more')
    }
    finally {
      loadingMore.value = false
    }
  }

  async function loadVideo(videoId: string, q: string) {
    searchGeneration += 1
    const generation = searchGeneration
    const loadingStartedAt = Date.now()
    submittedQuery.value = q
    status.value = 'loading'
    errorMessage.value = ''
    pendingEnableLongTracks.value = false
    focusedIndex.value = -1
    results.value = []
    nextPageToken.value = undefined
    resetPasteState()
    searchSource.value = 'video'
    clearResultSelection()
    playEvent('buttonClick')

    try {
      const data = await $fetch<{ items: YoutubeVideo[] }>('/api/youtube/videos', {
        query: { ids: videoId },
      })
      if (generation !== searchGeneration) return

      const item = data.items[0]
      if (!item) {
        errorMessage.value = 'Video not found or not public'
        results.value = []
        resetPasteState()
        await ensureMinLoadingTime(loadingStartedAt)
        if (generation !== searchGeneration) return
        status.value = 'error'
        return
      }

      const summary: YoutubeVideoSummary = {
        id: item.id,
        title: item.title,
        channelTitle: item.channelTitle,
        thumbnailUrl: item.thumbnailUrl,
        publishedAt: item.publishedAt,
        duration: item.duration,
        durationSeconds: item.durationSeconds,
      }
      results.value = [summary]
      precheckImportable([summary], true)
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return
      status.value = 'idle'
    }
    catch (err: unknown) {
      if (generation !== searchGeneration) return
      errorMessage.value = fetchErrorMessage(err, 'Failed to load YouTube video')
      results.value = []
      resetPasteState()
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return
      status.value = 'error'
    }
  }

  async function fetchChannelPage(params: Record<string, string | undefined>) {
    const query: Record<string, string | number> = { maxResults }
    for (const [key, value] of Object.entries(params)) {
      if (value) query[key] = value
    }
    return await $fetch<{
      channel: YoutubeChannelSummary
      items: YoutubeVideoSummary[]
      nextPageToken?: string
    }>('/api/youtube/channel', { query })
  }

  async function loadChannel(
    ref: Extract<ReturnType<typeof classifyYoutubeSearchInput>, { kind: 'channel' }>,
    q: string,
  ) {
    searchGeneration += 1
    const generation = searchGeneration
    const loadingStartedAt = Date.now()
    submittedQuery.value = q
    status.value = 'loading'
    errorMessage.value = ''
    pendingEnableLongTracks.value = false
    focusedIndex.value = -1
    results.value = []
    nextPageToken.value = undefined
    resetPlaylistState()
    channelSummary.value = null
    activeChannelId.value = null
    searchSource.value = 'channel'
    clearResultSelection()
    playEvent('buttonClick')

    try {
      const data = await fetchChannelPage({
        channelId: ref.channelId,
        handle: ref.handle,
        username: ref.username,
        custom: ref.custom,
      })
      if (generation !== searchGeneration) return

      channelSummary.value = data.channel
      activeChannelId.value = data.channel.id
      results.value = data.items
      nextPageToken.value = data.nextPageToken
      precheckImportable(data.items, true)
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return
      status.value = 'idle'
    }
    catch (err: unknown) {
      if (generation !== searchGeneration) return
      errorMessage.value = fetchErrorMessage(err, 'Failed to load YouTube channel')
      results.value = []
      resetPasteState()
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return
      status.value = 'error'
    }
  }

  async function loadMoreChannel() {
    const channelId = activeChannelId.value
    const token = nextPageToken.value
    if (!channelId || !token || loadingMore.value) return

    loadingMore.value = true
    try {
      const data = await fetchChannelPage({ channelId, pageToken: token })
      results.value = [...results.value, ...data.items]
      nextPageToken.value = data.nextPageToken
      if (data.channel) channelSummary.value = data.channel
      precheckImportable(data.items, false)
      playEvent('loadMoreComplete')
    }
    catch (err: unknown) {
      errorMessage.value = fetchErrorMessage(err, 'Couldn\'t load more')
    }
    finally {
      loadingMore.value = false
    }
  }

  async function search(pageToken?: string) {
    const q = pageToken
      ? submittedQuery.value.trim()
      : query.value.trim()

    if (!q) {
      resetSearch()
      return
    }

    if (!pageToken) {
      const intent = classifyYoutubeSearchInput(q)
      if (intent.kind === 'playlist') {
        await loadPlaylist(intent.playlistId, q)
        return
      }
      if (intent.kind === 'video') {
        await loadVideo(intent.videoId, q)
        return
      }
      if (intent.kind === 'channel') {
        await loadChannel(intent, q)
        return
      }
      resetPasteState()
    }

    if (pageToken) {
      loadingMore.value = true
    }
    else {
      if (
        q === submittedQuery.value
        && status.value === 'idle'
        && results.value.length > 0
        && searchSource.value === 'text'
      ) {
        return
      }

      submittedQuery.value = q
      searchGeneration += 1
      const generation = searchGeneration
      const loadingStartedAt = Date.now()
      status.value = 'loading'
      errorMessage.value = ''
      pendingEnableLongTracks.value = false
      focusedIndex.value = -1
      results.value = []
      nextPageToken.value = undefined
      clearResultSelection()

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
        errorMessage.value = fetchErrorMessage(err, 'Search failed')
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
      errorMessage.value = fetchErrorMessage(err, 'Couldn\'t load more')
    }
    finally {
      loadingMore.value = false
    }
  }

  async function loadMore() {
    if (!nextPageToken.value || loadingMore.value) return
    if (activePlaylistId.value) {
      await loadMorePlaylist()
      return
    }
    if (activeChannelId.value) {
      await loadMoreChannel()
      return
    }
    await search(nextPageToken.value)
  }

  async function selectVideo(id: string) {
    const summary = results.value.find(v => v.id === id)
    if (!summary) return

    focusedIndex.value = results.value.findIndex(v => v.id === id)

    if (videoCache.has(id)) return

    try {
      const data = await $fetch<{ items: YoutubeVideo[] }>('/api/youtube/videos', {
        query: { ids: id },
      })
      const enriched = data.items[0]
      if (enriched) {
        videoCache.set(id, enriched)
      }
    }
    catch {
      // Enrichment is optional for focus/selection
    }
  }

  function requestEnableLongTracks() {
    pendingEnableLongTracks.value = true
  }

  function cancelEnableLongTracks() {
    pendingEnableLongTracks.value = false
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

  const importableKeys = computed(() =>
    importableResultKeys(results.value, allowLongTracks.value),
  )

  const allImportableSelected = computed(() => {
    const keys = importableKeys.value
    return keys.length > 0 && keys.every(key => selectedKeySet.value.has(key))
  })

  function toggleSelectAll() {
    const keys = importableKeys.value
    if (keys.length === 0) return
    if (allImportableSelected.value) {
      clearResultSelection()
      playEvent('toggleOff')
      return
    }
    setSelectedKeys(keys)
    playEvent('toggleOn')
  }

  watch(allowLongTracks, (allowed) => {
    if (!allowed || (!activePlaylistId.value && !activeChannelId.value)) return
    addSelectedKeys(importableResultKeys(results.value, true))
  })

  return {
    query,
    submittedQuery,
    results,
    pendingEnableLongTracks,
    focusedIndex,
    status,
    errorMessage,
    nextPageToken,
    loadingMore,
    playlistSummary,
    channelSummary,
    skippedUnavailable,
    skippedMissingDuration,
    selectedCount,
    allImportableSelected,
    importableCount: computed(() => importableKeys.value.length),
    playlistMode: computed(() => Boolean(activePlaylistId.value)),
    searchSource,
    toggleSelectAll,
    search,
    resetSearch,
    loadMore,
    selectVideo,
    requestEnableLongTracks,
    cancelEnableLongTracks,
    moveFocus,
  }
}

export function useSelectedResultTracks() {
  const results = useState<YoutubeVideoSummary[]>(YOUTUBE_PICKER_RESULTS_STATE, () => [])
  const { selectedKeySet } = useYoutubeResultSelection()
  return computed(() =>
    results.value
      .filter(video => selectedKeySet.value.has(videoResultKey(video)))
      .map(pickerVideoToPlaylistTrack),
  )
}
