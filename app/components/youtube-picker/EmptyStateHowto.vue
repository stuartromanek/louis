<script setup lang="ts">
import EmptyStateTickers from './EmptyStateTickers.vue'
import { HOWTO_BEATS, colorForIndex } from '~/utils/howtoBeats'

defineProps<{
  placeholders: string[]
  fill?: boolean
}>()

const emit = defineEmits<{
  search: [query: string]
}>()

const { playEvent } = useUiSound()

const activeIndex = ref(0)
const total = HOWTO_BEATS.length
/** Cards that jumped around the back of the fan — skip transform tween for one frame. */
const skipTransition = ref<Set<number>>(new Set())
const fanEl = ref<HTMLElement | null>(null)
const fanScale = ref(1)

/** Signed slot in a balanced fan: active at 0, neighbors at ±1, ±2, … */
function fanRel(index: number, active: number): number {
  let rel = ((index - active) % total + total) % total
  if (rel > total / 2) rel -= total
  return rel
}

function remToPx(raw: string, rootFontSize: number) {
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n)) return 0
  return raw.trim().endsWith('rem') ? n * rootFontSize : n
}

function readFanDesignSize(el: HTMLElement) {
  const styles = getComputedStyle(el)
  const rootFs = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const w = remToPx(styles.getPropertyValue('--howto-fan-w'), rootFs) || 22 * rootFs
  const h = remToPx(styles.getPropertyValue('--howto-fan-h'), rootFs) || 15.5 * rootFs
  // Soft ceiling from CSS vars (raised on tall panes so the cell is the real limit).
  const maxW = remToPx(styles.getPropertyValue('--howto-fan-max-w'), rootFs) || 25 * rootFs
  const maxH = remToPx(styles.getPropertyValue('--howto-fan-max-h'), rootFs) || 18 * rootFs
  return { w, h, maxW, maxH }
}

function syncFanScale() {
  const el = fanEl.value
  if (!el) return
  // Landscape polaroids are parked for now — always use the portrait deck.
  // Re-enable by restoring the aspect check + data-shape='landscape' branch.
  if (el.dataset.shape !== 'portrait') {
    el.dataset.shape = 'portrait'
    void el.offsetWidth
  }
  const { w, h, maxW, maxH } = readFanDesignSize(el)
  if (w <= 0 || h <= 0 || el.clientWidth <= 0 || el.clientHeight <= 0) {
    fanScale.value = 1
    return
  }
  const next = Math.min(
    el.clientWidth / w,
    el.clientHeight / h,
    maxW / w,
    maxH / h,
  )
  fanScale.value = Number.isFinite(next) && next > 0 ? next : 1
}

let fanResizeObserver: ResizeObserver | null = null
let fanMediaCleanup: (() => void) | null = null

function observeFan(el: HTMLElement | null) {
  fanResizeObserver?.disconnect()
  fanResizeObserver = null
  fanMediaCleanup?.()
  fanMediaCleanup = null
  if (!el || typeof ResizeObserver === 'undefined') return
  fanResizeObserver = new ResizeObserver(() => {
    syncFanScale()
  })
  fanResizeObserver.observe(el)
  syncFanScale()

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const queries = [
      window.matchMedia('(max-height: 579px)'),
      window.matchMedia('(min-height: 700px)'),
      window.matchMedia('(min-height: 900px)'),
      window.matchMedia('(max-width: 599px)'),
      window.matchMedia('(max-width: 359px)'),
      window.matchMedia('(max-width: 290px)'),
    ]
    const onChange = () => {
      // Design size CSS vars change with these breakpoints.
      requestAnimationFrame(syncFanScale)
    }
    for (const mq of queries) {
      mq.addEventListener('change', onChange)
    }
    fanMediaCleanup = () => {
      for (const mq of queries) {
        mq.removeEventListener('change', onChange)
      }
    }
  }
}

onMounted(() => {
  observeFan(fanEl.value)
})

watch(fanEl, (el) => {
  observeFan(el)
})

onBeforeUnmount(() => {
  fanResizeObserver?.disconnect()
  fanResizeObserver = null
  fanMediaCleanup?.()
  fanMediaCleanup = null
})

/** Seal-ring sticker palettes — same shape, different maru combos per step. */
const STICKER_SEAL_PALETTES = [
  {
    ring: 'var(--color-maru-green-light)',
    face: 'var(--color-maru-white)',
    num: 'var(--color-maru-blue)',
    arc: 'var(--color-maru-black)',
  },
  {
    ring: 'var(--color-maru-magenta-light)',
    face: 'var(--color-maru-white)',
    num: 'var(--color-maru-magenta)',
    arc: 'var(--color-maru-black)',
  },
  {
    ring: 'var(--color-maru-yellow)',
    face: 'var(--color-maru-white)',
    num: 'var(--color-maru-blue)',
    arc: 'var(--color-maru-black)',
  },
] as const

const cards = computed(() => {
  return HOWTO_BEATS.map((beat, i) => {
    const rel = fanRel(i, activeIndex.value)
    const absRel = Math.abs(rel)
    const sticker = STICKER_SEAL_PALETTES[i % STICKER_SEAL_PALETTES.length]!
    return {
      ...beat,
      step: i + 1,
      color: colorForIndex(i * 5),
      sticker,
      // Fan from active: center on top, neighbors peek left/right (circular).
      rotate: `${rel * 9 + (rel === 0 ? -1.5 : 0)}deg`,
      shift: `${rel * 0.95}rem`,
      lift: `${absRel * 0.22}rem`,
      scale: String(rel === 0 ? 1 : Math.max(0.9, 1 - absRel * 0.05)),
      z: String(total - absRel),
      active: rel === 0,
      behind: absRel > 0,
      skipTransition: skipTransition.value.has(i),
    }
  })
})

const canPrev = computed(() => activeIndex.value > 0)
const canNext = computed(() => activeIndex.value < total - 1)

function setActive(next: number) {
  if (next === activeIndex.value) return
  const wrapping = new Set<number>()
  for (let i = 0; i < total; i++) {
    if (Math.abs(fanRel(i, next) - fanRel(i, activeIndex.value)) > 1) {
      wrapping.add(i)
    }
  }
  skipTransition.value = wrapping
  activeIndex.value = next
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      skipTransition.value = new Set()
    })
  })
}

function goPrev() {
  if (!canPrev.value) {
    playEvent('disabled')
    return
  }
  playEvent('pagePrev')
  setActive(activeIndex.value - 1)
}

function goNext() {
  if (!canNext.value) {
    playEvent('disabled')
    return
  }
  playEvent('pageNext')
  setActive(activeIndex.value + 1)
}

function goTo(index: number) {
  if (index === activeIndex.value) return
  playEvent('toggleOn')
  setActive(index)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    goPrev()
  }
  else if (event.key === 'ArrowRight') {
    event.preventDefault()
    goNext()
  }
}
</script>

<template>
  <div
    class="empty-exp empty-exp--howto"
    :style="{ '--howto-fan-scale': String(fanScale) }"
  >
    <div
      ref="fanEl"
      class="empty-exp-howto__fan"
    >
      <div
        class="empty-exp-howto__deck"
        tabindex="0"
        role="region"
        aria-roledescription="carousel"
        aria-label="How Louis works"
        :aria-activedescendant="`howto-slide-${activeIndex}`"
        @keydown="onKeydown"
      >
        <div class="empty-exp-howto__stage-frame">
          <div class="empty-exp-howto__stage-row">
            <button
              type="button"
              class="empty-exp-howto__nav empty-exp-howto__nav--prev"
              :disabled="!canPrev"
              aria-label="Previous step"
              @click="goPrev"
            >
              <span class="empty-exp-howto__nav-glyph" aria-hidden="true">◀</span>
            </button>

            <ol class="empty-exp-howto__stage list-none m-0 p-0">
              <li
                v-for="(card, i) in cards"
                :id="`howto-slide-${i}`"
                :key="card.title"
                class="empty-exp-howto__card border-maru"
                :class="[
                  card.color.bg,
                  card.color.text,
                  {
                    'empty-exp-howto__card--active': card.active,
                    'empty-exp-howto__card--behind': card.behind,
                    'empty-exp-howto__card--snap': card.skipTransition,
                  },
                ]"
                :style="{
                  '--howto-rotate': card.rotate,
                  '--howto-shift': card.shift,
                  '--howto-lift': card.lift,
                  '--howto-scale': card.scale,
                  '--howto-z': card.z,
                }"
                :aria-hidden="!card.active"
              >
                <span
                  v-if="card.active"
                  class="empty-exp-howto__sticker"
                  aria-hidden="true"
                  :style="{
                    '--sticker-ring': card.sticker.ring,
                    '--sticker-face': card.sticker.face,
                    '--sticker-num': card.sticker.num,
                    '--sticker-arc': card.sticker.arc,
                  }"
                >
                  <svg
                    class="empty-exp-howto__sticker-svg"
                    viewBox="0 0 96 96"
                    focusable="false"
                  >
                    <defs>
                      <path
                        :id="`howto-sticker-seal-top-${i}`"
                        d="M 18 40 A 36 36 0 0 1 78 40"
                      />
                    </defs>
                    <!-- Hard offset shadow disc -->
                    <circle
                      cx="51.5"
                      cy="51.5"
                      r="40"
                      fill="var(--color-maru-black)"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      fill="var(--sticker-ring)"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      fill="none"
                      stroke="var(--color-maru-black)"
                      stroke-width="4"
                    />
                    <!-- Tighter face — ring gets more room for STEP -->
                    <circle
                      cx="48"
                      cy="48"
                      r="19"
                      fill="var(--sticker-face)"
                      stroke="var(--color-maru-black)"
                      stroke-width="3.5"
                    />
                    <text class="empty-exp-howto__sticker-arc">
                      <textPath
                        :href="`#howto-sticker-seal-top-${i}`"
                        startOffset="50%"
                        text-anchor="middle"
                      >
                        STEP
                      </textPath>
                    </text>
                    <text
                      class="empty-exp-howto__sticker-num"
                      x="48"
                      y="49"
                      text-anchor="middle"
                    >{{ card.step }}</text>
                  </svg>
                </span>
                <div class="empty-exp-howto__window border-maru">
                  <img
                    class="empty-exp-howto__art"
                    :src="card.art"
                    :alt="card.artAlt"
                    width="160"
                    height="120"
                    draggable="false"
                  >
                </div>
                <div class="empty-exp-howto__copy">
                  <p class="empty-exp-howto__label font-maru-bold type-title m-0">
                    {{ card.title }}
                  </p>
                  <p class="empty-exp-howto__body type-meta m-0 text-pretty">
                    {{ card.body }}
                  </p>
                </div>
              </li>
            </ol>

            <button
              type="button"
              class="empty-exp-howto__nav empty-exp-howto__nav--next"
              :disabled="!canNext"
              aria-label="Next step"
              @click="goNext"
            >
              <span class="empty-exp-howto__nav-glyph" aria-hidden="true">▶</span>
            </button>
          </div>
        </div>

        <div
          class="empty-exp-howto__dots"
          role="tablist"
          aria-label="Steps"
        >
          <button
            v-for="(_, i) in cards"
            :key="i"
            type="button"
            class="empty-exp-howto__dot"
            :class="{ 'empty-exp-howto__dot--active': i === activeIndex }"
            role="tab"
            :aria-selected="i === activeIndex"
            :aria-label="`Step ${i + 1} of ${total}`"
            @click="goTo(i)"
          />
        </div>
      </div>
    </div>

    <EmptyStateTickers
      class="empty-exp-howto__tickers"
      :placeholders="placeholders"
      :fill="fill"
      hide-header
      @search="emit('search', $event)"
    />
  </div>
</template>

<style scoped>
.empty-exp--howto {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: stretch;
  gap: 0.65rem;
  width: 100%;
  height: 100%;
  flex: 1 1 auto;
  min-height: 0;
  box-sizing: border-box;
  /* Design size of the fan stage-row (scaled to fit the fan cell). */
  --howto-fan-w: 22rem;
  --howto-fan-h: 15.5rem;
  /* Soft ceiling: leave room to grow on tall panes (see min-height media below). */
  --howto-fan-max-w: 25rem;
  --howto-fan-max-h: 18rem;
  /* Extra overall shrink — height (and width) without retuning type/geometry. */
  --howto-fan-shrink: 0.9;
}

/* Mid / tall panes: let the fan use the cell — only the available box should clip it. */
@media (min-height: 700px) {
  .empty-exp--howto {
    --howto-fan-max-w: 40rem;
    --howto-fan-max-h: 32rem;
  }
}

@media (min-height: 900px) {
  .empty-exp--howto {
    --howto-fan-max-w: 48rem;
    --howto-fan-max-h: 40rem;
  }
}

/* Unit 1 — howto fan: shares height, scales to fit width+height from center */
.empty-exp-howto__fan {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: grid;
  place-items: center;
  overflow: hidden;
  container-type: size;
  container-name: howto-fan;
}

/* Landscape fan cell: wider/shorter design so the deck can fill the box. */
.empty-exp-howto__fan[data-shape='landscape'] {
  --howto-fan-w: 26rem;
  --howto-fan-h: 11.5rem;
  --howto-fan-max-w: 48rem;
  --howto-fan-max-h: 48rem;
}

.empty-exp-howto__fan[data-shape='landscape'] .empty-exp-howto__stage {
  width: 22rem;
}

.empty-exp-howto__fan[data-shape='landscape'] .empty-exp-howto__stage-row {
  --howto-nav-from-center: 12.25rem;
}

.empty-exp-howto__fan[data-shape='landscape'] .empty-exp-howto__card {
  flex-direction: row;
  align-items: center;
  gap: 0.75rem;
  width: 18rem;
  padding: 0.55rem 0.75rem 0.55rem 0.5rem;
  text-align: left;
  transform:
    translateX(calc(-50% + var(--howto-shift, 0rem)))
    translateY(calc(-50% + var(--howto-lift, 0rem)))
    rotate(var(--howto-rotate, 0deg))
    scale(var(--howto-scale, 1));
  transform-origin: 50% 50%;
}

.empty-exp-howto__fan[data-shape='landscape'] .empty-exp-howto__window {
  flex: 0 0 auto;
  width: 3.5rem;
  aspect-ratio: 1 / 1;
  margin-bottom: 0;
  padding: 0.3rem;
}

.empty-exp-howto__fan[data-shape='landscape'] .empty-exp-howto__copy {
  flex: 1 1 auto;
  justify-content: center;
  text-align: left;
  min-width: 8rem;
}

.empty-exp-howto__fan[data-shape='landscape'] .empty-exp-howto__label {
  font-size: var(--text-maru-body);
  line-height: var(--text-maru-body--line-height);
}

.empty-exp-howto__fan[data-shape='landscape'] .empty-exp-howto__body {
  margin-top: 0.15rem;
  font-size: var(--text-maru-empty-body);
  line-height: var(--text-maru-empty-body--line-height);
  font-family: var(--font-maru);
}

.empty-exp-howto__deck {
  display: grid;
  place-items: center;
  place-content: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  outline: none;
}

.empty-exp-howto__stage-frame {
  /* Scale is measured via ResizeObserver on the fan cell (see fanScale). */
  position: relative;
  width: calc(var(--howto-fan-w) * var(--howto-fan-scale, 1) * var(--howto-fan-shrink, 1));
  height: calc(var(--howto-fan-h) * var(--howto-fan-scale, 1) * var(--howto-fan-shrink, 1));
  max-width: 100%;
  max-height: 100%;
  overflow: visible;
}

.empty-exp-howto__stage-row {
  position: absolute;
  left: 50%;
  top: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--howto-fan-w);
  height: var(--howto-fan-h);
  transform: translate(-50%, -50%) scale(calc(var(--howto-fan-scale, 1) * var(--howto-fan-shrink, 1)));
  transform-origin: center center;
  --howto-nav-from-center: 8.35rem;
  --howto-nav-edge-min: 0.35rem;
}

.empty-exp-howto__stage {
  position: relative;
  flex: 0 0 auto;
  width: 18rem;
  height: 100%;
  margin: 0;
  overflow: visible;
}

.empty-exp-howto__card {
  position: absolute;
  left: 50%;
  top: 50%;
  bottom: auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 11.25rem;
  padding: 0.45rem 0.65rem 0.75rem;
  overflow: visible;
  border-width: 3px;
  border-radius: var(--radius-maru);
  box-shadow: 4px 4px 0 var(--color-maru-black);
  transform:
    translateX(calc(-50% + var(--howto-shift, 0rem)))
    translateY(calc(-50% + var(--howto-lift, 0rem)))
    rotate(var(--howto-rotate, 0deg))
    scale(var(--howto-scale, 1));
  transform-origin: 50% 50%;
  z-index: var(--howto-z, 1);
  text-align: center;
  box-sizing: border-box;
  pointer-events: none;
  transition:
    transform 260ms cubic-bezier(0.34, 1.45, 0.64, 1),
    box-shadow 180ms ease-out,
    opacity 180ms ease-out;
}

.empty-exp-howto__card--active {
  box-shadow: 6px 7px 0 var(--color-maru-black);
  pointer-events: auto;
}

.empty-exp-howto__card--behind {
  opacity: 0.92;
}

.empty-exp-howto__card--snap {
  transition: none;
}

.empty-exp-howto__window {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  width: 100%;
  margin-bottom: 0.35rem;
  padding: 1rem;
  overflow: hidden;
  border-width: 2px;
  border-radius: calc(var(--radius-maru) - 4px);
  background: var(--color-maru-white);
  box-sizing: border-box;
}

.empty-exp-howto__art {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  pointer-events: none;
  user-select: none;
  transform: scale(0.85);
  transform-origin: center center;
}

.empty-exp-howto__sticker {
  position: absolute;
  top: -0.55rem;
  left: -0.55rem;
  z-index: 2;
  display: block;
  width: 3.25rem;
  height: 3.25rem;
  pointer-events: none;
  transform: none;
  transform-origin: top left;
}

.empty-exp-howto__sticker-svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.empty-exp-howto__sticker-arc {
  fill: var(--sticker-arc, var(--color-maru-black));
  font-family: var(--font-maru);
  font-weight: 700;
  font-size: 13.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.empty-exp-howto__sticker-num {
  fill: var(--sticker-num, var(--color-maru-blue));
  stroke: var(--color-maru-black);
  stroke-width: 3.25px;
  paint-order: stroke fill;
  font-family: var(--font-maru);
  font-weight: 400;
  font-size: 26px;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  dominant-baseline: central;
}

.empty-exp-howto__label {
  text-wrap: balance;
  line-height: 1.15;
}

.empty-exp-howto__body {
  margin-top: 0.2rem;
  opacity: 0.85;
  text-wrap: pretty;
}

.empty-exp-howto__copy {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-width: 0;
}

.empty-exp-howto__dots {
  display: none;
}

.empty-exp-howto__nav {
  --howto-nav-scale: 0.8;
  position: absolute;
  top: 50%;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  margin-top: -1.5rem;
  padding: 0;
  border: 3px solid var(--color-maru-black);
  border-radius: 999px;
  box-shadow: 3px 3px 0 var(--color-maru-black);
  cursor: pointer;
  scale: var(--howto-nav-scale);
  transition:
    scale 0.15s ease-out,
    translate 0.12s ease-out,
    box-shadow 0.12s ease-out,
    background-color 0.15s ease-out,
    color 0.15s ease-out;
}

.empty-exp-howto__nav-glyph {
  position: relative;
  top: 1px;
  font-family: var(--font-maru);
  font-size: var(--text-maru-button);
  line-height: 1;
}

.empty-exp-howto__nav--prev {
  left: max(var(--howto-nav-edge-min), calc(50% - var(--howto-nav-from-center)));
  background: var(--color-maru-magenta-light);
  color: var(--color-maru-black);
}

.empty-exp-howto__nav--prev .empty-exp-howto__nav-glyph {
  left: -1px;
}

.empty-exp-howto__nav--next {
  right: max(var(--howto-nav-edge-min), calc(50% - var(--howto-nav-from-center)));
  background: var(--color-maru-green-light);
  color: var(--color-maru-black);
}

.empty-exp-howto__nav--next .empty-exp-howto__nav-glyph {
  left: 1px;
}

.empty-exp-howto__nav:hover:not(:disabled) {
  translate: -1px -1px;
  box-shadow: 4px 4px 0 var(--color-maru-black);
}

.empty-exp-howto__nav:active:not(:disabled) {
  scale: calc(var(--howto-nav-scale) * 0.96);
  translate: 1px 2px;
  box-shadow: 1px 1px 0 var(--color-maru-black);
  transition: none;
}

.empty-exp-howto__nav:disabled {
  background: var(--color-maru-gray-light);
  color: var(--color-maru-gray);
  cursor: not-allowed;
  box-shadow: none;
  translate: none;
  scale: var(--howto-nav-scale);
}

.empty-exp-howto__dot {
  width: 1.05rem;
  height: 1.05rem;
  padding: 0;
  border: 3px solid var(--color-maru-black);
  border-radius: 999px;
  background: var(--color-maru-gray-light);
  box-shadow: none;
  cursor: pointer;
  transition:
    scale 160ms cubic-bezier(0.34, 1.45, 0.64, 1),
    background-color 160ms ease-out,
    box-shadow 160ms ease-out;
}

.empty-exp-howto__dot:hover {
  scale: 1.1;
}

.empty-exp-howto__dot--active {
  background: var(--color-maru-blue);
  scale: 1.12;
  /* Continuous long shadow — stacked 1px steps so it stays attached to the disc. */
  box-shadow:
    1px 1px 0 var(--color-maru-black),
    2px 2px 0 var(--color-maru-black),
    3px 3px 0 var(--color-maru-black),
    4px 4px 0 var(--color-maru-black),
    5px 5px 0 var(--color-maru-black);
}

.empty-exp-howto__tickers {
  flex: 0 0 auto;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

/* Compact phone panes only: already hugging; keep fan dominant. */
@media (max-width: 380px) and (max-height: 660px) {
  .empty-exp-howto__tickers {
    flex: 0 0 auto;
    justify-content: flex-start;
  }
}

/*
 * Short-viewport landscape polaroids — disabled for now.
 * Re-enable with `@media (max-height: 579px)` (and the narrow+short block below).
 */
@media (max-height: 579px) and (min-width: 100000px) {
  .empty-exp--howto {
    --howto-fan-w: 26rem;
    --howto-fan-h: 9.5rem;
  }

  .empty-exp-howto__stage-row {
    --howto-nav-from-center: 10.5rem;
  }

  .empty-exp-howto__stage {
    width: 22rem;
  }

  .empty-exp-howto__card {
    flex-direction: row;
    align-items: center;
    gap: 0.65rem;
    width: 16.75rem;
    padding: 0.45rem 0.65rem 0.45rem 0.45rem;
    text-align: left;
    bottom: 50%;
    transform:
      translateX(calc(-50% + var(--howto-shift, 0rem)))
      translateY(calc(50% + var(--howto-lift, 0rem)))
      rotate(var(--howto-rotate, 0deg))
      scale(var(--howto-scale, 1));
    transform-origin: 50% 50%;
  }

  .empty-exp-howto__window {
    flex: 0 0 auto;
    width: 4.75rem;
    aspect-ratio: 1 / 1;
    margin-bottom: 0;
    padding: 0.4rem;
  }

  .empty-exp-howto__copy {
    flex: 1 1 auto;
    justify-content: center;
    text-align: left;
  }

  .empty-exp-howto__body {
    margin-top: 0.1rem;
  }

  .empty-exp-howto__sticker {
    top: -0.45rem;
    left: -0.45rem;
    width: 2.85rem;
    height: 2.85rem;
  }

  .empty-exp-howto__nav {
    width: 2.3rem;
    height: 2.3rem;
    margin-top: -1.15rem;
  }
}

/* Phone / narrow pane: tighter design size so scale stays usable. */
@media (max-width: 599px) {
  .empty-exp--howto {
    /* Taller design so scale isn’t width-capped while pink height sits empty. */
    --howto-fan-w: 16.5rem;
    --howto-fan-h: 20rem;
    --howto-fan-max-w: 48rem;
    --howto-fan-max-h: 48rem;
    gap: 0.45rem;
  }

  .empty-exp-howto__stage {
    width: 13.5rem;
  }

  .empty-exp-howto__card {
    width: 11rem;
    padding: 0.45rem 0.55rem 0.6rem;
  }

  .empty-exp-howto__window {
    padding: 0.65rem;
  }

  .empty-exp-howto__stage-row {
    --howto-nav-from-center: 6.5rem;
  }

  .empty-exp-howto__nav {
    width: 2.2rem;
    height: 2.2rem;
    margin-top: -1.1rem;
  }
}

@media (max-width: 399px) {
  .empty-exp-howto__nav {
    --howto-nav-scale: 0.92; /* 0.8 × 1.15 — whole button, not width+scale */
  }
}

/* Narrow + short landscape — disabled for now (see short-viewport block above). */
@media (max-width: 599px) and (max-height: 579px) and (min-width: 100000px) {
  .empty-exp--howto {
    --howto-fan-w: 20rem;
    --howto-fan-h: 8.25rem;
  }

  .empty-exp-howto__stage {
    width: 17rem;
  }

  .empty-exp-howto__stage-row {
    --howto-nav-from-center: 8rem;
  }

  .empty-exp-howto__card {
    width: 14.5rem;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem 0.35rem 0.35rem;
  }

  .empty-exp-howto__window {
    width: 3.75rem;
    padding: 0.3rem;
  }
}

@media (max-width: 359px) {
  .empty-exp--howto {
    /* Wider/shorter so height doesn’t cap scale before width fills the pane. */
    --howto-fan-w: 16.5rem;
    --howto-fan-h: 16rem;
    --howto-fan-max-w: 48rem;
    --howto-fan-max-h: 48rem;
  }

  .empty-exp-howto__stage {
    width: 13.5rem;
  }

  .empty-exp-howto__card {
    width: 11rem;
  }

  .empty-exp-howto__stage-row {
    --howto-nav-from-center: 6.75rem;
  }

  .empty-exp-howto__dot {
    width: 0.95rem;
    height: 0.95rem;
  }

  .empty-exp-howto__dot--active {
    box-shadow:
      1px 1px 0 var(--color-maru-black),
      2px 2px 0 var(--color-maru-black),
      3px 3px 0 var(--color-maru-black),
      4px 4px 0 var(--color-maru-black);
  }
}

/* ~270×494: push width even harder. */
@media (max-width: 290px) {
  .empty-exp--howto {
    --howto-fan-w: 15.5rem;
    --howto-fan-h: 14.5rem;
  }

  .empty-exp-howto__stage {
    width: 13rem;
  }

  .empty-exp-howto__card {
    width: 10.75rem;
  }

  .empty-exp-howto__stage-row {
    --howto-nav-from-center: 7.2rem;
  }
}
</style>
