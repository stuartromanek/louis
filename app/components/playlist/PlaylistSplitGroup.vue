<script setup lang="ts">
import { useSortable } from '@dnd-kit/vue/sortable'
import type { PlaylistTrack } from '~/components/playlist/types'
import { splitGroupSourceTitle, splitPartNumberLabel } from '#shared/myo-editor/splitTrack'
import { canTrimTrack, isTrimmed } from '#shared/myo-editor/trackTrim'
import { playlistDragId, type PlaylistDragData } from './dnd'
import PlaylistTrackRow from './PlaylistTrackRow.vue'
import { TRACK_TRIM_EDITOR_KEY } from '~/composables/useTrackTrimEditor'

const props = defineProps<{
  tracks: PlaylistTrack[]
  index: number
  locked?: boolean
  enterIndex?: number
}>()

const emit = defineEmits<{
  remove: [id: string]
}>()

const firstTrack = computed(() => props.tracks[0]!)
const groupId = computed(() => firstTrack.value.split?.groupId || firstTrack.value.id)
const partCount = computed(() => props.tracks.length)
const sourceTitle = computed(() => splitGroupSourceTitle(firstTrack.value.title))
const canTrim = computed(() => canTrimTrack(firstTrack.value))

const element = ref<HTMLElement | null>(null)
const handle = ref<HTMLElement | null>(null)
const { playEvent } = useUiSound()
const trimEditor = inject(TRACK_TRIM_EDITOR_KEY)

const { isDragging, isDropTarget } = useSortable({
  id: () => playlistDragId(`split:${groupId.value}`),
  index: () => props.index,
  group: 'playlist',
  type: 'playlist',
  accept: ['playlist', 'result'],
  element,
  handle,
  disabled: () => props.locked ?? false,
  data: (): PlaylistDragData => ({
    type: 'playlist',
    track: firstTrack.value,
  }),
})

function partLabel(track: PlaylistTrack) {
  const count = track.split?.count ?? partCount.value
  const index = (track.split?.index ?? 0) + 1
  return `${index}/${count}`
}

function onRemoveHover() {
  if (props.locked) return
  playEvent('chipHover')
}

function onRemove() {
  emit('remove', firstTrack.value.id)
}

function onTrim() {
  if (props.locked || !canTrim.value) return
  playEvent('buttonClick')
  trimEditor?.openForTrack(firstTrack.value.id)
}
</script>

<template>
  <li
    ref="element"
    :data-playlist-video-id="firstTrack.id"
    class="playlist-split-group border-maru rounded-maru overflow-hidden bg-maru-white flex flex-col transition-[background-color,opacity,scale]"
    :style="{ '--playlist-enter-i': enterIndex ?? 0 }"
    :class="{
      'opacity-50': isDragging,
      'bg-maru-yellow-light ring-2 ring-maru-blue': isDropTarget && !isDragging,
    }"
  >
    <header class="playlist-split-group__header border-maru-bottom bg-maru-yellow flex items-center gap-2 min-w-0 p-2 pr-2.5">
      <button
        ref="handle"
        type="button"
        class="playlist-handle shrink-0 bg-maru-white"
        aria-label="Drag to reorder split tracks"
      >
        <span /><span /><span />
      </button>
      <h3 class="type-title-sm font-maru-medium line-clamp-2 min-w-0 flex-1">{{ sourceTitle }}</h3>
      <button
        v-if="canTrim"
        type="button"
        class="playlist-trim"
        :class="{ 'playlist-trim--on': isTrimmed(firstTrack) }"
        :disabled="locked"
        :aria-label="`Trim ${sourceTitle}`"
        aria-haspopup="dialog"
        @mouseenter="onRemoveHover"
        @click="onTrim"
      >
        <MaruEmoji name="Scissors" size="md" />
      </button>
      <button
        type="button"
        class="playlist-remove"
        :disabled="locked"
        :aria-label="`Remove all ${partCount} parts of ${sourceTitle}`"
        @mouseenter="onRemoveHover"
        @click="onRemove"
      >
        <MaruEmoji name="Fire" size="md" />
      </button>
    </header>

    <div class="playlist-split-group__parts p-2 pr-2.5">
      <PlaylistTrackRow
        v-for="track in tracks"
        :key="track.id"
        class="playlist-split-group__row"
        :track="track"
        :locked="locked"
        :display-title="splitPartNumberLabel(track.split?.index ?? 0)"
        :part-label="partLabel(track)"
        hide-remove
        hide-trim
      />
    </div>
  </li>
</template>
