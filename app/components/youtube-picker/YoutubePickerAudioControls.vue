<script setup lang="ts">
import {
  YOUTUBE_AUDIO_PLAYER_KEY,
  type YoutubeAudioPlayerApi,
} from './useYoutubeAudioPlayer'

const props = defineProps<{
  videoId: string
}>()

const player = inject<YoutubeAudioPlayerApi>(YOUTUBE_AUDIO_PLAYER_KEY)
if (!player) {
  throw new Error('YoutubePickerAudioControls requires YoutubeAudioPlayerApi provide')
}

const isActive = computed(() => player.activeId.value === props.videoId)
const isPlayingHere = computed(() => isActive.value && player.isPlaying.value)
const playButtonLoading = computed(() => isActive.value && player.isLoading.value)
const previewError = computed(() => (isActive.value ? player.error.value : null))
const playLabel = computed(() => {
  if (previewError.value) return previewError.value
  if (playButtonLoading.value) return 'Loading preview'
  if (isPlayingHere.value) return 'Pause'
  return 'Play'
})

const scrubbing = ref(false)
const scrubValue = ref(0)

const knownDuration = computed(() => {
  if (isActive.value && player.duration.value > 0) return player.duration.value
  return player.durationById[props.videoId] ?? 0
})

const progressPercent = computed(() => {
  if (!isActive.value) return 0
  const d = knownDuration.value
  if (!d) return 0
  const t = scrubbing.value ? scrubValue.value : player.currentTime.value
  return Math.min(100, Math.max(0, (t / d) * 100))
})

const displayTime = computed(() => {
  if (!isActive.value) return 0
  if (scrubbing.value) return scrubValue.value
  return player.currentTime.value
})

const formattedDuration = computed(() => formatTime(knownDuration.value))

function formatTime(totalSeconds: number): string {
  if (!totalSeconds || !Number.isFinite(totalSeconds)) return '0:00'
  const whole = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

watch(
  () => [player.currentTime.value, scrubbing.value, isActive.value] as const,
  ([time, dragging, active]) => {
    if (!dragging && active) scrubValue.value = time
    if (!active) {
      scrubbing.value = false
      scrubValue.value = 0
    }
  },
)

async function onToggle(event: Event) {
  event.stopPropagation()
  try {
    await player.toggle(props.videoId)
  }
  catch {
    // Player handles preview failures; keep the click handler from surfacing uncaught rejections.
  }
}

function onScrubStart(event: Event) {
  event.stopPropagation()
  if (!isActive.value) return
  scrubbing.value = true
}

function onScrubInput(event: Event) {
  event.stopPropagation()
  if (!isActive.value) return
  const value = Number((event.target as HTMLInputElement).value)
  scrubValue.value = value
}

function onScrubCommit(event: Event) {
  event.stopPropagation()
  if (!isActive.value) return
  const value = Number((event.target as HTMLInputElement).value)
  scrubbing.value = false
  player.seek(value)
}
</script>

<template>
  <div
    class="yt-audio-controls"
    @click.stop
    @pointerdown.stop
  >
    <button
      type="button"
      class="yt-audio-play"
      :class="{
        'yt-audio-play--playing': isPlayingHere,
        'yt-audio-play--idle': !isPlayingHere && !previewError,
        'yt-audio-play--error': Boolean(previewError),
      }"
      :aria-label="playLabel"
      :title="previewError ?? undefined"
      :disabled="playButtonLoading"
      @click="onToggle"
    >
      <span v-if="playButtonLoading" class="yt-audio-icon yt-audio-icon--loading" aria-hidden="true" />
      <span v-else-if="isPlayingHere" class="yt-audio-icon yt-audio-icon--pause" aria-hidden="true">
        <span /><span />
      </span>
      <span v-else class="yt-audio-icon yt-audio-icon--play" aria-hidden="true" />
    </button>

    <div class="yt-audio-scrubber">
      <input
        class="yt-audio-range"
        type="range"
        min="0"
        :max="isActive ? (knownDuration || 0) : 0"
        step="0.1"
        :value="displayTime"
        :disabled="!isActive || !(knownDuration > 0)"
        :style="{ '--yt-progress': `${progressPercent}%` }"
        @pointerdown="onScrubStart"
        @input="onScrubInput"
        @change="onScrubCommit"
      >
      <span class="yt-audio-duration font-maru-mono tabular-nums">{{ formattedDuration }}</span>
    </div>
  </div>
</template>
