<script setup lang="ts">
import type { YoutubeVideoSummary } from './types'
import YoutubePickerEmptyState from './YoutubePickerEmptyState.vue'
import YoutubePickerLoadMore from './YoutubePickerLoadMore.vue'
import YoutubePickerResults from './YoutubePickerResults.vue'

export type ResultsPaneMode = 'initial' | 'loading' | 'no-results' | 'results'

defineProps<{
  mode: ResultsPaneMode
  query?: string
  placeholders?: string[]
  results?: YoutubeVideoSummary[]
  focusedIndex?: number
  confirmedId?: string | null
  nextPageToken?: string | null
  loadingMore?: boolean
  fill?: boolean
}>()

const emit = defineEmits<{
  search: [query: string]
  select: [id: string]
  loadMore: []
}>()
</script>

<template>
  <div
    class="border-maru rounded-maru bg-maru-red-lighter flex flex-col"
    :class="[
      mode === 'results' ? 'px-2 sm:px-3' : 'p-2 sm:p-3',
      fill ? 'flex-1 min-h-0 overflow-hidden' : '',
      fill && mode !== 'results' ? 'justify-center' : '',
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
      :class="fill ? 'flex-1 min-h-0' : 'min-h-32 py-6'"
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
        Searching YouTube
      </p>
      <p
        v-if="query?.trim()"
        class="empty-state-meta max-w-lg"
      >
        Looking for “{{ query.trim() }}”...
      </p>
    </div>

    <YoutubePickerEmptyState
      v-else-if="mode === 'no-results'"
      bare
      :fill="fill"
      variant="no-results"
      :query="query ?? ''"
    />

    <YoutubePickerResults
      v-else
      :results="results ?? []"
      :focused-index="focusedIndex ?? -1"
      :confirmed-id="confirmedId"
      bare
      :fill="fill"
      @select="emit('select', $event)"
    >
      <YoutubePickerLoadMore
        v-if="nextPageToken"
        :loading="loadingMore"
        @click="emit('loadMore')"
      />
    </YoutubePickerResults>
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
