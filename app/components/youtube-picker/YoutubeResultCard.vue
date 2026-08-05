<script setup lang="ts">
import { useDraggable } from '@dnd-kit/vue'
import MaruTooltip from '~/components/ui/MaruTooltip.vue'
import type { ResultsLayout, YoutubeVideoSummary } from './types'
import YoutubePickerAudioControls from './YoutubePickerAudioControls.vue'
import { resultDragId, type ResultDragData } from '../playlist/dnd'
import { MOBILE_EDITOR_CHROME_KEY } from '~/composables/useMobileEditorChrome'
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

const element = ref<HTMLElement | null>(null)
const handle = ref<HTMLElement | null>(null)

const overLimit = computed(() => {
  const seconds = props.video.durationSeconds
  return typeof seconds === 'number' && isOverMyoTrackDuration(seconds)
})

const restricted = computed(() => overLimit.value && !allowLongTracks.value)

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

function onAdd(event: Event) {
  event.stopPropagation()
  if (restricted.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonClick')
  mobileChrome?.openAddDrawer(props.video)
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
        <button
          v-if="!restricted"
          ref="handle"
          type="button"
          class="playlist-handle yt-result-card__drag-handle"
          aria-label="Drag to playlist"
        >
          <span /><span /><span />
        </button>
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
          aria-label="Add to playlist"
          @click="onAdd"
        >
          Add to Playlist
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
