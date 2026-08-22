<script setup lang="ts">
import type { PlaylistTrack } from '~/components/playlist/types'
import TrackArtThumb from '~/components/track-art/TrackArtThumb.vue'
import { TRACK_ART_EDITOR_KEY } from '~/composables/useTrackArtEditor'
import { TRACK_TRIM_EDITOR_KEY } from '~/composables/useTrackTrimEditor'
import { formatDurationSeconds } from '#shared/myo-editor/youtubeDuration'
import { splitTrackAccessibleName } from '#shared/myo-editor/splitTrack'
import { canTrimTrack, isTrimmed, trimmedDurationSeconds } from '#shared/myo-editor/trackTrim'

const props = defineProps<{
  track: PlaylistTrack
  locked?: boolean
  displayTitle?: string
  partLabel?: string
  removeLabel?: string
  hideRemove?: boolean
  hideTrim?: boolean
}>()

const emit = defineEmits<{
  remove: [id: string]
}>()

const artEditor = inject(TRACK_ART_EDITOR_KEY)
const trimEditor = inject(TRACK_TRIM_EDITOR_KEY)
const { playEvent } = useUiSound()

function onRemoveHover() {
  if (props.locked) return
  playEvent('chipHover')
}

function onEditArt() {
  artEditor?.openForTrack(props.track.id)
}

function onTrim() {
  if (props.locked || !canTrim.value) return
  playEvent('buttonClick')
  trimEditor?.openForTrack(props.track.id)
}

const canTrim = computed(() => canTrimTrack(props.track))

const durationLabel = computed(() => {
  const seconds = trimmedDurationSeconds(props.track)
  if (typeof seconds !== 'number' || seconds <= 0) return ''
  return formatDurationSeconds(seconds)
})

const partLine = computed(() => {
  const title = props.displayTitle || props.track.title
  if (!durationLabel.value) return title
  return `${title} \u00B7 ${durationLabel.value}`
})
</script>

<template>
  <div class="playlist-track-row flex items-center gap-2 min-w-0 flex-1">
    <TrackArtThumb
      :track="track"
      :locked="locked"
      size="md"
      @edit="onEditArt"
    />

    <div
      v-if="partLabel"
      class="min-w-0 flex-1 flex items-center gap-2"
    >
      <p class="type-title-sm font-maru-medium truncate min-w-0 flex-1">{{ partLine }}</p>
      <span class="playlist-split-part playlist-split-part--inline type-caption font-maru-mono tabular-nums shrink-0">{{ partLabel }}</span>
    </div>
    <div
      v-else
      class="min-w-0 flex-1 flex flex-col gap-1.5"
    >
      <p class="type-title-sm font-maru-medium line-clamp-2 min-w-0">{{ track.title }}</p>
      <p
        v-if="track.subtitle"
        class="playlist-item__subtitle text-maru-black/75"
      >{{ track.subtitle }}</p>
    </div>

    <button
      v-if="canTrim && !hideTrim"
      type="button"
      class="playlist-trim"
      :class="{ 'playlist-trim--on': isTrimmed(track) }"
      :disabled="locked"
      :aria-label="`Trim ${splitTrackAccessibleName(track)}`"
      aria-haspopup="dialog"
      @mouseenter="onRemoveHover"
      @click="onTrim"
    >
      <MaruEmoji name="Scissors" size="md" />
    </button>

    <button
      v-if="!hideRemove"
      type="button"
      class="playlist-remove"
      :disabled="locked"
      :aria-label="removeLabel || `Remove ${splitTrackAccessibleName(track)}`"
      @mouseenter="onRemoveHover"
      @click="emit('remove', track.id)"
    >
      <MaruEmoji name="Fire" size="md" />
    </button>
  </div>
</template>
