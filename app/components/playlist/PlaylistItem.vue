<script setup lang="ts">
import { useSortable } from '@dnd-kit/vue/sortable'
import type { PlaylistTrack } from '~/components/playlist/types'
import { playlistDragId, type PlaylistDragData } from './dnd'

const props = defineProps<{
  track: PlaylistTrack
  index: number
  locked?: boolean
}>()

const emit = defineEmits<{
  remove: [id: string]
}>()

const { playEvent } = useUiSound()

function onRemoveHover() {
  if (props.locked) return
  playEvent('chipHover')
}

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

    <img
      v-if="track.thumbnailUrl"
      :src="track.thumbnailUrl"
      :alt="track.title"
      class="w-16 sm:w-20 shrink-0 aspect-video object-cover rounded-[calc(var(--radius-maru)-2px)]"
      loading="lazy"
    >

    <div class="min-w-0 flex-1 leading-tight">
      <p class="font-maru-bold text-xl sm:text-2xl line-clamp-2 text-pretty leading-[0.85]">{{ track.title }}</p>
      <p class="font-maru-mono font-maru-regular text-[1.25rem] text-maru-black/75 leading-none">{{ track.subtitle }}</p>
    </div>

    <button
      type="button"
      class="playlist-remove"
      :disabled="locked"
      :aria-label="`Remove ${track.title}`"
      @mouseenter="onRemoveHover"
      @click="emit('remove', track.id)"
    >
      <MaruEmoji name="Fire" size="md" />
    </button>
  </li>
</template>
