<script setup lang="ts">
import { colorForIndex, PLACEHOLDER_COLORS } from '~/utils/howtoBeats'

defineOptions({ inheritAttrs: false })

const MIN_ROWS = 1
const MAX_ROWS = 24
const ROW_DURATIONS_S = [60, 72, 66, 70, 56, 78] as const
/** Fallback when a row hasn’t painted yet (chip + vertical pad). */
const FALLBACK_ROW_PX = 48

const props = withDefaults(defineProps<{
  placeholders: string[]
  fill?: boolean
  /** Skip the Search YouTube header (for composite empty states). */
  hideHeader?: boolean
}>(), {
  fill: false,
  hideHeader: false,
})

const emit = defineEmits<{
  search: [query: string]
}>()

const { playEvent } = useUiSound()

type TickerChip = {
  label: string
  colorIndex: number
}

const tickersEl = ref<HTMLElement | null>(null)
const rowCount = ref(MIN_ROWS)

/** How-to composite: keep tickers near half the pane on tall screens; less on short ones. */
function howtoTickerFraction(parentHeight: number) {
  if (parentHeight >= 720) return 0.48
  if (parentHeight >= 560) return 0.4
  return 0.32
}

/** Cap ticker bands only on truly small phone panes so the howto fan keeps priority. */
function viewportRowCap() {
  if (typeof window === 'undefined') return MAX_ROWS
  const w = window.innerWidth
  const h = window.innerHeight
  // ~270×494 — both axes must be compact
  if (w <= 280 && h <= 510) return 1
  // ~360×645 — both axes must be compact
  if (w <= 380 && h <= 660) return 2
  // Desktop / large panes: don’t let chips pile into a wall of rows
  if (h >= 720) return 8
  return 12
}

/** Always show at least 2 rows except on the tiniest phone panes. */
function viewportRowMin() {
  if (typeof window === 'undefined') return 2
  const w = window.innerWidth
  const h = window.innerHeight
  if (w <= 280 && h <= 510) return 1
  return 2
}

/** Deterministic mulberry32 — stable across SSR/client, different per row. */
function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleChips(chips: TickerChip[], seed: number): TickerChip[] {
  const next = chips.slice()
  const rand = mulberry32(seed)
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = next[i]!
    next[i] = next[j]!
    next[j] = tmp
  }
  return next
}

const tickerRows = computed(() => {
  const list = props.placeholders
  if (!list.length) return []

  const count = Math.max(MIN_ROWS, rowCount.value)
  const paletteLen = PLACEHOLDER_COLORS.length
  const base: TickerChip[] = list.map(label => ({ label, colorIndex: 0 }))

  return Array.from({ length: count }, (_, rowIndex) => {
    // Unique shuffle per row; color by row+slot so the same label varies across bands.
    const chips = shuffleChips(base, 0x9E3779B9 ^ (rowIndex * 0x85EBCA6B))
      .map((chip, slot) => ({
        label: chip.label,
        colorIndex: (rowIndex * 5 + slot * 3) % paletteLen,
      }))

    return {
      chips,
      rowIndex,
      duration: `${ROW_DURATIONS_S[rowIndex % ROW_DURATIONS_S.length]}s`,
      reverse: rowIndex % 2 === 1,
    }
  })
})

function measureRowHeight(): number {
  const sample = tickersEl.value?.querySelector('.empty-state-ticker__row')
  if (!(sample instanceof HTMLElement)) return FALLBACK_ROW_PX
  const h = sample.getBoundingClientRect().height
  return h > 0 ? h : FALLBACK_ROW_PX
}

function syncRowCount() {
  const el = tickersEl.value
  const cap = viewportRowCap()
  const minR = Math.min(cap, viewportRowMin())
  if (!el || props.placeholders.length === 0) {
    rowCount.value = minR
    return
  }

  const rowH = measureRowHeight()
  const styles = getComputedStyle(el)
  const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0)

  // Prefer the howto parent budget when the ticker cell hasn’t flexed open yet
  // (hug layout / first paint) so mid panes still land on 2+ rows.
  const parent = el.parentElement
  const parentH = parent?.clientHeight ?? 0
  const fraction = props.hideHeader ? howtoTickerFraction(parentH) : 0.5
  const parentBudget = parentH > 0
    ? Math.max(0, parentH * fraction - padY)
    : 0
  const available = el.clientHeight
  const usable = Math.max(0, available - padY)

  // Hug / howto: size only from the parent share so measured cell height
  // (which mirrors the current row count) can’t ratchet rows past half.
  // Standalone fill: allow growing into the flexed cell when taller than the fallback.
  const budget = props.hideHeader
    ? parentBudget
    : Math.max(usable, parentBudget)
  const fit = budget > 0 ? Math.floor(budget / rowH) : 0

  const next = Math.min(cap, Math.max(minR, fit || minR))
  if (next !== rowCount.value) {
    rowCount.value = next
  }
}

let resizeObserver: ResizeObserver | null = null
let viewportCleanup: (() => void) | null = null

function observeTickers(el: HTMLElement | null) {
  resizeObserver?.disconnect()
  resizeObserver = null
  viewportCleanup?.()
  viewportCleanup = null
  if (!el || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => {
    syncRowCount()
  })
  resizeObserver.observe(el)
  // Hug mode sizes from the howto parent share — watch that too.
  if (el.parentElement) resizeObserver.observe(el.parentElement)
  syncRowCount()

  if (typeof window !== 'undefined') {
    const onViewport = () => {
      syncRowCount()
    }
    window.addEventListener('resize', onViewport)
    viewportCleanup = () => {
      window.removeEventListener('resize', onViewport)
    }
  }
}

onMounted(() => {
  observeTickers(tickersEl.value)
})

watch(tickersEl, (el) => {
  observeTickers(el)
})

watch(
  () => [props.fill, props.placeholders.length] as const,
  async () => {
    await nextTick()
    syncRowCount()
  },
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  viewportCleanup?.()
  viewportCleanup = null
})

function onChipHover() {
  playEvent('chipHover')
}

function onChipClick(placeholder: string) {
  playEvent('toggleOn')
  emit('search', placeholder)
}
</script>

<template>
  <div
    v-if="!hideHeader"
    class="youtube-empty-state__header shrink-0"
  >
    <MaruEmoji
      name="MagnifyingGlass"
      size="empty"
    />

    <p class="empty-state-title">
      Search YouTube
    </p>

    <p class="empty-state-meta max-w-lg hidden sm:block">
      Type a song, show, or artist above to find videos you can preview and add to your playlist.
    </p>
  </div>

  <div
    v-if="tickerRows.length > 0"
    ref="tickersEl"
    class="empty-state-tickers"
    :class="[
      { 'mt-4': !hideHeader, 'empty-state-tickers--hug': hideHeader },
      $attrs.class,
    ]"
    v-bind="{ ...$attrs, class: undefined }"
    aria-label="Suggested searches"
  >
    <div
      v-for="row in tickerRows"
      :key="row.rowIndex"
      class="empty-state-ticker__row"
      :class="{ 'empty-state-ticker__row--reverse': row.reverse }"
    >
      <div
        class="empty-state-ticker__track"
        :style="{ '--ticker-duration': row.duration }"
      >
        <div class="empty-state-ticker__set">
          <button
            v-for="chip in row.chips"
            :key="`a-${row.rowIndex}-${chip.label}`"
            type="button"
            class="maru-button empty-state-chip"
            :class="[colorForIndex(chip.colorIndex).bg, colorForIndex(chip.colorIndex).text]"
            @mouseenter="onChipHover"
            @click="onChipClick(chip.label)"
          >
            <span class="maru-button__label">{{ chip.label }}</span>
          </button>
        </div>
        <div
          class="empty-state-ticker__set empty-state-ticker__set--dup"
          aria-hidden="true"
        >
          <button
            v-for="chip in row.chips"
            :key="`b-${row.rowIndex}-${chip.label}`"
            type="button"
            tabindex="-1"
            class="maru-button empty-state-chip"
            :class="[colorForIndex(chip.colorIndex).bg, colorForIndex(chip.colorIndex).text]"
            @mouseenter="onChipHover"
            @click="onChipClick(chip.label)"
          >
            <span class="maru-button__label">{{ chip.label }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.youtube-empty-state__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.youtube-empty-state__header .maru-emoji + .empty-state-title {
  margin-top: -0.15em;
}

.empty-state-title {
  /* Phone widths sat on the global empty-title floor — nudge the fluid range up. */
  font-size: clamp(1.25rem, 7cqw, 1.75rem);
}

.empty-state-tickers {
  display: flex;
  flex-direction: column;
  gap: 0;
  /* Bleed past bare panel padding (p-2 / sm:p-3) for a hard edge-to-edge ticker. */
  width: calc(100% + 1rem);
  margin-inline: -0.5rem;
  /* Clip the marquee at the sides; rows stay visible so hover scale can spill. */
  overflow: hidden;
  /* Room for first/last-row hover lift + enlarged shadow inside this clip. */
  padding-block: 0.35rem 0.45rem;
  box-sizing: border-box;
}

:global(.youtube-empty-state--fill) .empty-state-tickers {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  justify-content: center;
  margin-bottom: 0;
}

/* How-to composite: hug the capped/floored row count; fan keeps the rest. */
:global(.youtube-empty-state--fill) .empty-state-tickers.empty-exp-howto__tickers,
:global(.youtube-empty-state--fill) .empty-state-tickers--hug {
  flex: 0 0 auto;
  justify-content: flex-start;
}

/* Compact phone panes only: size to the capped row count so the howto fan keeps space. */
@media (max-width: 380px) and (max-height: 660px) {
  :global(.youtube-empty-state--fill) .empty-state-tickers {
    flex: 0 0 auto;
    justify-content: flex-start;
  }
}

@media (min-width: 600px) {
  .empty-state-tickers {
    width: calc(100% + 1.5rem);
    margin-inline: -0.75rem;
  }
}

.empty-state-ticker__row {
  /* Visible so :hover scale/lift can paint into neighboring row gutters;
     parent .empty-state-tickers still clips the horizontal marquee. */
  overflow: visible;
  position: relative;
  z-index: 0;
  width: 100%;
  flex-shrink: 0;
  /* Minimal pad: resting shadow / baseline spacing; hover spills past this. */
  padding-block: 0.15rem 0.28rem;
}

.empty-state-ticker__row:hover,
.empty-state-ticker__row:focus-within {
  /* Lift the whole band so an enlarged chip paints above adjacent rows. */
  z-index: 2;
}

.empty-state-ticker__track {
  display: flex;
  width: max-content;
  animation: empty-state-ticker-scroll var(--ticker-duration, 30s) linear infinite;
  will-change: transform;
}

.empty-state-ticker__row--reverse .empty-state-ticker__track {
  animation-direction: reverse;
}

.empty-state-ticker__set {
  display: flex;
  flex-shrink: 0;
  gap: 0.65rem;
  /* Trailing gap is part of each set’s width so -50% loops cleanly. */
  padding-right: 0.65rem;
}

@keyframes empty-state-ticker-scroll {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(-50%);
  }
}

.empty-state-tickers .maru-button {
  font-size: var(--text-maru-button-sm);
  line-height: var(--text-maru-button-sm--line-height);
  font-weight: 500;
  padding: 0.55rem 1rem;
  flex-shrink: 0;
}

.empty-state-tickers .maru-button__label {
  /* Smaller bold type needs less downward optical nudge than mega CTAs */
  top: 1px;
}

.empty-state-chip {
  position: relative;
  scale: 1;
  transform: translateY(0) scale(1);
  transform-origin: center center;
  box-shadow: 3px 3px 0 var(--color-maru-black);
  transition:
    transform 320ms cubic-bezier(0.34, 1.45, 0.64, 1),
    box-shadow 200ms ease-out,
    z-index 0ms;
}

.empty-state-chip:hover {
  z-index: 20;
  scale: 1;
  transform: translateY(-0.15em) scale(1.05);
  box-shadow: 5px 6px 0 var(--color-maru-black);
}

.empty-state-chip:active {
  z-index: 20;
  scale: 1;
  transform: translateY(0.05em) scale(0.96);
  box-shadow: 1px 1px 0 var(--color-maru-black);
  transition-duration: 100ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

@media (max-width: 939px) {
  .empty-state-tickers .maru-button {
    padding: 0.5rem 0.85rem;
  }
}

/* Narrow phone empty column (~270 viewport): denser chips, leave ~360 alone. */
@container (max-width: 250px) {
  .empty-state-tickers {
    gap: 0;
  }

  .empty-state-ticker__row {
    padding-block: 0.1rem 0.2rem;
  }

  .empty-state-ticker__set {
    gap: 0.35rem;
    padding-right: 0.35rem;
  }

  .empty-state-tickers .maru-button {
    font-size: var(--text-maru-label);
    line-height: var(--text-maru-label--line-height);
    padding: 0.28rem 0.55rem;
  }

  .empty-state-tickers .maru-button__label {
    top: 0;
  }

  .empty-state-chip {
    box-shadow: 1.5px 1.5px 0 var(--color-maru-black);
  }

  .empty-state-chip:hover {
    box-shadow: 2.5px 3px 0 var(--color-maru-black);
  }

  .empty-state-chip:active {
    box-shadow: 1px 1px 0 var(--color-maru-black);
  }
}

@media (prefers-reduced-motion: reduce) {
  .empty-state-ticker__row {
    overflow: visible;
  }

  .empty-state-ticker__track {
    animation: none;
    flex-wrap: wrap;
    justify-content: center;
    width: 100%;
    max-width: 100%;
    transform: none;
    will-change: auto;
  }

  .empty-state-ticker__set--dup {
    display: none;
  }

  .empty-state-ticker__set {
    flex-wrap: wrap;
    justify-content: center;
    width: 100%;
  }
}
</style>
