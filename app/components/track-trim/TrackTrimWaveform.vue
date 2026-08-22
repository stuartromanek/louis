<script setup lang="ts">
import { TRIM_MIN_SECONDS, clampTrim } from '#shared/myo-editor/trackTrim'

const BAR_COUNT = 56

const props = defineProps<{
  peaks: number[]
  duration: number
  trimStart: number
  trimEnd: number
  playhead: number
}>()

const emit = defineEmits<{
  'update:trimStart': [value: number]
  'update:trimEnd': [value: number]
  'update:playhead': [value: number]
}>()

type DragKind = 'start' | 'end' | 'window' | 'playhead'

const DRAG_SLOP_PX = 6

const trackRef = ref<HTMLElement | null>(null)
const dragging = ref<DragKind | null>(null)
let dragPointerId: number | null = null
let windowGrabOffset = 0
let dragOriginX = 0
let dragOriginY = 0
let windowDidDrag = false

const minKeep = computed(() => Math.min(TRIM_MIN_SECONDS, Math.max(0.05, props.duration)))

function downsampleMax(peaks: number[], count: number) {
  if (peaks.length <= count) return peaks
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const a = Math.floor((i * peaks.length) / count)
    const b = Math.max(a + 1, Math.floor(((i + 1) * peaks.length) / count))
    let max = 0
    for (let j = a; j < b; j++) max = Math.max(max, peaks[j] ?? 0)
    out.push(max)
  }
  return out
}

const barPeaks = computed(() => downsampleMax(props.peaks, BAR_COUNT))

function pct(seconds: number) {
  if (!(props.duration > 0)) return 0
  return Math.min(100, Math.max(0, (seconds / props.duration) * 100))
}

const windowStyle = computed(() => ({
  left: `calc(${pct(props.trimStart)}% - var(--track-trim-inner-left))`,
  width: `calc(${pct(props.trimEnd - props.trimStart)}% + var(--track-trim-inner-left) + var(--track-trim-inner-right))`,
}))

const playheadT = computed(() => {
  if (!(props.duration > 0)) return 0
  return props.playhead / props.duration
})

const playheadInTrim = computed(() => {
  return props.playhead >= props.trimStart - 0.02 && props.playhead <= props.trimEnd + 0.02
})

const playheadStyle = computed(() => ({
  '--playhead-t': String(playheadT.value),
}))

function timeAtClientX(clientX: number): number {
  const track = trackRef.value
  if (!track || !(props.duration > 0)) return 0
  const rect = track.getBoundingClientRect()
  if (rect.width <= 0) return 0
  const t = ((clientX - rect.left) / rect.width) * props.duration
  return Math.min(props.duration, Math.max(0, t))
}

function playheadTimeAtClientX(clientX: number): number {
  return Math.min(props.trimEnd, Math.max(props.trimStart, timeAtClientX(clientX)))
}

function inTrim(index: number, total: number) {
  if (!(props.duration > 0) || total <= 0) return true
  const t = ((index + 0.5) / total) * props.duration
  return t >= props.trimStart && t <= props.trimEnd
}

function applyTrim(start: number, end: number) {
  const next = clampTrim(start, end, props.duration, minKeep.value)
  emit('update:trimStart', next.startSeconds)
  emit('update:trimEnd', next.endSeconds)
}

function jumpedSlop(event: PointerEvent) {
  const dx = event.clientX - dragOriginX
  const dy = event.clientY - dragOriginY
  return dx * dx + dy * dy >= DRAG_SLOP_PX * DRAG_SLOP_PX
}

function seekPlayhead(clientX: number) {
  emit('update:playhead', playheadTimeAtClientX(clientX))
}

function onTrackPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  if (event.target !== event.currentTarget) return
  event.preventDefault()
  seekPlayhead(event.clientX)
}

function onPointerDown(kind: DragKind, event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  dragging.value = kind
  dragPointerId = event.pointerId
  dragOriginX = event.clientX
  dragOriginY = event.clientY
  windowDidDrag = false
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  if (kind === 'window') {
    windowGrabOffset = timeAtClientX(event.clientX) - props.trimStart
    return
  }
  if (kind === 'playhead') seekPlayhead(event.clientX)
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value || event.pointerId !== dragPointerId) return
  if (dragging.value === 'window' && !windowDidDrag) {
    if (!jumpedSlop(event)) return
    windowDidDrag = true
  }
  const t = timeAtClientX(event.clientX)
  if (dragging.value === 'start') {
    applyTrim(t, props.trimEnd)
    return
  }
  if (dragging.value === 'end') {
    applyTrim(props.trimStart, t)
    return
  }
  if (dragging.value === 'playhead') {
    seekPlayhead(event.clientX)
    return
  }
  const length = props.trimEnd - props.trimStart
  const start = t - windowGrabOffset
  const maxStart = Math.max(0, props.duration - length)
  const nextStart = Math.min(maxStart, Math.max(0, start))
  applyTrim(nextStart, nextStart + length)
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return
  const clickedWindow = dragging.value === 'window' && !windowDidDrag
  dragging.value = null
  dragPointerId = null
  windowDidDrag = false
  if (clickedWindow) seekPlayhead(event.clientX)
}

function onPointerCancel(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return
  dragging.value = null
  dragPointerId = null
  windowDidDrag = false
}
</script>

<template>
  <div
    class="track-trim-wave"
    :class="{ 'track-trim-wave--dragging': Boolean(dragging) }"
  >
    <div
      ref="trackRef"
      class="track-trim-wave__track"
      @pointerdown="onTrackPointerDown"
    >
      <div
        class="track-trim-wave__window"
        :style="windowStyle"
        @pointerdown="onPointerDown('window', $event)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
      />

      <div
        class="track-trim-wave__bars"
        aria-hidden="true"
      >
        <span
          v-for="(peak, index) in barPeaks"
          :key="index"
          class="track-trim-wave__bar"
          :class="{ 'track-trim-wave__bar--dim': !inTrim(index, barPeaks.length) }"
          :style="{
            height: `${Math.round(Math.max(0.08, peak) * 100)}%`,
            '--bar-i': String(index),
            '--bar-phase': String(index % 5),
            '--bar-amp': String(0.7 + (index % 4) * 0.1),
          }"
        />
      </div>

      <button
        v-show="playheadInTrim"
        type="button"
        class="track-trim-wave__playhead"
        :style="playheadStyle"
        aria-label="Playhead"
        @pointerdown="onPointerDown('playhead', $event)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
      />

      <div
        class="track-trim-wave__controls"
        :style="windowStyle"
      >
        <button
          type="button"
          class="track-trim-wave__handle track-trim-wave__handle--start"
          aria-label="Trim start"
          @pointerdown="onPointerDown('start', $event)"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerCancel"
        >
          <span
            class="track-trim-wave__handle-grip"
            aria-hidden="true"
          >
            <span /><span /><span />
          </span>
        </button>
        <button
          type="button"
          class="track-trim-wave__handle track-trim-wave__handle--end"
          aria-label="Trim end"
          @pointerdown="onPointerDown('end', $event)"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerCancel"
        >
          <span
            class="track-trim-wave__handle-grip"
            aria-hidden="true"
          >
            <span /><span /><span />
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
