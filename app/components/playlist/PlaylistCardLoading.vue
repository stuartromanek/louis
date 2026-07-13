<script setup lang="ts">
import { pickRandomEmoji, type EmojiId } from '~/utils/emojiCatalog'

const CELL_MIN_PX = 34
const GAP_PX = 2
const MIN_COLS = 6
const MIN_ROWS = 6
const MAX_EMOJI_SIZE_REM = 2.35

type GridEmoji = {
  id: number
  emoji: EmojiId
  delay: number
  duration: number
  rotateEnd: number
}

withDefaults(defineProps<{
  /** Center label heading. */
  heading?: string
  /** Optional subtitle under the heading. */
  title?: string
  /** Show the center label card. */
  showLabel?: boolean
}>(), {
  heading: 'Loading card',
  title: undefined,
  showLabel: true,
})

const fieldRef = ref<HTMLElement | null>(null)
const gridCols = ref(MIN_COLS)
const gridRows = ref(MIN_ROWS)
const emojiSizeRem = ref(MAX_EMOJI_SIZE_REM)
const cells = ref<GridEmoji[]>([])

function createCell(id: number, cols: number): GridEmoji {
  const clockwise = id % 2 === 0
  const col = id % cols
  const row = Math.floor(id / cols)

  return {
    id,
    emoji: pickRandomEmoji(),
    delay: col * 0.1 + row * 0.05,
    duration: 3.2 + (id % 4) * 0.35,
    rotateEnd: (clockwise ? 1 : -1) * 360,
  }
}

function rebuildCells(cols: number, rows: number) {
  const count = cols * rows
  cells.value = Array.from({ length: count }, (_, id) => createCell(id, cols))
}

function layoutGrid() {
  const el = fieldRef.value
  if (!el) return

  const { width, height } = el.getBoundingClientRect()
  if (width <= 0 || height <= 0) return

  const cols = Math.max(MIN_COLS, Math.floor((width + GAP_PX) / (CELL_MIN_PX + GAP_PX)))
  const rows = Math.max(MIN_ROWS, Math.floor((height + GAP_PX) / (CELL_MIN_PX + GAP_PX)))
  const cellW = (width - GAP_PX * (cols - 1)) / cols
  const cellH = (height - GAP_PX * (rows - 1)) / rows
  const cellPx = Math.min(cellW, cellH)

  gridCols.value = cols
  gridRows.value = rows
  emojiSizeRem.value = Math.min(MAX_EMOJI_SIZE_REM, (cellPx * 0.88) / 16)

  if (cells.value.length !== cols * rows) {
    rebuildCells(cols, rows)
  }
}

let resizeObserver: ResizeObserver | undefined

onMounted(() => {
  rebuildCells(gridCols.value, gridRows.value)
  layoutGrid()

  resizeObserver = new ResizeObserver(() => layoutGrid())
  if (fieldRef.value) resizeObserver.observe(fieldRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <div
    class="playlist-card-loading"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div
      ref="fieldRef"
      class="playlist-card-loading__field"
      :style="{
        '--grid-cols': gridCols,
        '--grid-rows': gridRows,
      }"
      aria-hidden="true"
    >
      <span
        v-for="cell in cells"
        :key="cell.id"
        class="playlist-card-loading__emoji"
        :style="{
          animationDuration: `${cell.duration}s`,
          animationDelay: `${cell.delay}s`,
          '--rotate-end': `${cell.rotateEnd}deg`,
        }"
      >
        <MaruEmoji :name="cell.emoji" :size-rem="emojiSizeRem" />
      </span>
    </div>

    <div
      v-if="showLabel"
      class="playlist-card-loading__label"
    >
      <p class="empty-state-title playlist-card-loading__title">
        {{ heading }}
      </p>
      <p
        v-if="title"
        class="empty-state-meta max-w-xs mt-1"
      >
        {{ title }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.playlist-card-loading {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.playlist-card-loading__field {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(var(--grid-cols, 6), minmax(0, 1fr));
  grid-template-rows: repeat(var(--grid-rows, 8), minmax(0, 1fr));
  gap: 2px;
  padding: 0.25rem;
  overflow: hidden;
}

.playlist-card-loading__emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  animation-name: playlist-emoji-spin;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform;
}

.playlist-card-loading__label {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  width: max-content;
  max-width: min(100%, 18rem);
  padding: 0.4375rem 1.25rem 0.5625rem;
  border: 3px solid var(--color-maru-black);
  border-radius: var(--radius-maru);
  background: var(--color-maru-yellow);
  box-shadow: 4px 4px 0 var(--color-maru-black);
}

.playlist-card-loading__title {
  position: relative;
  top: 3px;
  margin: 0;
  font-size: 1.75rem;
  line-height: 0.9;
  white-space: nowrap;
}

@keyframes playlist-emoji-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(var(--rotate-end, 360deg));
  }
}

@media (prefers-reduced-motion: reduce) {
  .playlist-card-loading__emoji {
    animation: none;
  }
}
</style>
