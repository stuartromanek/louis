<!--
  YouTube Picker — self-contained search/browse/select component.

  Requires:
  - NUXT_YOUTUBE_API_KEY in .env
  - Server proxy routes at /api/youtube/search and /api/youtube/videos
-->
<script setup lang="ts">
import { useYoutubePicker } from './useYoutubePicker'
import YoutubePickerPreview from './YoutubePickerPreview.vue'
import YoutubePickerResultsPane from './YoutubePickerResultsPane.vue'
import YoutubePickerSearch from './YoutubePickerSearch.vue'
import {
  useYoutubeAudioPlayer,
  YOUTUBE_AUDIO_PLAYER_KEY,
} from './useYoutubeAudioPlayer'

const props = withDefaults(defineProps<{
  placeholders?: string[]
  maxResults?: number
  embedded?: boolean
}>(), {
  maxResults: 12,
  embedded: false,
})

const DEFAULT_SEARCH_PLACEHOLDERS = [
  'K Pop Demon Hunters',
  'Sesame Street',
  'Warren Zevon',
  'The Beach Boys',
]

const appConfig = useAppConfig()
const { searchPlaceholders: preferredPlaceholders, setAllowLongTracks } = useUserPreferences()
const { playEvent } = useUiSound()
const searchPlaceholders = computed(
  () => preferredPlaceholders.value
    ?? props.placeholders
    ?? appConfig.youtubePicker?.searchPlaceholders
    ?? DEFAULT_SEARCH_PLACEHOLDERS,
)

const containerRef = ref<HTMLElement | null>(null)
const audioPlayer = useYoutubeAudioPlayer()
provide(YOUTUBE_AUDIO_PLAYER_KEY, audioPlayer)

const {
  query,
  submittedQuery,
  results,
  pendingEnableLongTracks,
  focusedIndex,
  status,
  errorMessage,
  nextPageToken,
  loadingMore,
  search,
  resetSearch,
  loadMore,
  selectVideo,
  requestEnableLongTracks,
  cancelEnableLongTracks,
  moveFocus,
} = useYoutubePicker(props.maxResults)

const resultsPaneMode = computed(() => {
  if (!submittedQuery.value.trim()) return 'initial' as const
  if (status.value === 'loading' && results.value.length === 0) return 'loading' as const
  if (results.value.length === 0) return 'no-results' as const
  return 'results' as const
})

function onSearchSubmit() {
  search()
}

function onSearchClear() {
  resetSearch()
}

function onPlaceholderSearch(term: string) {
  query.value = term
  search()
}

async function onSelect(id: string) {
  await selectVideo(id)
}

function onConfirmEnableLongTracks() {
  playEvent('buttonPrimary')
  setAllowLongTracks(true)
  cancelEnableLongTracks()
}

function onCancelEnableLongTracks() {
  playEvent('buttonClick')
  cancelEnableLongTracks()
}

function onKeydown(event: KeyboardEvent) {
  if (results.value.length === 0) return
  if (event.target instanceof HTMLInputElement) return

  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowRight':
      event.preventDefault()
      moveFocus(1)
      break
    case 'ArrowUp':
    case 'ArrowLeft':
      event.preventDefault()
      moveFocus(-1)
      break
    case 'Enter':
      if (focusedIndex.value >= 0) {
        event.preventDefault()
        onSelect(results.value[focusedIndex.value]!.id)
      }
      break
    case 'Escape':
      if (pendingEnableLongTracks.value) {
        event.preventDefault()
        onCancelEnableLongTracks()
      }
      break
  }
}

onMounted(() => {
  containerRef.value?.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  containerRef.value?.removeEventListener('keydown', onKeydown)
  audioPlayer.destroy()
})
</script>

<template>
  <div
    ref="containerRef"
    tabindex="0"
    :class="embedded ? 'relative flex flex-col h-full min-h-0' : 'relative'"
  >
    <div :class="embedded ? 'shrink-0' : ''">
      <YoutubePickerSearch
        v-model="query"
        :placeholders="searchPlaceholders"
        :embedded="embedded"
        @submit="onSearchSubmit"
        @clear="onSearchClear"
      />
    </div>

    <div :class="embedded ? 'flex flex-1 min-h-0 flex-col overflow-hidden' : ''">
      <p
        v-if="status === 'error'"
        class="font-maru-mono font-maru-regular text-sm text-maru-red py-4 border-maru rounded-maru bg-maru-red-lighter px-4"
      >
        {{ errorMessage }}
      </p>

      <YoutubePickerResultsPane
        v-else
        :mode="resultsPaneMode"
        :query="submittedQuery"
        :placeholders="searchPlaceholders"
        :results="results"
        :focused-index="focusedIndex"
        :next-page-token="nextPageToken"
        :loading-more="loadingMore"
        :fill="embedded"
        @search="onPlaceholderSearch"
        @select="onSelect"
        @enable-long-tracks="requestEnableLongTracks"
        @load-more="loadMore"
      />
    </div>

    <div
      v-if="pendingEnableLongTracks"
      :class="embedded ? 'shrink-0 border-maru-top pt-3 mt-3' : 'mt-4'"
    >
      <YoutubePickerPreview
        @confirm="onConfirmEnableLongTracks"
        @cancel="onCancelEnableLongTracks"
      />
    </div>
  </div>
</template>
