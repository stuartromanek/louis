<script setup lang="ts">
import MaruTooltip from '~/components/ui/MaruTooltip.vue'
import { TRACK_ART_PALETTE } from './types'
import { toIcon16x16, uploadTrackArtPng } from './upload'

const GRID = 16
/** Fixed palette rows — new colors grow columns instead of stretching canvas height. */
const PALETTE_ROWS = 8
const PALETTE_MIN_COLS = 2

/** Reorder a row-major palette into column-major for `grid-auto-flow: column`. */
function toColumnMajor(colors: readonly string[], cols: number, rows: number): string[] {
  const out: string[] = []
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const i = r * cols + c
      if (i < colors.length) out.push(colors[i]!)
    }
  }
  return out
}

const props = defineProps<{
  /** Image to approximate onto the 16×16 grid when entering Draw (selected icon or saved art). */
  seedPreviewUrl?: string | null
  /** True while the Draw tab is visible — enables OS undo/redo shortcuts. */
  active?: boolean
}>()

const emit = defineEmits<{
  select: [payload: { icon16x16: string; previewUrl: string }]
  preview: [url: string | null]
}>()

type Tool = 'draw' | 'erase'

const pixels = ref<(string | null)[]>(Array.from({ length: GRID * GRID }, () => null))
const tool = ref<Tool>('draw')
const palette = ref<string[]>(toColumnMajor(TRACK_ART_PALETTE, PALETTE_MIN_COLS, PALETTE_ROWS))
const color = ref<string>(TRACK_ART_PALETTE[9] ?? '#0068FF')
const painting = ref(false)
const applying = ref(false)
const errorMessage = ref('')
const canvasRef = ref<HTMLCanvasElement | null>(null)
const railRef = ref<HTMLElement | null>(null)
const colorInputRef = ref<HTMLInputElement | null>(null)

const paletteColumns = computed(() =>
  Math.max(PALETTE_MIN_COLS, Math.ceil(palette.value.length / PALETTE_ROWS)),
)

/** Desktop tooltips sit to the right; phone rail is horizontal so prefer top. */
const isPhoneLayout = ref(false)
const toolTooltipPlacement = computed(() => (isPhoneLayout.value ? 'top' : 'right'))

function syncPhoneLayoutFlag() {
  if (!import.meta.client) return
  isPhoneLayout.value = window.matchMedia('(max-width: 599px)').matches
}
let previewRaf: number | null = null
/** Last URL successfully applied to the grid — skip reseed while unchanged. */
const lastSeededUrl = ref<string | null>(null)
let seedGeneration = 0

const MAX_HISTORY = 40
const past = ref<(string | null)[][]>([])
const future = ref<(string | null)[][]>([])

const hasPaint = computed(() => pixels.value.some(Boolean))
const paletteFocusIndex = ref(0)
const paletteListRef = ref<HTMLElement | null>(null)

/** On-screen size of one 16×16 grid cell (matches canvas display). */
const displayPixelSize = ref(16)
let layoutResizeObserver: ResizeObserver | null = null

function updateDisplayPixelSize() {
  const canvas = canvasRef.value
  if (!canvas) return
  const next = Math.max(1, Math.round(canvas.clientWidth / GRID))
  if (next !== displayPixelSize.value) displayPixelSize.value = next
}

/** Square canvas height/width = rail (palette + tools) height on desktop. */
function syncCanvasToRail() {
  const canvas = canvasRef.value
  const rail = railRef.value
  if (!canvas) return

  if (import.meta.client && window.matchMedia('(max-width: 599px)').matches) {
    canvas.style.width = ''
    canvas.style.height = ''
    updateDisplayPixelSize()
    return
  }

  if (!rail) return
  const size = Math.round(rail.getBoundingClientRect().height)
  if (size < 48) return
  const px = `${size}px`
  if (canvas.style.width !== px) {
    canvas.style.width = px
    canvas.style.height = px
  }
  updateDisplayPixelSize()
}

function cursorDataUrl(svg: string, hotspot: number): string {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${hotspot} ${hotspot}, crosshair`
}

const canvasCursor = computed(() => {
  const size = displayPixelSize.value
  const hotspot = Math.floor(size / 2)
  const stroke = Math.max(1, Math.round(size / 12))

  if (tool.value === 'erase') {
    const half = size / 2
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" shape-rendering="crispEdges">`
      + `<rect width="${half}" height="${half}" fill="#e8e8e0"/>`
      + `<rect x="${half}" width="${half}" height="${half}" fill="#c8c8be"/>`
      + `<rect y="${half}" width="${half}" height="${half}" fill="#c8c8be"/>`
      + `<rect x="${half}" y="${half}" width="${half}" height="${half}" fill="#e8e8e0"/>`
      + `<rect x="${stroke / 2}" y="${stroke / 2}" width="${size - stroke}" height="${size - stroke}" fill="none" stroke="#000" stroke-width="${stroke}"/>`
      + `</svg>`
    return cursorDataUrl(svg, hotspot)
  }

  const fill = normalizeHex(color.value)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" shape-rendering="crispEdges">`
    + `<rect width="${size}" height="${size}" fill="${fill}"/>`
    + `<rect x="${stroke / 2}" y="${stroke / 2}" width="${size - stroke}" height="${size - stroke}" fill="none" stroke="#000" stroke-width="${stroke}"/>`
    + `</svg>`
  return cursorDataUrl(svg, hotspot)
})

function clonePixels(source: (string | null)[] = pixels.value): (string | null)[] {
  return source.slice()
}

function emptyPixels(): (string | null)[] {
  return Array.from({ length: GRID * GRID }, () => null)
}

function commitHistory() {
  past.value = [...past.value, clonePixels()].slice(-MAX_HISTORY)
  future.value = []
}

function undo() {
  if (painting.value || applying.value || past.value.length === 0) return
  const prev = past.value[past.value.length - 1]!
  past.value = past.value.slice(0, -1)
  future.value = [...future.value, clonePixels()]
  pixels.value = prev
}

function redo() {
  if (painting.value || applying.value || future.value.length === 0) return
  const next = future.value[future.value.length - 1]!
  future.value = future.value.slice(0, -1)
  past.value = [...past.value, clonePixels()].slice(-MAX_HISTORY)
  pixels.value = next
}

function indexAt(x: number, y: number) {
  return y * GRID + x
}

function paintAt(clientX: number, clientY: number) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = Math.floor(((clientX - rect.left) / rect.width) * GRID)
  const y = Math.floor(((clientY - rect.top) / rect.height) * GRID)
  if (x < 0 || y < 0 || x >= GRID || y >= GRID) return
  const i = indexAt(x, y)
  const nextValue = tool.value === 'erase' ? null : color.value
  if (pixels.value[i] === nextValue) return
  const next = pixels.value.slice()
  next[i] = nextValue
  pixels.value = next
}

function onPointerDown(event: PointerEvent) {
  if (applying.value) return
  painting.value = true
  commitHistory()
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  paintAt(event.clientX, event.clientY)
}

function onPointerMove(event: PointerEvent) {
  if (!painting.value) return
  paintAt(event.clientX, event.clientY)
}

function onPointerUp() {
  painting.value = false
}

function setTool(next: Tool) {
  tool.value = next
}

function setColor(next: string) {
  color.value = normalizeHex(next)
  tool.value = 'draw'
  const idx = palette.value.findIndex(swatch => normalizeHex(swatch) === color.value)
  if (idx >= 0) paletteFocusIndex.value = idx
}

function paletteOptionTabIndex(index: number) {
  const selectedIdx = palette.value.findIndex(swatch => normalizeHex(swatch) === normalizeHex(color.value))
  const focusIdx = selectedIdx >= 0 ? selectedIdx : paletteFocusIndex.value
  return index === focusIdx ? 0 : -1
}

function focusPaletteOption(index: number) {
  const next = Math.max(0, Math.min(palette.value.length - 1, index))
  paletteFocusIndex.value = next
  nextTick(() => {
    const el = paletteListRef.value?.querySelectorAll<HTMLElement>('[role="option"]')[next]
    el?.focus()
  })
}

function onPaletteKeydown(event: KeyboardEvent) {
  const colors = palette.value
  if (!colors.length) return
  // Desktop palette is column-major (8 rows); phone is row-major (8 columns).
  const phone = isPhoneLayout.value
  const across = phone ? Math.max(1, Math.min(8, colors.length)) : PALETTE_ROWS

  let idx = paletteFocusIndex.value
  const selectedIdx = colors.findIndex(swatch => normalizeHex(swatch) === normalizeHex(color.value))
  if (selectedIdx >= 0) idx = selectedIdx

  let next = idx
  if (event.key === 'ArrowRight') next = Math.min(colors.length - 1, idx + (phone ? 1 : across))
  else if (event.key === 'ArrowLeft') next = Math.max(0, idx - (phone ? 1 : across))
  else if (event.key === 'ArrowDown') next = Math.min(colors.length - 1, idx + (phone ? across : 1))
  else if (event.key === 'ArrowUp') next = Math.max(0, idx - (phone ? across : 1))
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = colors.length - 1
  else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const swatch = colors[idx]
    if (swatch) setColor(swatch)
    return
  }
  else return

  event.preventDefault()
  const swatch = colors[next]
  if (!swatch) return
  setColor(swatch)
  focusPaletteOption(next)
}

function normalizeHex(value: string): string {
  const raw = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase()
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const r = raw[1]!
    const g = raw[2]!
    const b = raw[3]!
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return raw.toUpperCase()
}

function openColorPicker() {
  const input = colorInputRef.value
  if (!input) return
  input.value = normalizeHex(color.value)
  // showPicker is widely supported in Chromium/Safari; fall back to click.
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker()
      return
    }
    catch {
      // fall through
    }
  }
  input.click()
}

function onColorPicked(event: Event) {
  const value = normalizeHex((event.target as HTMLInputElement).value)
  if (!value) return

  const existing = palette.value.findIndex(swatch => normalizeHex(swatch) === value)
  if (existing >= 0) {
    // Already in palette — just select it.
    setColor(palette.value[existing]!)
    return
  }

  palette.value = [...palette.value, value]
  setColor(value)
}

function clearCanvas() {
  if (applying.value) return
  if (!hasPaint.value) return
  commitHistory()
  pixels.value = emptyPixels()
}

function onEditorKeyDown(event: KeyboardEvent) {
  if (!props.active || applying.value) return
  const mod = event.metaKey || event.ctrlKey
  if (!mod) return

  const key = event.key.toLowerCase()
  const isUndo = key === 'z' && !event.shiftKey && !event.altKey
  const isRedo = (key === 'z' && event.shiftKey) || key === 'y'
  if (!isUndo && !isRedo) return

  // Don't steal undo from text fields if focus somehow lands there.
  const target = event.target as HTMLElement | null
  if (target) {
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
  }

  event.preventDefault()
  if (isUndo) undo()
  else redo()
}

function drawCheckerboard(ctx: CanvasRenderingContext2D, size: number) {
  const cell = size / GRID
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const light = (x + y) % 2 === 0
      ctx.fillStyle = light ? '#e8e8e0' : '#c8c8be'
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }
}

function renderCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const size = canvas.width
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false
  drawCheckerboard(ctx, size)
  const cell = size / GRID
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const px = pixels.value[indexAt(x, y)]
      if (!px) continue
      ctx.fillStyle = px
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }
}

function pixelsToDataUrl(): string | null {
  const off = document.createElement('canvas')
  off.width = GRID
  off.height = GRID
  const ctx = off.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, GRID, GRID)
  let painted = false
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const px = pixels.value[indexAt(x, y)]
      if (!px) continue
      painted = true
      ctx.fillStyle = px
      ctx.fillRect(x, y, 1, 1)
    }
  }
  if (!painted) return null
  return off.toDataURL('image/png')
}

function scheduleLivePreview() {
  if (previewRaf != null) return
  previewRaf = requestAnimationFrame(() => {
    previewRaf = null
    emit('preview', pixelsToDataUrl())
  })
}

watch(pixels, () => {
  renderCanvas()
  scheduleLivePreview()
}, { deep: true })

watch(
  () => props.active,
  (isActive) => {
    if (isActive) {
      window.addEventListener('keydown', onEditorKeyDown)
      nextTick(() => syncCanvasToRail())
      return
    }
    window.removeEventListener('keydown', onEditorKeyDown)
  },
  { immediate: true },
)

watch(
  () => [props.active, props.seedPreviewUrl] as const,
  ([isActive, seedUrl]) => {
    if (!isActive || !seedUrl) return
    if (seedUrl === lastSeededUrl.value) return
    void seedFromPreview(seedUrl)
  },
  { immediate: true },
)

onMounted(() => {
  renderCanvas()
  syncPhoneLayoutFlag()
  syncCanvasToRail()
  if (typeof ResizeObserver !== 'undefined') {
    layoutResizeObserver = new ResizeObserver(() => syncCanvasToRail())
    if (railRef.value) layoutResizeObserver.observe(railRef.value)
    if (canvasRef.value) layoutResizeObserver.observe(canvasRef.value)
  }
  window.addEventListener('resize', syncCanvasToRail)
  window.addEventListener('resize', syncPhoneLayoutFlag)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onEditorKeyDown)
  window.removeEventListener('resize', syncCanvasToRail)
  window.removeEventListener('resize', syncPhoneLayoutFlag)
  if (previewRaf != null) cancelAnimationFrame(previewRaf)
  layoutResizeObserver?.disconnect()
  layoutResizeObserver = null
})

function proxySeedUrl(url: string): string {
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/')) return url
  return `/api/yoto/icons/proxy?url=${encodeURIComponent(url)}`
}

async function seedFromPreview(url: string) {
  const generation = ++seedGeneration
  try {
    const img = new Image()
    // Proxied URLs are same-origin; data/blob don't need CORS either.
    const src = proxySeedUrl(url)
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('load failed'))
      img.src = src
    })
    // A newer seed request may have started while we waited.
    if (generation !== seedGeneration) return
    if (props.seedPreviewUrl !== url) return
    const off = document.createElement('canvas')
    off.width = GRID
    off.height = GRID
    const ctx = off.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, GRID, GRID)
    ctx.drawImage(img, 0, 0, GRID, GRID)
    const data = ctx.getImageData(0, 0, GRID, GRID).data
    const next: (string | null)[] = []
    for (let i = 0; i < GRID * GRID; i++) {
      const o = i * 4
      const a = data[o + 3]!
      if (a < 16) {
        next.push(null)
        continue
      }
      const r = data[o]!
      const g = data[o + 1]!
      const b = data[o + 2]!
      next.push(`#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`)
    }
    // Seed replaces the canvas; reset undo stack so undo doesn't jump to blank unexpectedly.
    past.value = []
    future.value = []
    pixels.value = next
    lastSeededUrl.value = url
  }
  catch {
    // Seed is best-effort — leave lastSeededUrl unset so a later visit can retry.
  }
}

function exportPngBlob(): Promise<Blob> {
  const off = document.createElement('canvas')
  off.width = GRID
  off.height = GRID
  const ctx = off.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Could not create canvas'))
  ctx.clearRect(0, 0, GRID, GRID)
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const px = pixels.value[indexAt(x, y)]
      if (!px) continue
      ctx.fillStyle = px
      ctx.fillRect(x, y, 1, 1)
    }
  }
  return new Promise((resolve, reject) => {
    off.toBlob((blob) => {
      if (!blob) reject(new Error('PNG export failed'))
      else resolve(blob)
    }, 'image/png')
  })
}

async function applyDrawing() {
  if (applying.value) return
  if (!hasPaint.value) {
    errorMessage.value = 'Draw something first'
    return
  }
  applying.value = true
  errorMessage.value = ''
  try {
    const blob = await exportPngBlob()
    const uploaded = await uploadTrackArtPng(blob, 'drawn-icon.png')
    const localPreview = URL.createObjectURL(blob)
    emit('select', {
      icon16x16: toIcon16x16(uploaded.mediaId),
      previewUrl: uploaded.url || localPreview,
    })
  }
  catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    errorMessage.value = e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Could not upload drawing'
  }
  finally {
    applying.value = false
  }
}

defineExpose({
  applyDrawing,
  applying,
  hasPaint,
})
</script>

<template>
  <div class="track-art-draw">
    <div class="track-art-draw__main">
      <div class="track-art-draw__stage">
        <canvas
          ref="canvasRef"
          class="track-art-draw__canvas"
          width="256"
          height="256"
          role="img"
          aria-label="16 by 16 drawing"
          :style="{ cursor: canvasCursor }"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @pointerleave="onPointerUp"
        />
      </div>

      <p
        v-if="errorMessage"
        class="track-art-draw__error type-meta text-maru-red"
        role="alert"
      >
        {{ errorMessage }}
      </p>
    </div>

    <div
      ref="railRef"
      class="track-art-draw__rail"
    >
      <div
        class="track-art-draw__palette-col"
        :style="{ '--track-art-palette-cols': String(paletteColumns) }"
      >
        <button
          type="button"
          class="track-art-draw__swatch track-art-draw__swatch--picker"
          aria-label="Pick a custom color"
          title="Pick a custom color"
          @click="openColorPicker"
        >
          <span
            class="track-art-draw__picker-stripe"
            aria-hidden="true"
          >
            <span class="track-art-draw__picker-bar track-art-draw__picker-bar--yellow" />
            <span class="track-art-draw__picker-bar track-art-draw__picker-bar--turquoise" />
            <span class="track-art-draw__picker-bar track-art-draw__picker-bar--orange" />
            <span class="track-art-draw__picker-bar track-art-draw__picker-bar--blue" />
            <span class="track-art-draw__picker-bar track-art-draw__picker-bar--red" />
            <span class="track-art-draw__picker-bar track-art-draw__picker-bar--green" />
          </span>
        </button>
        <input
          ref="colorInputRef"
          class="track-art-draw__color-input"
          type="color"
          :value="color"
          tabindex="-1"
          aria-hidden="true"
          @change="onColorPicked"
        >

        <div
          ref="paletteListRef"
          class="track-art-draw__palette"
          role="listbox"
          aria-label="Color palette"
          aria-orientation="vertical"
          @keydown="onPaletteKeydown"
        >
          <button
            v-for="(swatch, index) in palette"
            :key="`${swatch}-${index}`"
            type="button"
            class="track-art-draw__swatch"
            :class="{ 'track-art-draw__swatch--selected': color === swatch && tool === 'draw' }"
            :aria-label="`Color ${swatch}`"
            :aria-selected="color === swatch && tool === 'draw'"
            role="option"
            :tabindex="paletteOptionTabIndex(index)"
            @click="setColor(swatch)"
            @focus="paletteFocusIndex = index"
          >
            <span
              class="track-art-draw__swatch-fill"
              :style="{ backgroundColor: swatch }"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      <div
        class="track-art-draw__tools"
        role="toolbar"
        aria-label="Drawing tools"
      >
        <MaruTooltip
          text="Draw"
          :placement="toolTooltipPlacement"
        >
          <button
            type="button"
            class="track-art-draw__tool"
            :class="{ 'track-art-draw__tool--selected': tool === 'draw' }"
            :aria-pressed="tool === 'draw'"
            aria-label="Draw"
            @click="setTool('draw')"
          >
            <MaruEmoji
              name="Crayon"
              :size-rem="2.55"
            />
          </button>
        </MaruTooltip>
        <MaruTooltip
          text="Erase"
          :placement="toolTooltipPlacement"
        >
          <button
            type="button"
            class="track-art-draw__tool"
            :class="{ 'track-art-draw__tool--selected': tool === 'erase' }"
            :aria-pressed="tool === 'erase'"
            aria-label="Erase"
            @click="setTool('erase')"
          >
            <MaruEmoji
              name="Eraser"
              :size-rem="2.55"
            />
          </button>
        </MaruTooltip>
        <MaruTooltip
          text="Clear"
          :placement="toolTooltipPlacement"
        >
          <button
            type="button"
            class="track-art-draw__tool"
            aria-label="Clear drawing"
            :disabled="!hasPaint || applying"
            @click="clearCanvas"
          >
            <MaruEmoji
              name="Broom"
              :size-rem="2.55"
            />
          </button>
        </MaruTooltip>
      </div>
    </div>
  </div>
</template>
