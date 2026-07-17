<script setup lang="ts">
import { useDraggable } from '@dnd-kit/vue'
import MaruTooltip from '~/components/ui/MaruTooltip.vue'
import type { ResultsLayout, YoutubeVideoSummary } from './types'
import YoutubePickerAudioControls from './YoutubePickerAudioControls.vue'
import { resultDragId, type ResultDragData } from '../playlist/dnd'
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

const element = ref<HTMLElement | null>(null)
const handle = ref<HTMLElement | null>(null)

const overLimit = computed(() => {
  const seconds = props.video.durationSeconds
  return typeof seconds === 'number' && isOverMyoTrackDuration(seconds)
})

/** Over-limit until the user enables long tracks for this session. */
const restricted = computed(() => overLimit.value && !allowLongTracks.value)

/** Unlocked over-hour tracks get a status chip under the thumbnail. */
const showLongTrackChip = computed(() => overLimit.value && allowLongTracks.value)

const durationLabel = computed(() => {
  if (typeof props.video.durationSeconds === 'number') {
    return formatDurationSeconds(props.video.durationSeconds)
  }
  return formatYoutubeDurationIso(props.video.duration)
})

const { isDragging } = useDraggable({
  id: () => resultDragId(props.video.id),
  element,
  handle,
  type: 'result',
  disabled: () => restricted.value,
  data: (): ResultDragData => ({
    type: 'result',
    video: props.video,
  }),
})

const shellClass = computed(() => [
  props.focused
    ? 'bg-maru-blue-lighter ring-2 ring-maru-blue'
    : 'bg-maru-white',
  isDragging.value ? 'opacity-50' : '',
  restricted.value ? 'yt-result-card--over-limit' : '',
])

function onEnableLongTracks(event: Event) {
  event.stopPropagation()
  emit('enableLongTracks')
}
</script>

<template>
  <!-- List layout -->
  <div
    v-if="layout === 'list'"
    ref="element"
    class="yt-result-card w-full border-maru rounded-maru overflow-hidden transition-[opacity,box-shadow,background-color]"
    :class="shellClass"
    :title="restricted ? YOTO_MYO_OVER_TRACK_DURATION_MESSAGE : undefined"
    :aria-disabled="restricted || undefined"
  >
    <div class="yt-result-card__main flex items-start gap-3 p-2 pr-3">
      <div class="yt-result-card__thumb relative shrink-0 flex flex-col items-stretch gap-1.5">
        <button
          type="button"
          class="relative block overflow-hidden rounded-[calc(var(--radius-maru)-2px)]"
          @click="emit('select', video.id)"
        >
          <img
            :src="video.thumbnailUrl"
            :alt="video.title"
            class="yt-result-card__thumb-img w-28 sm:w-36 aspect-video object-cover"
            loading="lazy"
          >
          <span
            v-if="durationLabel"
            class="yt-result-duration font-maru-mono tabular-nums"
          >{{ durationLabel }}</span>
        </button>
        <button
          v-if="!restricted"
          ref="handle"
          type="button"
          class="playlist-handle absolute top-1.5 left-1.5 z-10 bg-maru-yellow"
          aria-label="Drag to playlist"
        >
          <span /><span /><span />
        </button>
        <span
          v-if="showLongTrackChip"
          class="yt-result-long-chip font-maru-mono"
        >{{ YOTO_MYO_LONG_TRACK_CHIP }}</span>
      </div>

      <div class="yt-result-card__body flex min-w-0 flex-1 flex-col gap-2 py-0.5">
        <button
          type="button"
          class="min-w-0 w-full text-left"
          @click="emit('select', video.id)"
        >
          <p class="yt-result-card__title font-maru-medium text-3xl sm:text-[2rem] leading-[0.8] line-clamp-2 text-pretty">{{ video.title }}</p>
          <p class="yt-result-card__meta font-maru-mono font-maru-regular text-[1.75rem] text-maru-black/75 mt-0">{{ video.channelTitle }}</p>
        </button>

        <div
          v-if="!restricted"
          class="w-full min-w-0"
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
        <span>{{ YOTO_MYO_OVER_TRACK_DURATION_FOOTER }}</span>
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
      </p>
      <button
        type="button"
        class="yt-result-card__enable font-maru-mono text-maru-black"
        @click="onEnableLongTracks"
      >
        Enable long tracks
      </button>
    </div>
  </div>

  <!-- Tile layout -->
  <div
    v-else
    ref="element"
    class="yt-result-card w-full text-left border-maru rounded-maru overflow-hidden transition-[opacity,box-shadow,background-color]"
    :class="shellClass"
    :title="restricted ? YOTO_MYO_OVER_TRACK_DURATION_MESSAGE : undefined"
    :aria-disabled="restricted || undefined"
  >
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
        <button
          v-if="!restricted"
          ref="handle"
          type="button"
          class="playlist-handle absolute top-2 left-2 z-10 bg-maru-yellow"
          aria-label="Drag to playlist"
        >
          <span /><span /><span />
        </button>
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
          <p class="yt-result-card__title font-maru-medium text-3xl sm:text-[2rem] leading-[0.8] line-clamp-2 text-pretty">{{ video.title }}</p>
          <p class="yt-result-card__meta font-maru-mono font-maru-regular text-[1.75rem] text-maru-black/75 mt-0">{{ video.channelTitle }}</p>
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
        <span>{{ YOTO_MYO_OVER_TRACK_DURATION_FOOTER }}</span>
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
      </p>
      <button
        type="button"
        class="yt-result-card__enable font-maru-mono text-maru-black"
        @click="onEnableLongTracks"
      >
        Enable long tracks
      </button>
    </div>
  </div>
</template>
