<script setup lang="ts">
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import MaruTooltip from '~/components/ui/MaruTooltip.vue'
import {
  formatCapacityDuration,
  getPlaylistCapacitySnapshot,
  YOTO_MYO_MAX_TRACKS,
} from '#shared/myo-editor/yotoMyoLimits'

const editor = inject(MYO_EDITOR_KEY, null)
const playlist = editor?.playlist
const selectedCardId = editor?.selectedCardId

const capacity = computed(() => getPlaylistCapacitySnapshot(playlist?.value ?? []))

const show = computed(() => Boolean(selectedCardId?.value))

const trackRatio = computed(() => {
  const { trackCount, trackMax } = capacity.value
  return trackMax > 0 ? trackCount / trackMax : 0
})

const timeRatio = computed(() => {
  const { knownDurationSeconds, durationMax } = capacity.value
  return durationMax > 0 ? knownDurationSeconds / durationMax : 0
})

/** How many capsule segments are lit (0–3) from capacity ratio. */
function filledSegments(ratio: number): 0 | 1 | 2 | 3 {
  if (ratio <= 0) return 0
  if (ratio < 1 / 3) return 1
  if (ratio < 2 / 3) return 2
  return 3
}

/**
 * Green through 2/3 filled, yellow at 3/3 while under the cap,
 * red when at or over the MYO limit.
 */
function meterTone(ratio: number, filled: number): 'ok' | 'warn' | 'alert' {
  if (ratio >= 1) return 'alert'
  if (filled >= 3) return 'warn'
  return 'ok'
}

const trackFilled = computed(() => filledSegments(trackRatio.value))
const timeFilled = computed(() => filledSegments(timeRatio.value))
const trackTone = computed(() => meterTone(trackRatio.value, trackFilled.value))
const timeTone = computed(() => meterTone(timeRatio.value, timeFilled.value))

const trackAria = computed(
  () => `${capacity.value.trackCount}/${capacity.value.trackMax} tracks`,
)

const timeAria = computed(() => {
  const { knownDurationSeconds, durationMax, durationComplete } = capacity.value
  const used = formatCapacityDuration(knownDurationSeconds)
  const max = formatCapacityDuration(durationMax)
  if (durationComplete) return `${used} / ${max} playlist length`
  return `${used} / ${max} — some tracks missing duration (lower bound)`
})

const trackTip = computed(() => {
  const { trackCount, trackMax } = capacity.value
  return `${trackCount} of ${trackMax} tracks used. MYO max ${YOTO_MYO_MAX_TRACKS}.`
})

const timeTip = computed(() => {
  const { knownDurationSeconds, durationMax, durationComplete } = capacity.value
  const used = formatCapacityDuration(knownDurationSeconds)
  const max = formatCapacityDuration(durationMax)
  if (durationComplete) return `${used} of ${max} used. MYO cards allow up to 5 hours.`
  return `${used} of ${max} used (some durations unknown). MYO cards allow up to 5 hours.`
})
</script>

<template>
  <div
    v-if="show"
    class="capacity-meters"
    aria-label="MYO card capacity"
  >
    <MaruTooltip :text="trackTip">
      <div
        class="capacity-meter"
        :class="`capacity-meter--${trackTone}`"
      >
        <span class="capacity-meter__kind font-maru-mono">tracks</span>
        <div
          class="capacity-meter__bar"
          role="meter"
          :aria-valuenow="capacity.trackCount"
          :aria-valuemin="0"
          :aria-valuemax="capacity.trackMax"
          :aria-label="trackAria"
        >
          <span
            v-for="step in 3"
            :key="`track-${step}`"
            class="capacity-meter__seg"
            :class="{ 'capacity-meter__seg--on': step <= trackFilled }"
          />
        </div>
      </div>
    </MaruTooltip>

    <MaruTooltip :text="timeTip">
      <div
        class="capacity-meter"
        :class="`capacity-meter--${timeTone}`"
      >
        <span class="capacity-meter__kind font-maru-mono">time</span>
        <div
          class="capacity-meter__bar"
          role="meter"
          :aria-valuenow="Math.round(capacity.knownDurationSeconds)"
          :aria-valuemin="0"
          :aria-valuemax="capacity.durationMax"
          :aria-label="timeAria"
        >
          <span
            v-for="step in 3"
            :key="`time-${step}`"
            class="capacity-meter__seg"
            :class="{ 'capacity-meter__seg--on': step <= timeFilled }"
          />
        </div>
      </div>
    </MaruTooltip>
  </div>
</template>
