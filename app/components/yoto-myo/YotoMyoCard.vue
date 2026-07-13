<script setup lang="ts">
import type { YotoMyoCard } from './types'

const props = defineProps<{
  card: YotoMyoCard
  selected?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  select: [card: YotoMyoCard]
}>()

const { playEvent } = useUiSound()

function onSelect() {
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

function formatTrackCount(count: number): string {
  if (!count) return ''
  return `${count} trk`
}

const detailLabel = computed(() => {
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
  const h = hashCardId(props.card.cardId)
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
    :class="{ 'myo-playing-card-slot--selected': selected }"
  >
    <div
      class="myo-playing-card-slot__motion"
      :style="cardMotionStyle"
    >
      <button
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
      <div class="myo-playing-card__face border-maru rounded-maru bg-maru-white overflow-hidden">
        <div class="myo-playing-card__art">
          <img
            v-if="card.coverUrl"
            :src="card.coverUrl"
            :alt="card.title"
            class="myo-playing-card__cover"
            loading="lazy"
          >
          <div v-else class="myo-playing-card__cover myo-playing-card__cover--empty">
            <span class="font-maru-mono text-[10px] text-maru-gray">MYO</span>
          </div>

          <p
            v-if="card.duration || card.trackCount"
            class="myo-playing-card__duration font-maru-mono text-[1.25rem] tabular-nums"
          >
            <template v-if="card.duration">{{ formatDuration(card.duration) }}</template>
            <template v-if="card.duration && card.trackCount"> · </template>
            <template v-if="card.trackCount">{{ formatTrackCount(card.trackCount) }}</template>
          </p>
        </div>

        <div class="myo-playing-card__footer border-maru-top">
          <p class="myo-playing-card__title font-maru-bold text-maru-black line-clamp-2 text-pretty">
            {{ card.title }}
          </p>
          <p
            v-if="card.author"
            class="font-maru-mono text-[10px] text-maru-gray truncate leading-tight mt-0.5"
          >
            {{ card.author }}
          </p>
          <p
            v-if="loading && selected"
            class="font-maru-mono text-[9px] text-maru-gray leading-tight mt-0.5"
          >
            Loading...
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
  flex: 0 0 auto;
  height: 90%;
  min-height: 7.65rem;
  overflow: visible;
  scroll-snap-align: start;
  transition: z-index 0ms;
}

.myo-playing-card-slot__motion {
  height: 100%;
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
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  transform: scale(0.91);
  transform-origin: center center;
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
  height: 100%;
  width: auto;
  aspect-ratio: 5 / 7;
  display: grid;
  grid-template-rows: 1fr auto;
  box-sizing: border-box;
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

.myo-playing-card--selected .myo-playing-card__footer {
  background: var(--color-maru-magenta-lighter);
}

.myo-playing-card__art {
  position: relative;
  min-height: 0;
  overflow: hidden;
  background: var(--color-maru-gray-light);
}

.myo-playing-card__cover {
  width: 100%;
  height: 100%;
  min-height: 100%;
  object-fit: cover;
  display: block;
}

.myo-playing-card__cover--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 5rem;
}

.myo-playing-card__duration {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  padding: 0.125rem 0.25rem;
  border: 2px solid var(--color-maru-black);
  border-radius: calc(var(--radius-maru) - 2px);
  background: var(--color-maru-yellow-light);
  color: var(--color-maru-black);
  line-height: 1;
}

.myo-playing-card__footer {
  padding: 0.5rem 0.5rem 0.625rem;
  background: var(--color-maru-white);
}

.myo-playing-card__title {
  font-size: 1.25rem;
  line-height: 0.75;
}

@media (min-width: 600px) {
  .myo-playing-card__title {
    font-size: 1.5rem;
  }
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
