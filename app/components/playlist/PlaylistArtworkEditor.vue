<script setup lang="ts">
import MaruTooltip from '~/components/ui/MaruTooltip.vue'
import { loadCoverImage, renderPlaylistCoverPng } from './renderPlaylistCover'
import {
  appendArtworkHistory,
  artworkPreviewUrl,
  artworkSpecsEqual,
  artworkStyleLabel,
  artworkStylePreviewUrl,
  nextArtworkPoolExclusion,
  PLAYLIST_ARTWORK_BACKGROUNDS,
  PLAYLIST_ARTWORK_STYLES,
  randomArtworkSpec,
  type PlaylistArtworkBackground,
  type PlaylistArtworkHistoryItem,
  type PlaylistArtworkSpec,
  type PlaylistArtworkStyle,
} from '#shared/myo-editor/playlistArtwork'
import {
  clampCoverCrop,
  coverImageStyle,
  coverSourceRect,
  panFromSourceOrigin,
  PLAYLIST_COVER_ACCEPT,
  playlistCoverFileError,
  type CoverCrop,
} from '#shared/myo-editor/playlistCoverCrop'

const BACKGROUND_SWATCHES: Record<PlaylistArtworkBackground, { token: string; label: string }> = {
  '0068FF': { token: '--color-maru-blue', label: 'Blue' },
  'FFC800': { token: '--color-maru-yellow', label: 'Yellow' },
  'FF9400': { token: '--color-maru-orange', label: 'Orange' },
  '00BF3A': { token: '--color-maru-green-light', label: 'Green' },
  '05CF9C': { token: '--color-maru-turquoise-light', label: 'Turquoise' },
  'FA97FF': { token: '--color-maru-magenta-light', label: 'Magenta' },
  'FF8080': { token: '--color-maru-red-light', label: 'Red' },
}

const props = withDefaults(defineProps<{
  cardId: string | null
  coverUrl: string | null
  busy?: boolean
  disabled?: boolean
  hideCommit?: boolean
}>(), {
  busy: false,
  disabled: false,
  hideCommit: false,
})

const emit = defineEmits<{
  save: [spec: PlaylistArtworkSpec]
  saveUpload: [blob: Blob]
}>()

const { playEvent } = useUiSound()
const { showError } = useToast()

const items = ref<PlaylistArtworkHistoryItem[]>([])
const index = ref(-1)
const appliedSpec = ref<PlaylistArtworkSpec | null>(null)

const current = computed(() => items.value[index.value] ?? null)
const previewUrl = computed(() => current.value ? artworkPreviewUrl(current.value) : null)
const previewBackground = computed(() => {
  if (current.value?.kind !== 'generated') return undefined
  return `#${current.value.spec.backgroundColor}`
})
const loadedPreviewUrl = ref<string | null>(null)
const previewReady = computed(() => Boolean(previewUrl.value) && loadedPreviewUrl.value === previewUrl.value)
const previewPending = computed(() => Boolean(previewUrl.value) && !previewReady.value)
const canBack = computed(() => index.value > 0)
const canForward = computed(() => index.value >= 0 && index.value < items.value.length - 1)
const canSave = computed(() => {
  if (props.busy || props.disabled) return false
  const item = current.value
  if (!item) return false
  if (item.kind === 'uploaded') return true
  if (item.kind !== 'generated') return false
  if (!appliedSpec.value) return true
  return !artworkSpecsEqual(item.spec, appliedSpec.value)
})
const locked = computed(() => props.busy || props.disabled)

const excludedStyles = ref(new Set<PlaylistArtworkStyle>())
const excludedBackgrounds = ref(new Set<PlaylistArtworkBackground>())
const poolOpen = ref(false)

const enabledStyles = computed(() =>
  PLAYLIST_ARTWORK_STYLES.filter(style => !excludedStyles.value.has(style)),
)
const enabledBackgrounds = computed(() =>
  PLAYLIST_ARTWORK_BACKGROUNDS.filter(hex => !excludedBackgrounds.value.has(hex)),
)

const fileInputRef = ref<HTMLInputElement | null>(null)
const cropStageRef = ref<HTMLElement | null>(null)
const cropUrl = ref<string | null>(null)
const cropWidth = ref(0)
const cropHeight = ref(0)
const cropZoom = ref(1)
const cropPanX = ref(0)
const cropPanY = ref(0)
const cropBusy = ref(false)
const cropping = computed(() => Boolean(cropUrl.value))
const cropStyle = computed(() => {
  if (!cropUrl.value || cropWidth.value <= 0) return null
  return coverImageStyle(cropWidth.value, cropHeight.value, {
    zoom: cropZoom.value,
    panX: cropPanX.value,
    panY: cropPanY.value,
  })
})

const pointers = new Map<number, { x: number; y: number }>()
let pinchStartDist = 0
let pinchStartZoom = 1
let lastPan: { x: number; y: number } | null = null

function cropState(): CoverCrop {
  return clampCoverCrop({
    zoom: cropZoom.value,
    panX: cropPanX.value,
    panY: cropPanY.value,
  })
}

function applyCrop(next: CoverCrop) {
  const clamped = clampCoverCrop(next)
  cropZoom.value = clamped.zoom
  cropPanX.value = clamped.panX
  cropPanY.value = clamped.panY
}

function revokeDroppedUploads(nextItems: PlaylistArtworkHistoryItem[]) {
  const keep = new Set(
    nextItems.filter(item => item.kind === 'uploaded').map(item => item.url),
  )
  for (const item of items.value) {
    if (item.kind === 'uploaded' && !keep.has(item.url)) URL.revokeObjectURL(item.url)
  }
}

function commitHistory(next: { items: PlaylistArtworkHistoryItem[]; index: number }) {
  revokeDroppedUploads(next.items)
  items.value = next.items
  index.value = next.index
}

function endCrop() {
  if (cropUrl.value) URL.revokeObjectURL(cropUrl.value)
  cropUrl.value = null
  cropWidth.value = 0
  cropHeight.value = 0
  cropZoom.value = 1
  cropPanX.value = 0
  cropPanY.value = 0
  cropBusy.value = false
  pointers.clear()
  lastPan = null
}

function resetHistory() {
  appliedSpec.value = null
  revokeDroppedUploads([])
  items.value = []
  index.value = -1
  poolOpen.value = false
  excludedStyles.value = new Set()
  excludedBackgrounds.value = new Set()
  loadedPreviewUrl.value = null
  endCrop()
  seedExistingCover(props.coverUrl)
}

function seedExistingCover(coverUrl: string | null | undefined) {
  const url = coverUrl?.trim() || ''
  if (!url) {
    if (items.value.length === 0 || (items.value.length === 1 && items.value[0]?.kind === 'existing')) {
      items.value = []
      index.value = -1
    }
    return
  }

  const first = items.value[0]
  if (first?.kind === 'existing') {
    if (first.url !== url) {
      items.value = [{ kind: 'existing', url }, ...items.value.slice(1)]
    }
    if (index.value < 0) index.value = 0
    return
  }

  items.value = [{ kind: 'existing', url }, ...items.value]
  index.value = items.value.length === 1 ? 0 : index.value + 1
}

watch(() => props.cardId, resetHistory, { immediate: true })

watch(() => props.coverUrl, (url) => {
  seedExistingCover(url)
  const item = current.value
  if (item?.kind === 'generated' && url?.trim()) {
    appliedSpec.value = item.spec
  }
})

onUnmounted(() => {
  revokeDroppedUploads([])
  endCrop()
})

async function snapshotCrop(): Promise<{ url: string; blob: Blob } | null> {
  if (!cropUrl.value) return null
  const image = await loadCoverImage(cropUrl.value)
  const blob = await renderPlaylistCoverPng(
    image,
    image.naturalWidth,
    image.naturalHeight,
    cropState(),
  )
  return { url: URL.createObjectURL(blob), blob }
}

function writeUploadToHistory(snap: { url: string; blob: Blob }, replaceCurrent: boolean) {
  if (replaceCurrent && current.value?.kind === 'uploaded') {
    const copy = [...items.value]
    const prior = copy[index.value]
    if (prior?.kind === 'uploaded') URL.revokeObjectURL(prior.url)
    copy[index.value] = { kind: 'uploaded', url: snap.url, blob: snap.blob }
    items.value = copy
    loadedPreviewUrl.value = snap.url
    return
  }
  commitHistory(appendArtworkHistory(items.value, index.value, {
    kind: 'uploaded',
    url: snap.url,
    blob: snap.blob,
  }))
  loadedPreviewUrl.value = snap.url
}

async function settleCrop() {
  if (!cropUrl.value) return
  cropBusy.value = true
  try {
    const snap = await snapshotCrop()
    if (snap) writeUploadToHistory(snap, current.value?.kind === 'uploaded')
    endCrop()
  }
  catch (err: unknown) {
    playEvent('disabled')
    const message = err instanceof Error ? err.message : 'Could not crop that image.'
    showError(message)
    throw err
  }
  finally {
    cropBusy.value = false
  }
}

function onGenerate() {
  if (locked.value || cropBusy.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonClick')
  void (async () => {
    if (cropping.value) {
      try {
        await settleCrop()
      }
      catch {
        return
      }
    }
    const next = appendArtworkHistory(items.value, index.value, {
      kind: 'generated',
      spec: randomArtworkSpec(Math.random, {
        styles: enabledStyles.value,
        backgrounds: enabledBackgrounds.value,
      }),
    })
    commitHistory(next)
  })()
}

function onBack() {
  if (!canBack.value || locked.value || cropBusy.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonClick')
  void (async () => {
    if (cropping.value) {
      try {
        await settleCrop()
      }
      catch {
        return
      }
    }
    if (index.value > 0) index.value -= 1
  })()
}

function onForward() {
  if (!canForward.value || locked.value || cropBusy.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonClick')
  void (async () => {
    if (cropping.value) {
      try {
        await settleCrop()
      }
      catch {
        return
      }
    }
    if (index.value < items.value.length - 1) index.value += 1
  })()
}

function onSave() {
  void (async () => {
    if (cropping.value) {
      try {
        await settleCrop()
      }
      catch {
        return
      }
    }
    const item = current.value
    if (item?.kind === 'uploaded' && canSave.value) {
      playEvent('buttonClick')
      emit('saveUpload', item.blob)
      return
    }
    if (!item || item.kind !== 'generated' || !canSave.value) {
      playEvent('disabled')
      return
    }
    playEvent('buttonClick')
    emit('save', item.spec)
  })()
}

function onUpload() {
  if (locked.value || cropBusy.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonClick')
  fileInputRef.value?.click()
}

async function onFileChosen(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0]
  input.value = ''
  const error = playlistCoverFileError(file)
  if (!file || error) {
    playEvent('disabled')
    if (error) showError(error)
    return
  }

  const url = URL.createObjectURL(file)
  cropBusy.value = true
  try {
    const image = await loadCoverImage(url)
    const replaceOpenUpload = cropping.value && current.value?.kind === 'uploaded'
    if (cropUrl.value) URL.revokeObjectURL(cropUrl.value)
    cropUrl.value = url
    cropWidth.value = image.naturalWidth
    cropHeight.value = image.naturalHeight
    cropZoom.value = 1
    cropPanX.value = 0
    cropPanY.value = 0
    const snap = await snapshotCrop()
    if (snap) writeUploadToHistory(snap, replaceOpenUpload)
  }
  catch (err: unknown) {
    URL.revokeObjectURL(url)
    playEvent('disabled')
    const message = err instanceof Error ? err.message : 'Could not read that image.'
    showError(message)
  }
  finally {
    cropBusy.value = false
  }
}

function pointerDistance(): number {
  const pts = [...pointers.values()]
  if (pts.length < 2) return 0
  const a = pts[0]!
  const b = pts[1]!
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function onCropPointerDown(event: PointerEvent) {
  if (!cropping.value) return
  event.preventDefault()
  cropStageRef.value?.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 2) {
    pinchStartDist = pointerDistance()
    pinchStartZoom = cropZoom.value
    lastPan = null
    return
  }
  lastPan = { x: event.clientX, y: event.clientY }
}

function onCropPointerMove(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size >= 2 && pinchStartDist > 0) {
    const nextZoom = pinchStartZoom * (pointerDistance() / pinchStartDist)
    applyCrop({ ...cropState(), zoom: nextZoom })
    return
  }
  if (!lastPan || !cropStageRef.value) return
  const bounds = cropStageRef.value.getBoundingClientRect()
  if (!(bounds.width > 0) || !(bounds.height > 0)) return
  const dx = (event.clientX - lastPan.x) / bounds.width
  const dy = (event.clientY - lastPan.y) / bounds.height
  lastPan = { x: event.clientX, y: event.clientY }
  const rect = coverSourceRect(cropWidth.value, cropHeight.value, cropState())
  applyCrop(panFromSourceOrigin(
    cropWidth.value,
    cropHeight.value,
    cropZoom.value,
    rect.x - dx * rect.width,
    rect.y - dy * rect.height,
  ))
}

function onCropPointerUp(event: PointerEvent) {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinchStartDist = 0
  if (pointers.size === 1) {
    const remaining = [...pointers.values()][0]
    lastPan = remaining ? { ...remaining } : null
    return
  }
  lastPan = null
}

function onCropWheel(event: WheelEvent) {
  if (!cropping.value) return
  event.preventDefault()
  const nextZoom = cropZoom.value * Math.exp(-event.deltaY * 0.0015)
  applyCrop({ ...cropState(), zoom: nextZoom })
}

function onPreviewLoad(event: Event) {
  const img = event.target
  if (!(img instanceof HTMLImageElement)) return
  const src = img.getAttribute('src')
  if (src && src === previewUrl.value) loadedPreviewUrl.value = src
}

function onPreviewImgRef(el: Element | null) {
  if (!(el instanceof HTMLImageElement)) return
  if (el.complete && el.naturalWidth > 0) onPreviewLoad({ target: el } as Event)
}

function openPool() {
  if (locked.value || poolOpen.value || cropping.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonClick')
  poolOpen.value = true
}

function toggleStyle(style: PlaylistArtworkStyle) {
  if (locked.value) {
    playEvent('disabled')
    return
  }
  const next = nextArtworkPoolExclusion(PLAYLIST_ARTWORK_STYLES, excludedStyles.value, style)
  if (!next) {
    playEvent('disabled')
    return
  }
  playEvent('buttonClick')
  excludedStyles.value = next
}

function toggleBackground(hex: PlaylistArtworkBackground) {
  if (locked.value) {
    playEvent('disabled')
    return
  }
  const next = nextArtworkPoolExclusion(PLAYLIST_ARTWORK_BACKGROUNDS, excludedBackgrounds.value, hex)
  if (!next) {
    playEvent('disabled')
    return
  }
  playEvent('buttonClick')
  excludedBackgrounds.value = next
}

const saveLabel = computed(() => {
  if (props.busy) return 'Saving…'
  if (cropBusy.value) return 'Cropping…'
  return 'Save'
})

const commitDisabled = computed(() => cropBusy.value || (cropping.value ? locked.value : !canSave.value))
const uploadDisabled = computed(() => locked.value || cropBusy.value)

defineExpose({
  commit: onSave,
  upload: onUpload,
  saveLabel,
  commitDisabled,
  uploadDisabled,
})
</script>

<template>
  <div class="playlist-artwork-editor">
    <div
      class="playlist-artwork-editor__card border-maru rounded-maru"
      :class="{
        'playlist-artwork-editor__card--pending': previewPending && !cropping,
        'playlist-artwork-editor__card--crop': cropping,
      }"
      :aria-busy="previewPending || cropBusy || undefined"
    >
      <div
        v-if="previewPending && !cropping"
        class="playlist-artwork-editor__skeleton"
        aria-hidden="true"
      />
      <div
        v-if="cropping && cropUrl && cropStyle"
        ref="cropStageRef"
        class="playlist-artwork-editor__crop"
        @pointerdown="onCropPointerDown"
        @pointermove="onCropPointerMove"
        @pointerup="onCropPointerUp"
        @pointercancel="onCropPointerUp"
        @wheel.prevent="onCropWheel"
      >
        <img
          :src="cropUrl"
          alt=""
          class="playlist-artwork-editor__crop-img"
          draggable="false"
          :style="cropStyle"
        >
      </div>
      <div
        v-else-if="previewUrl"
        class="playlist-artwork-editor__face"
        :class="{ 'playlist-artwork-editor__face--ready': previewReady }"
        :style="previewBackground ? { backgroundColor: previewBackground } : undefined"
      >
        <img
          :key="previewUrl"
          :src="previewUrl"
          alt=""
          class="playlist-artwork-editor__img"
          :class="{ 'playlist-artwork-editor__img--cover': current?.kind !== 'generated' }"
          :ref="onPreviewImgRef"
          @load="onPreviewLoad"
        >
      </div>
      <p
        v-else
        class="playlist-artwork-editor__empty type-caption text-maru-gray"
      >
        Generate or upload artwork
      </p>
    </div>
    <p
      v-if="cropping"
      class="playlist-artwork-editor__crop-hint type-caption"
    >
      Drag to reposition
      <span class="playlist-artwork-editor__crop-hint-extra"> · scroll to zoom</span>
      <span class="playlist-artwork-editor__crop-hint-pinch"> · pinch to zoom</span>
    </p>

    <div class="playlist-artwork-editor__nav">
      <button
        type="button"
        class="playlist-artwork-editor__arrow playlist-artwork-editor__arrow--back"
        aria-label="Previous artwork"
        :disabled="locked || cropBusy || !canBack"
        @click="onBack"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <button
        type="button"
        class="maru-button maru-button--sm playlist-artwork-editor__generate bg-maru-magenta-light"
        :disabled="locked || cropBusy"
        @click="onGenerate"
      >
        <span class="maru-button__label">Generate</span>
      </button>
      <button
        type="button"
        class="playlist-artwork-editor__arrow playlist-artwork-editor__arrow--fwd"
        aria-label="Next artwork"
        :disabled="locked || cropBusy || !canForward"
        @click="onForward"
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>

    <input
      ref="fileInputRef"
      class="playlist-artwork-editor__file"
      type="file"
      :accept="PLAYLIST_COVER_ACCEPT"
      tabindex="-1"
      aria-hidden="true"
      @change="onFileChosen"
    >
    <div
      v-if="!hideCommit"
      class="playlist-artwork-editor__actions"
    >
      <button
        type="button"
        class="maru-button maru-button--sm playlist-artwork-editor__upload bg-maru-white"
        :disabled="uploadDisabled"
        @click="onUpload"
      >
        <span class="maru-button__label">Upload</span>
      </button>
      <button
        type="button"
        class="maru-button maru-button--sm playlist-artwork-editor__save bg-maru-green-light"
        :disabled="commitDisabled"
        @click="onSave"
      >
        <span class="maru-button__label">{{ saveLabel }}</span>
      </button>
    </div>

    <button
      v-if="!poolOpen && !cropping"
      type="button"
      class="playlist-artwork-editor__customize type-button-secondary font-maru-bold"
      :disabled="locked"
      @click="openPool"
    >
      Customize
    </button>
    <Transition name="playlist-artwork-pool">
      <div
        v-if="poolOpen && !cropping"
        class="playlist-artwork-editor__pool-reveal"
      >
        <div
          class="playlist-artwork-editor__pool"
          :class="{ 'playlist-artwork-editor__pool--locked': locked }"
        >
          <div class="playlist-artwork-editor__cloud" role="group" aria-label="Artwork styles">
            <MaruTooltip
              v-for="style in PLAYLIST_ARTWORK_STYLES"
              :key="style"
              :text="artworkStyleLabel(style)"
            >
              <button
                type="button"
                class="playlist-artwork-editor__tag type-caption"
                :class="{ 'playlist-artwork-editor__tag--off': excludedStyles.has(style) }"
                :aria-pressed="!excludedStyles.has(style)"
                :disabled="locked"
                @click="toggleStyle(style)"
              >
                <span class="playlist-artwork-editor__tag-label">{{ artworkStyleLabel(style) }}</span>
              </button>
              <template #content>
                <div class="playlist-artwork-editor__peek">
                  <img
                    :src="artworkStylePreviewUrl(style)"
                    :alt="`${artworkStyleLabel(style)} style preview`"
                    width="108"
                    height="108"
                  >
                </div>
              </template>
            </MaruTooltip>
          </div>
          <div class="playlist-artwork-editor__cloud playlist-artwork-editor__cloud--swatches" role="group" aria-label="Artwork backgrounds">
            <button
              v-for="hex in PLAYLIST_ARTWORK_BACKGROUNDS"
              :key="hex"
              type="button"
              class="playlist-artwork-editor__swatch"
              :class="{ 'playlist-artwork-editor__swatch--off': excludedBackgrounds.has(hex) }"
              :style="{ backgroundColor: `var(${BACKGROUND_SWATCHES[hex].token})` }"
              :aria-label="`${BACKGROUND_SWATCHES[hex].label} background`"
              :aria-pressed="!excludedBackgrounds.has(hex)"
              :disabled="locked"
              @click="toggleBackground(hex)"
            />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
