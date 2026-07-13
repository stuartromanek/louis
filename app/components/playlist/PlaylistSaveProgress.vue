<script setup lang="ts">
import type { SaveProgress } from '~/components/myo-editor/useMyoEditor'
import type { EmojiId } from '~/utils/emojiCatalog'
import {
  saveOperationLabel,
  saveOverallLabel,
  saveTrackCountMeta,
} from './saveProgressDisplay'

const props = withDefaults(defineProps<{
  progress: SaveProgress
  variant?: 'overlay' | 'footer'
}>(), {
  variant: 'overlay',
})

const overallLabel = computed(() => saveOverallLabel(props.progress.phase))

const operationLabel = computed(() =>
  saveOperationLabel(props.progress.phase, props.progress.tracks),
)

const trackCountMeta = computed(() => saveTrackCountMeta(props.progress.tracks))

const isExtracting = computed(() =>
  props.progress.tracks.some(track => track.status === 'extracting'),
)

const displayedOperationProgress = ref(0)
let animationFrameId = 0
let lastOperationLabel: string | null | undefined

function cancelProgressAnimation() {
  if (import.meta.client && animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = 0
  }
}

watch(
  () => [operationLabel.value, props.progress.operationProgress, isExtracting.value] as const,
  ([label, target, extracting]) => {
    cancelProgressAnimation()

    if (lastOperationLabel !== undefined && label !== lastOperationLabel) {
      displayedOperationProgress.value = 0
    }
    lastOperationLabel = label

    if (import.meta.server) {
      displayedOperationProgress.value = target
      return
    }

    const step = () => {
      const goal = extracting
        ? Math.min(45, Math.max(target, displayedOperationProgress.value + 0.25))
        : target

      const delta = goal - displayedOperationProgress.value
      if (Math.abs(delta) <= 0.4 && !extracting) {
        displayedOperationProgress.value = goal
        return
      }

      displayedOperationProgress.value += delta * 0.12
      animationFrameId = requestAnimationFrame(step)
    }

    animationFrameId = requestAnimationFrame(step)
  },
  { immediate: true },
)

onUnmounted(() => {
  cancelProgressAnimation()
})

const overallLabelClass = computed(() =>
  props.variant === 'overlay'
    ? 'font-maru-medium text-2xl sm:text-3xl text-maru-black/85'
    : 'font-maru-medium text-[1.25rem] text-maru-gray',
)

const operationLabelClass = computed(() =>
  props.variant === 'overlay'
    ? 'font-maru-mono text-[1.45rem] leading-tight text-maru-black truncate max-w-full'
    : 'font-maru-mono text-[1.25rem] leading-tight text-maru-black truncate max-w-full',
)

const metaClass = computed(() =>
  props.variant === 'overlay'
    ? 'font-maru-mono text-[1.35rem] leading-tight text-maru-black/80'
    : 'font-maru-mono text-[1.25rem] leading-tight text-maru-black/60',
)

const fillComplete = computed(() => props.progress.progress >= 100)

const SCRUBBER_EMOJIS: readonly EmojiId[] = [
  'HotDog', 'MusicalNotes', 'MusicalNote', 'VideoGame', 'OpticalDisk',
  'Headphone', 'BeamingFaceWithSmilingEyes', '1stPlaceMedal', 'DisguisedFace',
  'RollingOnTheFloorLaughing',
]

const scrubberEmoji = SCRUBBER_EMOJIS[Math.floor(Math.random() * SCRUBBER_EMOJIS.length)]!

const thumbLeft = computed(() => {
  const progress = Math.min(100, Math.max(0, props.progress.progress))
  return `${Math.min(96, Math.max(4, progress))}%`
})

const operationFillWidth = computed(() =>
  `${Math.min(100, Math.max(0, Math.round(displayedOperationProgress.value)))}%`,
)
</script>

<template>
  <div
    class="w-full flex flex-col min-w-0 items-center text-center"
    :class="variant === 'overlay' ? 'max-w-sm gap-2.5' : 'gap-2'"
  >
    <div
      v-if="variant === 'overlay'"
      class="flex flex-col items-center gap-0.5"
    >
      <p class="save-progress-percent tabular-nums">
        {{ progress.progress }}%
      </p>
      <p :class="overallLabelClass">
        {{ overallLabel }}
      </p>
    </div>
    <p
      v-else
      :class="overallLabelClass"
    >
      {{ overallLabel }}
    </p>

    <div
      v-if="variant === 'overlay'"
      class="save-progress-bar-wrapper w-full mr-1"
    >
      <div
        class="save-progress-bar w-full"
        role="progressbar"
        :aria-valuenow="progress.progress"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`${overallLabel} ${progress.progress}%`"
      >
        <div
          class="save-progress-bar__fill"
          :class="{ 'save-progress-bar__fill--complete': fillComplete }"
          :style="{ width: `${progress.progress}%` }"
        />
      </div>
      <span
        class="save-progress-bar__thumb"
        :style="{ left: thumbLeft }"
        aria-hidden="true"
      >
        <MaruEmoji :name="scrubberEmoji" size="sm" class="save-progress-bar__thumb-emoji" />
      </span>
    </div>
    <div
      v-else
      class="w-full rounded-full bg-maru-gray-light overflow-hidden h-1.5"
      role="progressbar"
      :aria-valuenow="progress.progress"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="`${overallLabel} ${progress.progress}%`"
    >
      <div
        class="h-full bg-maru-magenta transition-[width] duration-300"
        :style="{ width: `${progress.progress}%` }"
      />
    </div>

    <div
      v-if="operationLabel"
      class="w-full flex flex-col min-w-0 gap-1.5"
      :class="variant === 'overlay' ? 'mt-2.5' : ''"
    >
      <p :class="operationLabelClass">
        {{ operationLabel }}
      </p>
      <div
        class="save-operation-bar w-full"
        role="progressbar"
        :aria-valuenow="Math.round(displayedOperationProgress)"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`${operationLabel} ${Math.round(displayedOperationProgress)}%`"
      >
        <div
          class="save-operation-bar__fill"
          :style="{ width: operationFillWidth }"
        />
      </div>
    </div>

    <p
      v-if="trackCountMeta"
      :class="metaClass"
    >
      {{ trackCountMeta }}
    </p>
  </div>
</template>

<style scoped>
.save-progress-percent {
  margin: 0;
  font-weight: 700;
  font-size: 1.75rem;
  line-height: 0.78;
  color: var(--color-maru-black);
  display: inline-block;
  text-box-trim: trim-both;
  text-box-edge: cap alphabetic;
}

@media (width >= 600px) {
  .save-progress-percent {
    font-size: 3.25rem;
  }
}
</style>
