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
  variant?: 'overlay' | 'footer' | 'mobile'
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

const showRichChrome = computed(
  () => props.variant === 'overlay' || props.variant === 'mobile',
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

const overallLabelClass = computed(() => {
  if (props.variant === 'overlay') return 'type-title font-maru-medium text-maru-black/85'
  if (props.variant === 'mobile') return 'type-title font-maru-medium text-maru-black'
  return 'type-meta font-maru-medium text-maru-gray'
})

const operationLabelClass = computed(() => {
  if (props.variant === 'footer') return 'type-meta-sm text-maru-black truncate max-w-full'
  return 'type-meta text-maru-black truncate max-w-full'
})

const metaClass = computed(() => {
  if (props.variant === 'footer') return 'type-meta-sm text-maru-black/60'
  return 'type-meta text-maru-black/80'
})

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
    :class="{
      'max-w-sm gap-4': variant === 'overlay',
      'gap-2': variant === 'footer',
      'save-progress--mobile gap-2': variant === 'mobile',
    }"
  >
    <div
      v-if="showRichChrome"
      class="w-full flex flex-col items-center"
      :class="variant === 'overlay' ? 'gap-3' : 'gap-2'"
    >
      <div
        class="flex flex-col items-center"
        :class="variant === 'overlay' ? 'gap-3' : 'gap-0.5'"
      >
        <p class="save-progress-percent tabular-nums">
          {{ progress.progress }}%
        </p>
        <p :class="overallLabelClass">
          {{ overallLabel }}
        </p>
      </div>

      <div
        class="save-progress-bar-wrapper w-full"
        :class="{ 'save-progress-bar-wrapper--mobile': variant === 'mobile' }"
      >
        <div
          class="save-progress-bar w-full"
          :class="{ 'save-progress-bar--mobile': variant === 'mobile' }"
          role="progressbar"
          :aria-valuenow="progress.progress"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`${overallLabel} ${progress.progress}%`"
        >
          <div
            class="save-progress-bar__fill"
            :class="{
              'save-progress-bar__fill--complete': fillComplete,
              'save-progress-bar__fill--mobile': variant === 'mobile',
            }"
            :style="{ width: `${progress.progress}%` }"
          />
        </div>
        <span
          class="save-progress-bar__thumb"
          :class="{ 'save-progress-bar__thumb--mobile': variant === 'mobile' }"
          :style="{ left: thumbLeft }"
          aria-hidden="true"
        >
          <MaruEmoji
            :name="scrubberEmoji"
            size="sm"
            class="save-progress-bar__thumb-emoji"
          />
        </span>
      </div>
    </div>
    <template v-else>
      <p :class="overallLabelClass">
        {{ overallLabel }}
      </p>
      <div
        class="w-full rounded-full bg-maru-gray-light overflow-hidden h-1.5"
        role="progressbar"
        :aria-valuenow="progress.progress"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`${overallLabel} ${progress.progress}%`"
      >
        <div
          class="h-full bg-maru-blue transition-[width] duration-300"
          :style="{ width: `${progress.progress}%` }"
        />
      </div>
    </template>

    <div
      v-if="operationLabel || trackCountMeta"
      class="w-full flex flex-col min-w-0 items-center gap-1.5"
      :class="{ 'mt-2': variant === 'overlay' }"
    >
      <div
        v-if="operationLabel"
        class="w-full flex flex-col min-w-0 gap-1.5"
      >
        <p :class="operationLabelClass">
          {{ operationLabel }}
        </p>
        <div
          class="save-operation-bar"
          :class="{ 'save-operation-bar--mobile': variant === 'mobile' }"
          role="progressbar"
          :aria-valuenow="Math.round(displayedOperationProgress)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`${operationLabel} ${Math.round(displayedOperationProgress)}%`"
        >
          <div
            class="save-operation-bar__fill"
            :class="{ 'save-operation-bar__fill--mobile': variant === 'mobile' }"
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
  </div>
</template>

<style scoped>
.save-progress-percent {
  margin: 0;
  font-weight: 700;
  font-size: clamp(1.75rem, 1.2rem + 2.5vw, 2.75rem);
  line-height: 0.9;
  color: var(--color-maru-black);
  display: inline-block;
  text-box-trim: trim-both;
  text-box-edge: cap alphabetic;
}

.save-progress-bar-wrapper--mobile {
  margin-top: 0.15rem;
  margin-bottom: 0.35rem;
  padding-inline: 0.15rem;
}

.save-progress-bar--mobile {
  height: 1.15rem;
  box-shadow: 3px 3px 0 var(--color-maru-black);
}

.save-progress-bar__fill--mobile {
  /* Yellow pops on teal busy button — avoids magenta/teal mud. */
  background: var(--color-maru-yellow);
}

.save-progress-bar__thumb--mobile {
  width: 2.15rem;
  height: 2.15rem;
  border-width: 2px;
  box-shadow: 2px 2px 0 var(--color-maru-black);
}

.save-operation-bar--mobile {
  width: min(9.5rem, 70%);
  height: 0.6rem;
  border-width: 2px;
  box-shadow: 2px 2px 0 var(--color-maru-black);
}

.save-operation-bar__fill--mobile {
  background: var(--color-maru-blue);
}
</style>
