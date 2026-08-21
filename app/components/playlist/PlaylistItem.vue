<script setup lang="ts">
import { useSortable } from '@dnd-kit/vue/sortable'
import type { PlaylistTrack } from '~/components/playlist/types'
import { playlistDragId, type PlaylistDragData } from './dnd'
import PlaylistTrackRow from './PlaylistTrackRow.vue'

const props = defineProps<{
  track: PlaylistTrack
  index: number
  locked?: boolean
  enterIndex?: number
}>()

const emit = defineEmits<{
  remove: [id: string]
}>()

const element = ref<HTMLElement | null>(null)
const handle = ref<HTMLElement | null>(null)

const { isDragging, isDropTarget } = useSortable({
  id: () => playlistDragId(props.track.id),
  index: () => props.index,
  group: 'playlist',
  type: 'playlist',
  accept: ['playlist', 'result'],
  element,
  handle,
  disabled: () => props.locked ?? false,
  data: (): PlaylistDragData => ({
    type: 'playlist',
    track: props.track,
  }),
})
</script>

<template>
  <li
    ref="element"
    :data-playlist-video-id="track.id"
    class="playlist-item flex items-center gap-2 border-maru rounded-maru bg-maru-white p-2 pr-2.5 transition-[background-color,opacity,scale]"
    :style="{ '--playlist-enter-i': enterIndex ?? 0 }"
    :class="{
      'opacity-50': isDragging,
      'bg-maru-yellow-light ring-2 ring-maru-blue': isDropTarget && !isDragging,
    }"
  >
    <button
      ref="handle"
      type="button"
      class="playlist-handle shrink-0 bg-maru-gray-light"
      aria-label="Drag to reorder"
    >
      <span /><span /><span />
    </button>

    <PlaylistTrackRow
      :track="track"
      :locked="locked"
      @remove="emit('remove', $event)"
    />
  </li>
</template>
