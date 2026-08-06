<script setup lang="ts">
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import {
  getPlaylistCapacitySnapshot,
} from '#shared/myo-editor/yotoMyoLimits'

const editor = inject(MYO_EDITOR_KEY, null)
const playlist = editor?.playlist
const selectedCardId = editor?.selectedCardId

const capacity = computed(() => getPlaylistCapacitySnapshot(playlist?.value ?? []))

const show = computed(() => Boolean(selectedCardId?.value))

type Level = 'empty' | 'low' | 'medium' | 'high' | 'over'
type Tone = 'ok' | 'warn' | 'alert'

/** Discrete buckets — pie fill is stepped, not a live percentage. */
function capacityLevel(ratio: number): Level {
  if (ratio <= 0) return 'empty'
  if (ratio >= 1) return 'over'
  if (ratio < 1 / 3) return 'low'
  if (ratio < 2 / 3) return 'medium'
  return 'high'
}

const LEVEL_FILL_PCT: Record<Level, number> = {
  empty: 0,
  low: 25,
  medium: 50,
  high: 75,
  over: 100,
}

function levelTone(level: Level): Tone {
  if (level === 'over') return 'alert'
  if (level === 'high') return 'warn'
  return 'ok'
}

function fillForTone(tone: Tone): string {
  if (tone === 'alert') return 'var(--color-maru-red-light)'
  if (tone === 'warn') return 'var(--color-maru-yellow)'
  return 'var(--color-maru-green-light)'
}

const PIE_CX = 16
const PIE_CY = 16
const PIE_R = 13.5

/** Wedge from 12 o'clock, clockwise. Full pies use a circle instead. */
function wedgePath(pct: number): string {
  const angleDeg = Math.min(99.999, Math.max(0, pct)) * 3.6
  const start = -Math.PI / 2
  const end = start + (angleDeg * Math.PI) / 180
  const x1 = PIE_CX + PIE_R * Math.cos(start)
  const y1 = PIE_CY + PIE_R * Math.sin(start)
  const x2 = PIE_CX + PIE_R * Math.cos(end)
  const y2 = PIE_CY + PIE_R * Math.sin(end)
  const large = angleDeg > 180 ? 1 : 0
  return `M ${PIE_CX} ${PIE_CY} L ${x1} ${y1} A ${PIE_R} ${PIE_R} 0 ${large} 1 ${x2} ${y2} Z`
}

function pieModel(level: Level) {
  const tone = levelTone(level)
  const pct = LEVEL_FILL_PCT[level]
  return {
    pct,
    fill: fillForTone(tone),
    wedge: pct > 0 && pct < 100 ? wedgePath(pct) : null,
    full: pct >= 100,
  }
}

const trackRatio = computed(() => {
  const { trackCount, trackMax } = capacity.value
  return trackMax > 0 ? trackCount / trackMax : 0
})

const timeRatio = computed(() => {
  const { knownDurationSeconds, durationMax } = capacity.value
  return durationMax > 0 ? knownDurationSeconds / durationMax : 0
})

const trackLevel = computed(() => capacityLevel(trackRatio.value))
const timeLevel = computed(() => capacityLevel(timeRatio.value))
const trackTone = computed(() => levelTone(trackLevel.value))
const timeTone = computed(() => levelTone(timeLevel.value))
const trackPie = computed(() => pieModel(trackLevel.value))
const timePie = computed(() => pieModel(timeLevel.value))

const trackLabel = computed(() => {
  const { trackCount, trackMax } = capacity.value
  return `${trackCount}/${trackMax} tracks`
})

const timeRemainingSeconds = computed(() => {
  const { knownDurationSeconds, durationMax } = capacity.value
  return Math.max(0, durationMax - knownDurationSeconds)
})

const timeLabel = computed(() => {
  const minutes = Math.floor(timeRemainingSeconds.value / 60)
  return `${minutes}m remaining`
})

const summaryAria = computed(() => `${trackLabel.value}. ${timeLabel.value}`)
</script>

<template>
  <div
    v-if="show"
    class="mobile-capacity"
    role="group"
    :aria-label="summaryAria"
  >
    <div
      class="mobile-capacity__metric"
      :class="`mobile-capacity__metric--${trackTone}`"
    >
      <div
        class="mobile-capacity__pie"
        role="meter"
        :aria-valuenow="capacity.trackCount"
        :aria-valuemin="0"
        :aria-valuemax="capacity.trackMax"
        :aria-label="trackLabel"
      >
        <svg
          class="mobile-capacity__pie-svg"
          viewBox="0 0 32 32"
          aria-hidden="true"
        >
          <circle
            class="mobile-capacity__pie-disk"
            cx="16"
            cy="16"
            :r="PIE_R"
          />
          <circle
            v-if="trackPie.full"
            class="mobile-capacity__pie-slice"
            cx="16"
            cy="16"
            :r="PIE_R"
            :fill="trackPie.fill"
          />
          <path
            v-else-if="trackPie.wedge"
            class="mobile-capacity__pie-slice"
            :d="trackPie.wedge"
            :fill="trackPie.fill"
          />
        </svg>
      </div>
      <span class="mobile-capacity__label type-meta font-maru-medium">
        {{ trackLabel }}
      </span>
    </div>

    <div
      class="mobile-capacity__metric"
      :class="`mobile-capacity__metric--${timeTone}`"
    >
      <div
        class="mobile-capacity__pie"
        role="meter"
        :aria-valuenow="Math.round(capacity.knownDurationSeconds)"
        :aria-valuemin="0"
        :aria-valuemax="capacity.durationMax"
        :aria-label="timeLabel"
      >
        <svg
          class="mobile-capacity__pie-svg"
          viewBox="0 0 32 32"
          aria-hidden="true"
        >
          <circle
            class="mobile-capacity__pie-disk"
            cx="16"
            cy="16"
            :r="PIE_R"
          />
          <circle
            v-if="timePie.full"
            class="mobile-capacity__pie-slice"
            cx="16"
            cy="16"
            :r="PIE_R"
            :fill="timePie.fill"
          />
          <path
            v-else-if="timePie.wedge"
            class="mobile-capacity__pie-slice"
            :d="timePie.wedge"
            :fill="timePie.fill"
          />
        </svg>
      </div>
      <span class="mobile-capacity__label type-meta font-maru-medium">
        {{ timeLabel }}
      </span>
    </div>
  </div>
</template>
