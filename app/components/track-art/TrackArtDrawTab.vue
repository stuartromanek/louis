<script setup lang="ts">
import MaruTooltip from '~/components/ui/MaruTooltip.vue'
import { TRACK_ART_PALETTE } from './types'
import { toIcon16x16, uploadTrackArtPng } from './upload'

const GRID = 16
const { playEvent } = useUiSound()
const { drawEditorSounds, setDrawEditorSounds } = useUserPreferences()
/** Palette is a 4-wide row-major grid; the custom-color picker is the first cell. */
const PALETTE_COLS = 4
const PICKER_SLOT = 1

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
const palette = ref<string[]>([...TRACK_ART_PALETTE])
const color = ref<string>(TRACK_ART_PALETTE[9] ?? '#0068FF')
const painting = ref(false)
const applying = ref(false)
const errorMessage = ref('')
const canvasRef = ref<HTMLCanvasElement | null>(null)
const drawRootRef = ref<HTMLElement | null>(null)
const colorInputRef = ref<HTMLInputElement | null>(null)
let previewRaf: number | null = null
/** Last URL successfully applied to the grid — skip reseed while unchanged. */
const lastSeededUrl = ref<string | null>(null)
let seedGeneration = 0

const MAX_HISTORY = 40
const past = ref<(string | null)[][]>([])
const future = ref<(string | null)[][]>([])

const hasPaint = computed(() => pixels.value.some(Boolean))
const paletteFocusIndex = ref(
  Math.max(PICKER_SLOT, TRACK_ART_PALETTE.findIndex(c => c === (TRACK_ART_PALETTE[9] ?? '#0068FF')) + PICKER_SLOT),
)
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

function syncLayout() {
  const canvas = canvasRef.value
  if (canvas) {
    canvas.style.width = ''
    canvas.style.height = ''
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
  if (drawEditorSounds.value) {
    playEvent(tool.value === 'erase' ? 'pixelErase' : 'pixelPaint')
  }
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

function playToolClick() {
  if (drawEditorSounds.value) playEvent('buttonClick')
}

function playSwatchClick() {
  if (drawEditorSounds.value) playEvent('select')
}

function setTool(next: Tool) {
  tool.value = next
  playToolClick()
}

function setColor(next: string) {
  color.value = normalizeHex(next)
  tool.value = 'draw'
  const idx = palette.value.findIndex(swatch => normalizeHex(swatch) === color.value)
  if (idx >= 0) paletteFocusIndex.value = idx + PICKER_SLOT
  playSwatchClick()
}

function paletteItemCount() {
  return palette.value.length + PICKER_SLOT
}

function pickerTabIndex() {
  return paletteFocusIndex.value === 0 ? 0 : -1
}

function paletteOptionTabIndex(index: number) {
  return index + PICKER_SLOT === paletteFocusIndex.value ? 0 : -1
}

function focusPaletteOption(index: number) {
  const next = Math.max(0, Math.min(paletteItemCount() - 1, index))
  paletteFocusIndex.value = next
  nextTick(() => {
    const el = paletteListRef.value?.querySelectorAll<HTMLElement>('[role="option"]')[next]
    el?.focus()
  })
}

function onPaletteKeydown(event: KeyboardEvent) {
  const colors = palette.value
  const count = paletteItemCount()
  if (!count) return
  const across = PALETTE_COLS
  const idx = paletteFocusIndex.value

  let next = idx
  if (event.key === 'ArrowRight') next = Math.min(count - 1, idx + 1)
  else if (event.key === 'ArrowLeft') next = Math.max(0, idx - 1)
  else if (event.key === 'ArrowDown') next = Math.min(count - 1, idx + across)
  else if (event.key === 'ArrowUp') next = Math.max(0, idx - across)
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (idx === 0) openColorPicker()
    else {
      const swatch = colors[idx - PICKER_SLOT]
      if (swatch) setColor(swatch)
    }
    return
  }
  else return

  event.preventDefault()
  if (next === 0) {
    focusPaletteOption(0)
    return
  }
  const swatch = colors[next - PICKER_SLOT]
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
  playSwatchClick()
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
  if (drawEditorSounds.value) playEvent('pixelClear')
}

function toggleDrawSounds() {
  const next = !drawEditorSounds.value
  setDrawEditorSounds(next)
  playEvent(next ? 'toggleOn' : 'toggleOff')
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
      nextTick(() => syncLayout())
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
  syncLayout()
  if (typeof ResizeObserver !== 'undefined') {
    layoutResizeObserver = new ResizeObserver(() => syncLayout())
    if (drawRootRef.value) layoutResizeObserver.observe(drawRootRef.value)
    if (canvasRef.value) layoutResizeObserver.observe(canvasRef.value)
  }
  window.addEventListener('resize', syncLayout)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onEditorKeyDown)
  window.removeEventListener('resize', syncLayout)
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
  <div
    ref="drawRootRef"
    class="track-art-draw"
  >
    <div
      class="track-art-draw__tools"
      role="toolbar"
      aria-label="Drawing tools"
    >
      <MaruTooltip
        text="Draw"
        placement="right"
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
        placement="right"
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
        placement="right"
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
      <MaruTooltip
        :text="drawEditorSounds ? 'Sound' : 'Muted'"
        placement="right"
      >
        <button
          type="button"
          class="track-art-draw__tool"
          :class="drawEditorSounds ? 'track-art-draw__tool--sound-on' : 'track-art-draw__tool--sound-off'"
          :aria-pressed="drawEditorSounds"
          :aria-label="drawEditorSounds ? 'Mute drawing sounds' : 'Unmute drawing sounds'"
          @click="toggleDrawSounds"
        >
          <MaruEmoji
            :name="drawEditorSounds ? 'SpeakerHighVolume' : 'MutedSpeaker'"
            :size-rem="2.55"
          />
        </button>
      </MaruTooltip>
    </div>

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

    <div class="track-art-draw__rail">
      <div class="track-art-draw__palette-col">
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
          aria-orientation="horizontal"
          @keydown="onPaletteKeydown"
        >
          <button
            type="button"
            class="track-art-draw__swatch track-art-draw__swatch--picker"
            aria-label="Pick a custom color"
            title="Pick a custom color"
            role="option"
            :aria-selected="false"
            :tabindex="pickerTabIndex()"
            @click="openColorPicker"
            @focus="paletteFocusIndex = 0"
          >
            <span
              class="track-art-draw__picker-grid"
              aria-hidden="true"
            >
              <span class="track-art-draw__picker-cell track-art-draw__picker-cell--yellow" />
              <span class="track-art-draw__picker-cell track-art-draw__picker-cell--orange" />
              <span class="track-art-draw__picker-cell track-art-draw__picker-cell--red" />
              <span class="track-art-draw__picker-cell track-art-draw__picker-cell--magenta" />
              <span class="track-art-draw__picker-cell track-art-draw__picker-cell--turquoise" />
              <span class="track-art-draw__picker-cell track-art-draw__picker-cell--green" />
              <span class="track-art-draw__picker-cell track-art-draw__picker-cell--blue" />
              <span class="track-art-draw__picker-cell track-art-draw__picker-cell--brown" />
            </span>
          </button>
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
            @focus="paletteFocusIndex = index + PICKER_SLOT"
          >
            <span
              class="track-art-draw__swatch-fill"
              :style="{ backgroundColor: swatch }"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
