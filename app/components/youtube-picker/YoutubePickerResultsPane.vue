<script setup lang="ts">
import type { YoutubeVideoSummary } from './types'
import type { YoutubePlaylistSummary } from '#shared/myo-editor/youtubePlaylistImport'
import type { YoutubeChannelSummary } from '#shared/myo-editor/youtubeUrl'
import type { YoutubePickerSource } from './useYoutubePicker'
import MaruHeading from '~/components/layout/MaruHeading.vue'
import YoutubePickerEmptyState from './YoutubePickerEmptyState.vue'
import YoutubePickerLoadMore from './YoutubePickerLoadMore.vue'
import YoutubePickerResults from './YoutubePickerResults.vue'

export type ResultsPaneMode = 'initial' | 'loading' | 'no-results' | 'results'

const props = defineProps<{
  mode: ResultsPaneMode
  query?: string
  placeholders?: string[]
  results?: YoutubeVideoSummary[]
  focusedIndex?: number
  nextPageToken?: string | null
  loadingMore?: boolean
  playlist?: YoutubePlaylistSummary | null
  channel?: YoutubeChannelSummary | null
  searchSource?: YoutubePickerSource
  skippedUnavailable?: number
  selectedCount?: number
  allImportableSelected?: boolean
  importableCount?: number
  playlistMode?: boolean
  fill?: boolean
}>()

const emit = defineEmits<{
  search: [query: string]
  select: [id: string]
  enableLongTracks: []
  toggleSelectAll: []
  loadMore: []
}>()

const loadingTitle = computed(() => {
  switch (props.searchSource) {
    case 'playlist': return 'Loading playlist'
    case 'video': return 'Loading video'
    case 'channel': return 'Loading channel'
    default: return 'Searching YouTube'
  }
})

const loadingMeta = computed(() => {
  const q = props.query?.trim()
  switch (props.searchSource) {
    case 'playlist': return 'Fetching tracks from that YouTube playlist...'
    case 'video': return 'Opening that YouTube video...'
    case 'channel': return 'Fetching videos from that channel...'
    default: return q ? `Looking for “${q}”...` : ''
  }
})

const sourceBanner = computed(() => {
  if (props.playlist) {
    return {
      kind: 'playlist' as const,
      title: props.playlist.title,
      countLabel: props.playlist.itemCount
        ? `${props.playlist.itemCount} source tracks`
        : '',
    }
  }
  if (props.channel) {
    return {
      kind: 'channel' as const,
      title: props.channel.title,
      countLabel: typeof props.channel.videoCount === 'number'
        ? `${props.channel.videoCount} videos`
        : '',
    }
  }
  return null
})
</script>

<template>
  <div
    class="yt-results-pane border-maru rounded-maru bg-maru-red-lighter flex flex-col"
    :class="[
      mode === 'results'
        ? 'px-2 sm:px-3'
        : mode === 'initial'
          ? 'px-2 pt-2 sm:px-3 sm:pt-3'
          : 'p-2 sm:p-3',
      fill && mode === 'results' ? 'flex-1 min-h-0 overflow-hidden' : '',
      fill && mode === 'initial' ? 'flex-1 min-h-0 overflow-hidden' : '',
      fill && mode !== 'results' && mode !== 'initial' ? 'flex-1 min-h-0 overflow-y-auto' : '',
    ]"
  >
    <YoutubePickerEmptyState
      v-if="mode === 'initial'"
      bare
      :fill="fill"
      :placeholders="placeholders ?? []"
      @search="emit('search', $event)"
    />

    <div
      v-else-if="mode === 'loading'"
      class="empty-state"
      :class="fill ? 'min-h-full w-full shrink-0' : 'min-h-32 py-6'"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <MaruEmoji
        name="FaceWithPeekingEye"
        size="empty"
        class="search-loading-emoji"
      />
      <p class="empty-state-title">
        {{ loadingTitle }}
      </p>
      <p
        v-if="loadingMeta"
        class="empty-state-meta max-w-lg"
      >
        {{ loadingMeta }}
      </p>
    </div>

    <YoutubePickerEmptyState
      v-else-if="mode === 'no-results'"
      bare
      :fill="fill"
      variant="no-results"
      :query="query ?? ''"
    />

    <div
      v-else
      class="flex flex-col"
      :class="fill ? 'min-h-0 flex-1 overflow-y-auto' : ''"
    >
      <section
        v-if="sourceBanner"
        class="yt-playlist-banner border-maru rounded-maru overflow-hidden bg-maru-white shrink-0"
        :aria-label="sourceBanner.kind === 'channel' ? 'Channel' : 'Playlist'"
      >
        <header class="yt-playlist-banner__header border-maru-bottom bg-maru-yellow">
          <MaruHeading
            :text="sourceBanner.kind === 'channel' ? 'Channel' : 'Playlist'"
            size="md"
            tone="black"
          />
          <div class="yt-playlist-banner__actions">
            <button
              type="button"
              class="yt-playlist-banner__select maru-button bg-maru-white text-maru-black"
              :disabled="!(importableCount ?? 0)"
              :aria-pressed="allImportableSelected ? 'true' : 'false'"
              :aria-label="allImportableSelected ? 'Deselect all tracks' : 'Select all importable tracks'"
              @click="emit('toggleSelectAll')"
            >
              <span class="maru-button__label">
                {{ allImportableSelected ? 'Deselect all' : 'Select all' }}
              </span>
            </button>
            <p class="type-window-meta text-maru-black m-0 shrink-0 tabular-nums">
              {{ selectedCount ?? 0 }} selected
            </p>
          </div>
        </header>
        <div class="yt-playlist-banner__body">
          <p class="type-title font-maru-medium m-0">
            {{ sourceBanner.title }}<template v-if="sourceBanner.countLabel"> · {{ sourceBanner.countLabel }}</template>
          </p>
          <p
            v-if="skippedUnavailable"
            class="type-meta m-0 text-maru-black/75"
          >
            {{ skippedUnavailable }} unavailable skipped
          </p>
        </div>
      </section>
      <YoutubePickerResults
        :results="results ?? []"
        :focused-index="focusedIndex ?? -1"
        bare
        @select="emit('select', $event)"
        @enable-long-tracks="emit('enableLongTracks')"
      >
        <YoutubePickerLoadMore
          v-if="nextPageToken"
          :loading="loadingMore"
          @click="emit('loadMore')"
        />
      </YoutubePickerResults>
    </div>
  </div>
</template>

<style scoped>
:deep(.search-loading-emoji) {
  display: inline-block;
  transform-origin: center center;
  animation: search-magnify-wiggle 1.1s ease-in-out infinite;
}

@keyframes search-magnify-wiggle {
  0%,
  100% {
    transform: rotate(-14deg) translateY(0) scale(1);
  }

  25% {
    transform: rotate(10deg) translateY(-5px) scale(1.08);
  }

  50% {
    transform: rotate(-8deg) translateY(0) scale(1.04);
  }

  75% {
    transform: rotate(12deg) translateY(-3px) scale(1.1);
  }
}
</style>
