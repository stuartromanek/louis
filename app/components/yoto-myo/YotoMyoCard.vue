<script setup lang="ts">
import type { YotoMyoCard } from './types'

const props = defineProps<{
  card?: YotoMyoCard
  selected?: boolean
  loading?: boolean
  placeholder?: boolean
}>()

const emit = defineEmits<{
  select: [card: YotoMyoCard]
}>()

const { playEvent } = useUiSound()

function onSelect() {
  if (props.placeholder || !props.card) return
  playEvent('select')
  emit('select', props.card)
}

function onHover() {
  playEvent('cardHover')
}

function formatDuration(seconds: number): string {
  if (!seconds) return ''
  const totalMinutes = Math.round(seconds / 60)
  return `${totalMinutes} min`
}

const detailLabel = computed(() => {
  if (props.placeholder || !props.card) return ''
  const parts: string[] = []
  if (props.card.duration) parts.push(formatDuration(props.card.duration))
  if (props.card.trackCount) {
    parts.push(`${props.card.trackCount} ${props.card.trackCount === 1 ? 'track' : 'tracks'}`)
  }
  return parts.join(', ')
})

function hashCardId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

const cardMotion = computed(() => {
  if (props.placeholder) {
    return {
      zIndex: 1,
      '--card-rotate': '0deg',
      '--wobble-amp': '0deg',
      '--wobble-duration': '0s',
      '--wobble-delay': '0s',
      '--wobble-lift': '0px',
    }
  }
  const h = hashCardId(props.card?.cardId ?? '')
  const rotation = ((h % 21) - 10) * 0.45
  const wobbleAmp = 0.65 + (h % 5) * 0.28
  const wobbleDuration = 2.8 + (h % 7) * 0.35
  const wobbleDelay = (h % 12) * 0.12
  const wobbleLift = 1 + (h % 3)

  return {
    zIndex: props.selected ? 10 : 1,
    '--card-rotate': `${rotation.toFixed(2)}deg`,
    '--wobble-amp': `${wobbleAmp.toFixed(2)}deg`,
    '--wobble-duration': `${wobbleDuration.toFixed(2)}s`,
    '--wobble-delay': `${wobbleDelay.toFixed(2)}s`,
    '--wobble-lift': `${wobbleLift}px`,
  }
})

const cardMotionStyle = computed(() => {
  const { zIndex, ...vars } = cardMotion.value
  return vars
})
</script>

<template>
  <li
    class="myo-playing-card-slot"
    :style="{ zIndex: cardMotion.zIndex }"
    :class="{
      'myo-playing-card-slot--selected': selected,
      'myo-playing-card-slot--placeholder': placeholder,
    }"
    :aria-hidden="placeholder || undefined"
  >
    <div
      class="myo-playing-card-slot__motion"
      :class="{ 'myo-playing-card-slot__motion--placeholder': placeholder }"
      :style="cardMotionStyle"
    >
      <div
        v-if="placeholder"
        class="myo-playing-card myo-playing-card--placeholder"
      >
        <div class="myo-playing-card__face border-maru rounded-maru overflow-hidden">
          <div class="myo-playing-card__art library-placeholder__pulse" />
          <div class="myo-playing-card__label">
            <p class="myo-playing-card__title library-placeholder__bar" />
          </div>
        </div>
      </div>
      <button
        v-else-if="card"
        type="button"
        class="myo-playing-card"
        :class="{
          'myo-playing-card--selected': selected,
          'myo-playing-card--loading': loading && selected,
        }"
        :aria-pressed="selected"
        :aria-label="`${card.title}${detailLabel ? `, ${detailLabel}` : ''}`"
        :disabled="loading && selected"
        @mouseenter="onHover"
        @click="onSelect"
      >
        <div class="myo-playing-card__face border-maru rounded-maru overflow-hidden">
          <div class="myo-playing-card__art">
            <img
              v-if="card.coverUrl"
              :src="card.coverUrl"
              :alt="card.title"
              class="myo-playing-card__cover"
              loading="lazy"
            >
            <div v-else class="myo-playing-card__cover myo-playing-card__cover--empty">
              <span class="type-caption text-maru-gray">MYO</span>
            </div>
          </div>

          <div class="myo-playing-card__label">
            <p class="myo-playing-card__title type-title-sm font-maru-medium text-maru-black truncate">
              {{ card.title }}
            </p>
          </div>
        </div>
      </button>
    </div>
  </li>
</template>

<style scoped>
.myo-playing-card-slot {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  height: 90%;
  width: auto;
  min-height: 9.25rem;
  overflow: visible;
  transition: z-index 0ms;
}

.myo-playing-card-slot__motion {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: auto;
  transform: rotate(var(--card-rotate, 0deg));
  transform-origin: center 88%;
  animation: myo-card-wobble var(--wobble-duration, 3.5s) ease-in-out infinite;
  animation-delay: var(--wobble-delay, 0s);
}

@media (prefers-reduced-motion: reduce) {
  .myo-playing-card-slot__motion {
    animation: none;
  }
}

.myo-playing-card-slot__motion--placeholder {
  animation: none;
}

.myo-playing-card--placeholder {
  pointer-events: none;
  cursor: default;
}

.myo-playing-card-slot--placeholder {
  pointer-events: none;
}

.myo-playing-card-slot--selected {
  z-index: 20 !important;
}

.myo-playing-card-slot--selected .myo-playing-card-slot__motion {
  transform: rotate(var(--card-rotate, 0deg));
  transition: transform 220ms cubic-bezier(0.2, 0, 0, 1);
  animation-play-state: paused;
}

.myo-playing-card-slot:hover,
.myo-playing-card-slot:focus-within {
  z-index: 10 !important;
}

.myo-playing-card-slot:hover:not(.myo-playing-card-slot--selected) .myo-playing-card-slot__motion,
.myo-playing-card-slot:focus-within:not(.myo-playing-card-slot--selected) .myo-playing-card-slot__motion {
  transform: translateY(-4px) rotate(var(--card-rotate, 0deg));
  transition: transform 220ms cubic-bezier(0.2, 0, 0, 1);
  animation-play-state: paused;
}

.myo-playing-card {
  position: relative;
  display: block;
  height: 100%;
  width: max-content;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  transform: scale(0.91);
  transform-origin: center 88%;
  transition: transform 220ms cubic-bezier(0.2, 0, 0, 1);
}

.myo-playing-card-slot:hover .myo-playing-card:not(.myo-playing-card--selected),
.myo-playing-card-slot:focus-within .myo-playing-card:not(.myo-playing-card--selected) {
  transform: scale(0.93);
}

.myo-playing-card--selected {
  transform: scale(0.96);
}

.myo-playing-card:active:not(.myo-playing-card--selected) {
  transform: scale(0.87);
}

.myo-playing-card-slot:hover .myo-playing-card:active:not(.myo-playing-card--selected),
.myo-playing-card-slot:focus-within .myo-playing-card:active:not(.myo-playing-card--selected) {
  transform: scale(0.87);
}

.myo-playing-card--selected:active {
  transform: scale(0.93);
}

.myo-playing-card__face {
  display: grid;
  grid-template-rows: minmax(0, 1fr) 1.55rem;
  grid-template-columns: min-content;
  height: 100%;
  width: max-content;
  box-sizing: border-box;
  background: var(--color-maru-white);
  box-shadow: 2px 3px 0 var(--color-maru-black);
  transition:
    border-color 220ms cubic-bezier(0.2, 0, 0, 1),
    box-shadow 220ms cubic-bezier(0.2, 0, 0, 1);
}

.myo-playing-card-slot:hover .myo-playing-card__face,
.myo-playing-card-slot:focus-within .myo-playing-card__face {
  box-shadow: 3px 5px 0 var(--color-maru-black);
}

.myo-playing-card--selected .myo-playing-card__face {
  border-width: 6px;
  border-color: var(--color-maru-magenta);
  box-shadow:
    5px 7px 0 var(--color-maru-black),
    inset 0 0 0 3px var(--color-maru-magenta-lighter);
}

.myo-playing-card--selected .myo-playing-card__label {
  background: var(--color-maru-magenta-lighter);
}

.myo-playing-card__art {
  position: relative;
  justify-self: start;
  min-width: 0;
  min-height: 0;
  height: 100%;
  aspect-ratio: 638 / 1011;
  width: auto;
  overflow: hidden;
  background: var(--color-maru-gray-light);
}

.myo-playing-card__cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.myo-playing-card__cover--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.myo-playing-card__label {
  width: 0;
  min-width: 100%;
  height: 100%;
  padding: 0 0.35rem;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-maru-white);
  border-top: 2px solid var(--color-maru-black);
}

.myo-playing-card__title {
  flex: 1 1 0;
  min-width: 0;
  width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-wrap: nowrap;
  text-align: center;
}

.myo-playing-card--loading .myo-playing-card__face {
  opacity: 0.85;
}

@keyframes myo-card-wobble {
  0%,
  100% {
    transform: rotate(calc(var(--card-rotate, 0deg) - var(--wobble-amp, 1deg))) translateY(0);
  }

  33% {
    transform: rotate(calc(var(--card-rotate, 0deg) + var(--wobble-amp, 1deg) * 0.55)) translateY(calc(var(--wobble-lift, 1px) * -1));
  }

  66% {
    transform: rotate(calc(var(--card-rotate, 0deg) - var(--wobble-amp, 1deg) * 0.35)) translateY(var(--wobble-lift, 1px));
  }
}
</style>
