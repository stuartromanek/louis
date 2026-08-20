<script setup lang="ts">
import { useDraggable } from '@dnd-kit/vue'
import MaruTooltip from '~/components/ui/MaruTooltip.vue'
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
  formatYoutubeDurationIso,
  isOverMyoTrackDuration,
  YOTO_MYO_LONG_TRACK_CHIP,
  YOTO_MYO_OVER_TRACK_DURATION_FOOTER,
  YOTO_MYO_OVER_TRACK_DURATION_MESSAGE,
  YOTO_MYO_OVER_TRACK_DURATION_TOOLTIP,
} from '#shared/myo-editor/youtubeDuration'

const props = withDefaults(defineProps<{
  video: YoutubeVideoSummary
  focused?: boolean
  layout?: ResultsLayout
}>(), {
  layout: 'list',
})

const emit = defineEmits<{
  select: [id: string]
  enableLongTracks: []
}>()

const { allowLongTracks } = useUserPreferences()
const { playEvent } = useUiSound()
const mobileChrome = inject(MOBILE_EDITOR_CHROME_KEY, null)
const pickerResults = inject(YOUTUBE_PICKER_RESULTS_KEY, null)
const { selectedKeySet, toggle, isSelected, isInFlight } = useYoutubeResultSelection()

const element = ref<HTMLElement | null>(null)
const handle = ref<HTMLElement | null>(null)

const resultKey = computed(() => videoResultKey(props.video))

const overLimit = computed(() => {
  const seconds = props.video.durationSeconds
  return typeof seconds === 'number' && isOverMyoTrackDuration(seconds)
})

const restricted = computed(() => overLimit.value && !allowLongTracks.value)

const showLongTrackChip = computed(() => overLimit.value && allowLongTracks.value)

const selected = computed(() => !restricted.value && isSelected(resultKey.value))

const groupVideos = computed(() => {
  const group = videosForGroupDrag(
    pickerResults?.value ?? [props.video],
    selectedKeySet.value,
    props.video,
  )
  return group.filter((video) => {
    const seconds = video.durationSeconds
    const over = typeof seconds === 'number' && isOverMyoTrackDuration(seconds)
    return !(over && !allowLongTracks.value)
  })
})

const groupCount = computed(() => groupVideos.value.length)

const durationLabel = computed(() => {
  if (typeof props.video.durationSeconds === 'number') {
    return formatDurationSeconds(props.video.durationSeconds)
  }
  return formatYoutubeDurationIso(props.video.duration)
})

const { isDragging } = useDraggable({
  id: () => resultDragId(resultKey.value),
  element,
  handle,
  type: 'result',
  disabled: () => restricted.value,
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
  restricted.value ? 'yt-result-card--over-limit' : '',
  stackDepth.value ? 'yt-result-card--stacking' : 'overflow-hidden',
])

function onEnableLongTracks(event: Event) {
  event.stopPropagation()
  emit('enableLongTracks')
}

function onToggleSelect(event: Event) {
  event.stopPropagation()
  if (restricted.value) {
    playEvent('disabled')
    return
  }
  const input = event.target as HTMLInputElement
  toggle(resultKey.value, input.checked)
  playEvent(input.checked ? 'toggleOn' : 'toggleOff')
}

function onAdd(event: Event) {
  event.stopPropagation()
  if (restricted.value) {
    playEvent('disabled')
    return
  }
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
    :title="restricted ? YOTO_MYO_OVER_TRACK_DURATION_MESSAGE : undefined"
    :aria-disabled="restricted || undefined"
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
        <div
          v-if="!restricted"
          class="yt-result-card__grab"
        >
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
          v-if="showLongTrackChip"
          class="yt-result-long-chip font-maru-mono"
        >{{ YOTO_MYO_LONG_TRACK_CHIP }}</span>
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

      <div
        v-if="!restricted"
        class="yt-result-card__actions"
      >
        <div class="yt-result-card__audio">
          <YoutubePickerAudioControls :video-id="video.id" />
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

    <div
      v-if="restricted"
      class="yt-result-card__footer"
    >
      <p class="yt-result-card__footer-label font-maru-mono text-maru-black">
        <span class="yt-result-card__footer-text">{{ YOTO_MYO_OVER_TRACK_DURATION_FOOTER }}</span>
      </p>
      <div class="yt-result-card__footer-actions">
        <button
          type="button"
          class="yt-result-card__enable font-maru-mono text-maru-black"
          @click="onEnableLongTracks"
        >
          Enable long tracks
        </button>
        <MaruTooltip
          :text="YOTO_MYO_OVER_TRACK_DURATION_TOOLTIP"
          placement="top"
        >
          <button
            type="button"
            class="yt-result-card__info"
            aria-label="About Yoto track length limits"
            @click.stop
          >
            ?
          </button>
        </MaruTooltip>
      </div>
    </div>
  </div>

  <!-- Tile layout -->
  <div
    v-else
    ref="element"
    class="yt-result-card w-full text-left border-maru rounded-maru transition-[opacity,box-shadow,background-color]"
    :class="shellClass"
    :title="restricted ? YOTO_MYO_OVER_TRACK_DURATION_MESSAGE : undefined"
    :aria-disabled="restricted || undefined"
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
        <div
          v-if="!restricted"
          class="yt-result-card__grab yt-result-card__grab--tile"
        >
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
        v-if="showLongTrackChip"
        class="yt-result-long-chip yt-result-long-chip--tile font-maru-mono"
      >{{ YOTO_MYO_LONG_TRACK_CHIP }}</span>
      <div class="yt-result-card__body px-3 pt-3 pb-3">
        <button
          type="button"
          class="w-full text-left"
          @click="emit('select', video.id)"
        >
          <p class="yt-result-card__title type-title font-maru-medium line-clamp-2">{{ video.title }}</p>
          <p class="yt-result-card__meta type-meta text-maru-black/75 mt-1.5">{{ video.channelTitle }}</p>
        </button>
        <div
          v-if="!restricted"
          class="pt-2"
        >
          <YoutubePickerAudioControls :video-id="video.id" />
        </div>
      </div>
    </div>

    <div
      v-if="restricted"
      class="yt-result-card__footer"
    >
      <p class="yt-result-card__footer-label font-maru-mono text-maru-black">
        <span class="yt-result-card__footer-text">{{ YOTO_MYO_OVER_TRACK_DURATION_FOOTER }}</span>
      </p>
      <div class="yt-result-card__footer-actions">
        <button
          type="button"
          class="yt-result-card__enable font-maru-mono text-maru-black"
          @click="onEnableLongTracks"
        >
          Enable long tracks
        </button>
        <MaruTooltip
          :text="YOTO_MYO_OVER_TRACK_DURATION_TOOLTIP"
          placement="top"
        >
          <button
            type="button"
            class="yt-result-card__info"
            aria-label="About Yoto track length limits"
            @click.stop
          >
            ?
          </button>
        </MaruTooltip>
      </div>
    </div>
  </div>
</template>
