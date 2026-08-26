<script setup lang="ts">
import { useDraggable } from '@dnd-kit/vue'
import type { ResultsLayout, YoutubeVideoSummary } from './types'
import YoutubePickerAudioControls from './YoutubePickerAudioControls.vue'
import { resultDragId, type ResultDragData } from '../playlist/dnd'
import { MOBILE_EDITOR_CHROME_KEY } from '~/composables/useMobileEditorChrome'
import { YOUTUBE_PICKER_RESULTS_KEY } from './useYoutubePicker'
import {
  videoResultKey,
  videosForGroupDrag,
} from '#shared/myo-editor/youtubePlaylistImport'
import {
  formatDurationSeconds,
  parseYoutubeDurationIso,
} from '#shared/myo-editor/youtubeDuration'
import { formatSplitIntoChip, planTrackSplit } from '#shared/myo-editor/splitTrack'

const props = withDefaults(defineProps<{
  video: YoutubeVideoSummary
  focused?: boolean
  layout?: ResultsLayout
}>(), {
  layout: 'list',
})

const emit = defineEmits<{
  select: [id: string]
}>()

const { playEvent } = useUiSound()
const mobileChrome = inject(MOBILE_EDITOR_CHROME_KEY, null)
const pickerResults = inject(YOUTUBE_PICKER_RESULTS_KEY, null)
const { selectedKeySet, toggle, isSelected, isInFlight } = useYoutubeResultSelection()

const element = ref<HTMLElement | null>(null)
const handle = ref<HTMLElement | null>(null)

const resultKey = computed(() => videoResultKey(props.video))

const splitChip = computed(() => {
  const seconds = props.video.durationSeconds
  if (typeof seconds !== 'number') return ''
  const plan = planTrackSplit(seconds)
  return plan ? formatSplitIntoChip(plan.count) : ''
})

const selected = computed(() => isSelected(resultKey.value))

const groupVideos = computed(() => videosForGroupDrag(
  pickerResults?.value ?? [props.video],
  selectedKeySet.value,
  props.video,
))

const groupCount = computed(() => groupVideos.value.length)

const durationLabel = computed(() => {
  const seconds = typeof props.video.durationSeconds === 'number'
    ? props.video.durationSeconds
    : parseYoutubeDurationIso(props.video.duration ?? '')
  if (typeof seconds !== 'number' || seconds <= 0) return ''
  return formatDurationSeconds(seconds)
})

const { isDragging } = useDraggable({
  id: () => resultDragId(resultKey.value),
  element,
  handle,
  type: 'result',
  data: (): ResultDragData => ({
    type: 'result',
    video: props.video,
    videos: groupVideos.value,
  }),
})

const stackDepth = computed(() => {
  if (!isDragging.value || groupCount.value <= 1) return 0
  return Math.min(groupCount.value - 1, 3)
})

const groupInFlight = computed(() =>
  !isDragging.value && isInFlight(resultKey.value),
)

const shellClass = computed(() => [
  selected.value
    ? 'bg-maru-yellow-light yt-result-card--selected'
    : props.focused
      ? 'bg-maru-blue-lighter'
      : 'bg-maru-white',
  selected.value && !stackDepth.value ? 'ring-2 ring-maru-black' : '',
  props.focused && !selected.value && !stackDepth.value ? 'ring-2 ring-maru-blue' : '',
  isDragging.value ? 'opacity-50' : '',
  groupInFlight.value ? 'yt-result-card--in-flight' : '',
  stackDepth.value ? 'yt-result-card--stacking' : 'overflow-hidden',
])

function onToggleSelect(event: Event) {
  event.stopPropagation()
  const input = event.target as HTMLInputElement
  toggle(resultKey.value, input.checked)
  playEvent(input.checked ? 'toggleOn' : 'toggleOff')
}

function onAdd(event: Event) {
  event.stopPropagation()
  playEvent('buttonClick')
  const videos = selected.value ? groupVideos.value : [props.video]
  mobileChrome?.openAddDrawer(videos)
}

const addLabel = computed(() => {
  if (selected.value && groupCount.value > 1) {
    return `Add ${groupCount.value} tracks to playlist`
  }
  return 'Add to playlist'
})
</script>

<template>
  <!-- List layout -->
  <div
    v-if="layout === 'list'"
    ref="element"
    class="yt-result-card w-full border-maru rounded-maru transition-[opacity,box-shadow,background-color]"
    :class="shellClass"
  >
    <div
      v-if="stackDepth"
      class="yt-result-card__stack"
      aria-hidden="true"
    >
      <span
        v-for="n in stackDepth"
        :key="n"
        class="yt-result-card__slat"
        :style="{ '--slat-i': n }"
      />
    </div>
    <div class="yt-result-card__main yt-result-card__main--list">
      <div class="yt-result-card__thumb">
        <button
          type="button"
          class="yt-result-card__thumb-btn"
          @click="emit('select', video.id)"
        >
          <img
            :src="video.thumbnailUrl"
            :alt="video.title"
            class="yt-result-card__thumb-img"
            loading="lazy"
          >
          <span
            v-if="durationLabel"
            class="yt-result-duration font-maru-mono tabular-nums"
          >{{ durationLabel }}</span>
        </button>
        <div class="yt-result-card__grab">
          <button
            ref="handle"
            type="button"
            class="playlist-handle playlist-handle--sm yt-result-card__drag-handle"
            aria-label="Drag to playlist"
          >
            <span /><span /><span />
          </button>
          <label
            class="maru-checkbox yt-result-card__check"
            @click.stop
            @pointerdown.stop
          >
            <input
              type="checkbox"
              class="maru-checkbox__input"
              :checked="selected"
              :aria-label="selected ? 'Remove from group import' : 'Select for group import'"
              @change="onToggleSelect"
            >
            <span
              class="maru-checkbox__box"
              aria-hidden="true"
            >
              <span class="maru-checkbox__mark" />
            </span>
          </label>
        </div>
        <span
          v-if="splitChip"
          class="yt-result-split-chip type-caption font-maru-mono"
        >{{ splitChip }}</span>
      </div>

      <div class="yt-result-card__copy">
        <button
          type="button"
          class="yt-result-card__copy-btn"
          @click="emit('select', video.id)"
        >
          <p class="yt-result-card__title type-title font-maru-medium line-clamp-2">{{ video.title }}</p>
          <p class="yt-result-card__meta type-meta text-maru-black/75">{{ video.channelTitle }}</p>
        </button>
      </div>

      <div class="yt-result-card__actions">
        <div class="yt-result-card__audio">
          <YoutubePickerAudioControls
            :video-id="video.id"
            :duration-seconds="video.durationSeconds"
          />
        </div>
        <button
          type="button"
          class="yt-result-card__add"
          :aria-label="addLabel"
          @click="onAdd"
        >
          {{ addLabel }}
        </button>
      </div>
    </div>
  </div>

  <!-- Tile layout -->
  <div
    v-else
    ref="element"
    class="yt-result-card w-full text-left border-maru rounded-maru transition-[opacity,box-shadow,background-color]"
    :class="shellClass"
  >
    <div
      v-if="stackDepth"
      class="yt-result-card__stack"
      aria-hidden="true"
    >
      <span
        v-for="n in stackDepth"
        :key="n"
        class="yt-result-card__slat"
        :style="{ '--slat-i': n }"
      />
    </div>
    <div class="yt-result-card__main">
      <div class="relative">
        <button
          type="button"
          class="relative w-full overflow-hidden text-left"
          @click="emit('select', video.id)"
        >
          <img
            :src="video.thumbnailUrl"
            :alt="video.title"
            class="w-full aspect-video object-cover"
            loading="lazy"
          >
          <span
            v-if="durationLabel"
            class="yt-result-duration font-maru-mono tabular-nums"
          >{{ durationLabel }}</span>
        </button>
        <div class="yt-result-card__grab yt-result-card__grab--tile">
          <button
            ref="handle"
            type="button"
            class="playlist-handle playlist-handle--sm yt-result-card__drag-handle"
            aria-label="Drag to playlist"
          >
            <span /><span /><span />
          </button>
          <label
            class="maru-checkbox yt-result-card__check"
            @click.stop
            @pointerdown.stop
          >
            <input
              type="checkbox"
              class="maru-checkbox__input"
              :checked="selected"
              :aria-label="selected ? 'Remove from group import' : 'Select for group import'"
              @change="onToggleSelect"
            >
            <span
              class="maru-checkbox__box"
              aria-hidden="true"
            >
              <span class="maru-checkbox__mark" />
            </span>
          </label>
        </div>
      </div>
      <span
        v-if="splitChip"
        class="yt-result-split-chip yt-result-split-chip--tile type-caption font-maru-mono"
      >{{ splitChip }}</span>
      <div class="yt-result-card__body px-3 pt-3 pb-3">
        <button
          type="button"
          class="w-full text-left"
          @click="emit('select', video.id)"
        >
          <p class="yt-result-card__title type-title font-maru-medium line-clamp-2">{{ video.title }}</p>
          <p class="yt-result-card__meta type-meta text-maru-black/75 mt-1.5">{{ video.channelTitle }}</p>
        </button>
        <div class="pt-2">
          <YoutubePickerAudioControls
            :video-id="video.id"
            :duration-seconds="video.durationSeconds"
          />
        </div>
      </div>
    </div>
  </div>
</template>
