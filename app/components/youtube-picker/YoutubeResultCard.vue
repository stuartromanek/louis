<script setup lang="ts">
import { useDraggable } from '@dnd-kit/vue'
import type { ResultsLayout, YoutubeVideoSummary } from './types'
import YoutubePickerAudioControls from './YoutubePickerAudioControls.vue'
import { resultDragId, type ResultDragData } from '../playlist/dnd'

const props = withDefaults(defineProps<{
  video: YoutubeVideoSummary
  focused?: boolean
  confirmed?: boolean
  layout?: ResultsLayout
}>(), {
  layout: 'list',
})

const emit = defineEmits<{
  select: [id: string]
}>()

const element = ref<HTMLElement | null>(null)
const handle = ref<HTMLElement | null>(null)

const { isDragging } = useDraggable({
  id: () => resultDragId(props.video.id),
  element,
  handle,
  type: 'result',
  data: (): ResultDragData => ({
    type: 'result',
    video: props.video,
  }),
})

const shellClass = computed(() => [
  props.focused ? 'bg-maru-blue-lighter ring-2 ring-maru-blue' : '',
  props.confirmed ? 'ring-2 ring-maru-green-light' : '',
  isDragging.value ? 'opacity-50' : '',
])
</script>

<template>
  <!-- List layout -->
  <div
    v-if="layout === 'list'"
    ref="element"
    class="w-full flex items-start gap-3 border-maru rounded-maru overflow-hidden p-2 pr-3 bg-maru-white transition-[opacity,box-shadow]"
    :class="shellClass"
  >
    <div class="relative shrink-0">
      <button
        type="button"
        class="block"
        @click="emit('select', video.id)"
      >
        <img
          :src="video.thumbnailUrl"
          :alt="video.title"
          class="w-28 sm:w-36 aspect-video object-cover rounded-[calc(var(--radius-maru)-2px)]"
          loading="lazy"
        >
      </button>
      <button
        ref="handle"
        type="button"
        class="playlist-handle playlist-handle--sm absolute top-1.5 left-1.5 z-10 bg-maru-yellow"
        aria-label="Drag to playlist"
      >
        <span /><span /><span />
      </button>
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-2 py-0.5">
      <button
        type="button"
        class="min-w-0 w-full text-left"
        @click="emit('select', video.id)"
      >
        <p class="font-maru-medium text-3xl sm:text-[2rem] leading-[0.8] line-clamp-2 text-pretty">{{ video.title }}</p>
        <p class="font-maru-mono font-maru-regular text-[1.75rem] text-maru-black/75 mt-0">{{ video.channelTitle }}</p>
      </button>

      <div class="w-full min-w-0">
        <YoutubePickerAudioControls :video-id="video.id" />
      </div>
    </div>
  </div>

  <!-- Tile layout -->
  <div
    v-else
    ref="element"
    class="w-full text-left border-maru rounded-maru overflow-hidden bg-maru-white transition-[opacity,box-shadow]"
    :class="shellClass"
  >
    <div class="relative">
      <button
        type="button"
        class="w-full text-left"
        @click="emit('select', video.id)"
      >
        <img
          :src="video.thumbnailUrl"
          :alt="video.title"
          class="w-full aspect-video object-cover"
          loading="lazy"
        >
      </button>
      <button
        ref="handle"
        type="button"
        class="playlist-handle absolute top-2 left-2 z-10 bg-maru-yellow"
        aria-label="Drag to playlist"
      >
        <span /><span /><span />
      </button>
    </div>
    <button
      type="button"
      class="w-full text-left px-3 pt-3 pb-1"
      @click="emit('select', video.id)"
    >
      <p class="font-maru-medium text-3xl sm:text-[2rem] leading-[0.8] line-clamp-2 text-pretty">{{ video.title }}</p>
      <p class="font-maru-mono font-maru-regular text-[1.75rem] text-maru-black/75 mt-0">{{ video.channelTitle }}</p>
    </button>
    <div class="px-3 pb-3 pt-2">
      <YoutubePickerAudioControls :video-id="video.id" />
    </div>
  </div>
</template>
