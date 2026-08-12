<script setup lang="ts">
import { useSortable } from '@dnd-kit/vue/sortable'
import type { PlaylistTrack } from '~/components/playlist/types'
import { playlistDragId, type PlaylistDragData } from './dnd'
import TrackArtThumb from '~/components/track-art/TrackArtThumb.vue'
import { TRACK_ART_EDITOR_KEY } from '~/composables/useTrackArtEditor'

const props = defineProps<{
  track: PlaylistTrack
  index: number
  locked?: boolean
}>()

const emit = defineEmits<{
  remove: [id: string]
}>()

const artEditor = inject(TRACK_ART_EDITOR_KEY)
const { playEvent } = useUiSound()

function onRemoveHover() {
  if (props.locked) return
  playEvent('chipHover')
}

function onEditArt() {
  artEditor?.openForTrack(props.track.id)
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

    <TrackArtThumb
      :track="track"
      :locked="locked"
      size="md"
      @edit="onEditArt"
    />

    <div class="min-w-0 flex-1 flex flex-col gap-1.5">
      <p class="type-title-sm font-maru-medium line-clamp-2">{{ track.title }}</p>
      <p class="playlist-item__subtitle text-maru-black/75">{{ track.subtitle }}</p>
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
