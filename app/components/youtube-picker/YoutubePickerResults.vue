<script setup lang="ts">
import type { ResultsLayout, YoutubeVideoSummary } from './types'
import YoutubeResultCard from './YoutubeResultCard.vue'
import { listableYoutubeSearchResults, videoResultKey } from '#shared/myo-editor/youtubePlaylistImport'

const props = withDefaults(defineProps<{
  results: YoutubeVideoSummary[]
  focusedIndex: number
  layout?: ResultsLayout
  fill?: boolean
  bare?: boolean
}>(), {
  layout: 'list',
  fill: false,
  bare: false,
})

const emit = defineEmits<{
  select: [id: string]
}>()

const listedResults = computed(() => listableYoutubeSearchResults(props.results))
</script>

<template>
  <div
    :class="[
      bare ? '' : 'border-maru rounded-maru bg-maru-red-lighter p-3 sm:p-4',
      fill ? 'flex flex-col flex-1 min-h-0 overflow-y-auto' : '',
    ]"
  >
    <ul
      :class="layout === 'list'
        ? ['flex flex-col gap-2 list-none m-0 p-0', bare ? 'mt-2 sm:mt-3' : '']
        : ['grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 list-none m-0 p-0', bare ? 'mt-2 sm:mt-3' : '']"
      role="listbox"
      aria-label="Search results"
    >
      <li
        v-for="(video, index) in listedResults"
        :key="videoResultKey(video)"
        role="option"
        :aria-selected="index === focusedIndex"
      >
        <YoutubeResultCard
          :video="video"
          :layout="layout"
          :focused="index === focusedIndex"
          @select="emit('select', $event)"
        />
      </li>
    </ul>
    <slot />
  </div>
</template>
