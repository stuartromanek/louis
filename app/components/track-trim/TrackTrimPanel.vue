<script setup lang="ts">
import TrackTrimWaveform from './TrackTrimWaveform.vue'
import { formatDurationSeconds } from '#shared/myo-editor/youtubeDuration'

const props = withDefaults(defineProps<{
  peaks: number[]
  duration: number
  trimStart: number
  trimEnd: number
  playhead: number
  peaksLoading?: boolean
  isPlaying: boolean
  isLoading: boolean
  error: string | null
  showFooter?: boolean
}>(), {
  peaksLoading: false,
  showFooter: true,
})

const emit = defineEmits<{
  play: []
  cancel: []
  trim: []
  'update:trimStart': [value: number]
  'update:trimEnd': [value: number]
  'update:playhead': [value: number]
}>()

const playLabel = computed(() => {
  if (props.error) return props.error
  if (props.isLoading) return 'Loading preview'
  return props.isPlaying ? 'Pause' : 'Play'
})

function formatTime(seconds: number) {
  return formatDurationSeconds(seconds) || '0:00'
}

const startLabel = computed(() => formatTime(props.trimStart))
const endLabel = computed(() => formatTime(props.trimEnd))
const lengthLabel = computed(() => (
  props.peaksLoading
    ? 'Loading...'
    : formatTime(Math.max(0, props.trimEnd - props.trimStart))
))

function pct(seconds: number) {
  if (!(props.duration > 0)) return 0
  return Math.min(100, Math.max(0, (seconds / props.duration) * 100))
}

const startStyle = computed(() => ({
  left: `calc(${pct(props.trimStart)}% - var(--track-trim-inner-left) + var(--track-trim-handle-w) / 2)`,
}))

const endStyle = computed(() => ({
  left: `calc(${pct(props.trimEnd)}% + var(--track-trim-handle-w) / 2)`,
}))

const lengthStyle = computed(() => ({
  left: `calc(${(pct(props.trimStart) + pct(props.trimEnd)) / 2}% - var(--track-trim-inner-left) / 2 + var(--track-trim-handle-w) / 2)`,
}))
</script>

<template>
  <div class="track-trim-panel">
    <div class="track-trim-panel__row">
      <button
        type="button"
        class="track-trim-play"
        :class="{
          'track-trim-play--playing': isPlaying,
          'track-trim-play--error': Boolean(error),
        }"
        :aria-label="playLabel"
        @click="emit('play')"
      >
        <span
          class="track-trim-play__icon track-trim-play__icon--play"
          :class="{ 'is-active': !isPlaying }"
          aria-hidden="true"
        />
        <span
          class="track-trim-play__icon track-trim-play__icon--pause"
          :class="{ 'is-active': isPlaying }"
          aria-hidden="true"
        >
          <span /><span />
        </span>
      </button>
      <div class="track-trim-panel__wave-col">
        <TrackTrimWaveform
          class="track-trim-panel__wave"
          :class="{ 'is-loading': peaksLoading }"
          :aria-busy="peaksLoading || undefined"
          :peaks="peaks"
          :duration="duration"
          :trim-start="trimStart"
          :trim-end="trimEnd"
          :playhead="playhead"
          @update:trim-start="emit('update:trimStart', $event)"
          @update:trim-end="emit('update:trimEnd', $event)"
          @update:playhead="emit('update:playhead', $event)"
        />
        <div
          class="track-trim-panel__times"
          role="group"
          aria-label="Trim times"
        >
          <div class="track-trim-panel__times-track">
            <div
              class="track-trim-panel__stat track-trim-panel__stat--start"
              :style="startStyle"
              :aria-label="`Start ${startLabel}`"
            >
              <span class="track-trim-panel__stat-value type-meta font-maru-bold">{{ startLabel }}</span>
            </div>
            <div
              class="track-trim-panel__stat track-trim-panel__stat--length"
              :style="lengthStyle"
              :aria-label="peaksLoading ? 'Loading waveform' : `New length ${lengthLabel}`"
            >
              <span class="track-trim-panel__stat-value type-meta font-maru-bold">{{ lengthLabel }}</span>
            </div>
            <div
              class="track-trim-panel__stat track-trim-panel__stat--end"
              :style="endStyle"
              :aria-label="`End ${endLabel}`"
            >
              <span class="track-trim-panel__stat-value type-meta font-maru-bold">{{ endLabel }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="showFooter"
      class="track-trim-panel__footer"
    >
      <button
        type="button"
        class="maru-button maru-button--sm track-trim-panel__cancel bg-maru-white"
        @click="emit('cancel')"
      >
        <span class="maru-button__label">Cancel</span>
      </button>
      <button
        type="button"
        class="maru-button maru-button--sm track-trim-panel__save bg-maru-orange"
        @click="emit('trim')"
      >
        <span class="maru-button__label">Trim</span>
      </button>
    </div>
  </div>
</template>
