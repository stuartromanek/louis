<script setup lang="ts">
import type { TrackArtIconItem } from './types'
import { toIcon16x16, uploadTrackArtFromUrl, uploadTrackArtPng, trackArtFetchError } from './upload'
import { validateYotoIconFile, YOTO_ICON_ACCEPT } from './validateIconUpload'

defineProps<{
  initialPreviewUrl?: string | null
}>()

const emit = defineEmits<{
  select: [payload: { icon16x16: string; previewUrl: string }]
  preview: [url: string | null]
}>()

const { showError } = useToast()

const search = ref('')
const publicIcons = ref<TrackArtIconItem[]>([])
const communityIcons = ref<TrackArtIconItem[]>([])
const loadingPublic = ref(false)
const loadingCommunity = ref(false)
const selected = ref<TrackArtIconItem | null>(null)
const uploadedIcon = ref<TrackArtIconItem | null>(null)
const uploading = ref(false)
const hintMessage = ref('')
const applying = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const localPreviewUrl = ref<string | null>(null)
const gridRef = ref<HTMLElement | null>(null)
/** Roving focus index into visibleIcons (independent of selection until activated). */
const activeOptionIndex = ref(0)
const columnCount = ref(1)

const ICON_SIZES = [32, 64] as const
type IconSize = (typeof ICON_SIZES)[number]
/** Index into ICON_SIZES — desktop default 32; phone forced to 64. */
const iconSizeIndex = ref(0)

const iconSize = computed<IconSize>(() => ICON_SIZES[iconSizeIndex.value] ?? 32)

const gridStyle = computed(() => ({
  '--track-art-icon-size': `${iconSize.value}px`,
}))

const uploadPreviewSrc = computed(() => uploadedIcon.value?.url ?? localPreviewUrl.value)

const uploadIsSelected = computed(() => {
  if (!uploadedIcon.value || !selected.value) return false
  return selected.value.id === uploadedIcon.value.id
    && selected.value.source === uploadedIcon.value.source
})

const uploadAriaLabel = computed(() => {
  if (uploading.value) return 'Uploading icon'
  if (!uploadedIcon.value) return 'Upload custom icon'
  return uploadIsSelected.value ? 'Replace uploaded icon' : 'Select uploaded icon'
})

function syncPhoneIconSize() {
  if (!import.meta.client) return
  if (window.matchMedia('(max-width: 599px)').matches) {
    iconSizeIndex.value = ICON_SIZES.indexOf(64)
  }
}

function onIconSizeInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) return
  iconSizeIndex.value = Math.min(ICON_SIZES.length - 1, Math.max(0, Math.round(value)))
}

let communityTimer: ReturnType<typeof setTimeout> | null = null
let gridResizeObserver: ResizeObserver | null = null

const filteredPublic = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return publicIcons.value
  return publicIcons.value.filter((icon) => {
    const hay = [icon.title, ...icon.tags].join(' ').toLowerCase()
    return hay.includes(q)
  })
})

const visibleIcons = computed(() => {
  const q = search.value.trim()
  if (!q) return filteredPublic.value
  const byKey = new Map<string, TrackArtIconItem>()
  for (const icon of filteredPublic.value) byKey.set(`yoto:${icon.id}`, icon)
  for (const icon of communityIcons.value) byKey.set(`yi:${icon.id}`, icon)
  return [...byKey.values()]
})

const emptyStatus = computed(() => {
  if (loadingPublic.value) return 'Loading Yoto icons…'
  if (loadingCommunity.value) return 'Searching yotoicons.com…'
  if (search.value.trim()) return 'No icons match that search.'
  return 'No icons loaded.'
})

const liveStatus = computed(() => {
  if (loadingPublic.value || loadingCommunity.value) return emptyStatus.value
  if (!visibleIcons.value.length) return emptyStatus.value
  const n = visibleIcons.value.length
  return `${n} icon${n === 1 ? '' : 's'}`
})

function iconKey(icon: TrackArtIconItem) {
  return `${icon.source}-${icon.id}`
}

function isSelected(icon: TrackArtIconItem) {
  return selected.value?.id === icon.id && selected.value?.source === icon.source
}

function optionTabIndex(index: number) {
  const selIdx = visibleIcons.value.findIndex(isSelected)
  const focusIdx = selIdx >= 0 ? selIdx : activeOptionIndex.value
  return index === focusIdx ? 0 : -1
}

function updateColumnCount() {
  const el = gridRef.value
  if (!el) {
    columnCount.value = 1
    return
  }
  const options = [...el.querySelectorAll<HTMLElement>('[role="option"]')]
  if (!options.length) {
    columnCount.value = 1
    return
  }
  const firstTop = options[0]!.offsetTop
  let cols = 0
  for (const opt of options) {
    if (opt.offsetTop !== firstTop) break
    cols++
  }
  columnCount.value = Math.max(1, cols)
}

function focusOption(index: number) {
  const icons = visibleIcons.value
  if (!icons.length) return
  const next = Math.max(0, Math.min(icons.length - 1, index))
  activeOptionIndex.value = next
  nextTick(() => {
    const el = gridRef.value?.querySelectorAll<HTMLElement>('[role="option"]')[next]
    el?.focus()
  })
}

function onGridKeydown(event: KeyboardEvent) {
  const icons = visibleIcons.value
  if (!icons.length) return
  const cols = columnCount.value
  let idx = activeOptionIndex.value
  const selIdx = icons.findIndex(isSelected)
  if (selIdx >= 0) idx = selIdx

  let next = idx
  if (event.key === 'ArrowRight') next = Math.min(icons.length - 1, idx + 1)
  else if (event.key === 'ArrowLeft') next = Math.max(0, idx - 1)
  else if (event.key === 'ArrowDown') next = Math.min(icons.length - 1, idx + cols)
  else if (event.key === 'ArrowUp') next = Math.max(0, idx - cols)
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = icons.length - 1
  else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const icon = icons[idx]
    if (icon) pickIcon(icon)
    return
  }
  else return

  event.preventDefault()
  const icon = icons[next]
  if (!icon) return
  pickIcon(icon)
  focusOption(next)
}

async function loadPublic() {
  loadingPublic.value = true
  try {
    const data = await $fetch<{
      icons: Array<{
        mediaId: string
        title: string
        tags: string[]
        url: string
        source: 'yoto'
      }>
    }>('/api/yoto/icons/public')
    publicIcons.value = (data.icons ?? []).map(icon => ({
      id: icon.mediaId,
      mediaId: icon.mediaId,
      title: icon.title || 'Yoto icon',
      tags: icon.tags ?? [],
      url: icon.url,
      source: 'yoto' as const,
    }))
  }
  catch (err: unknown) {
    showError(trackArtFetchError(err, 'Could not load Yoto icons'))
  }
  finally {
    loadingPublic.value = false
  }
}

async function searchCommunity(q: string) {
  if (!q.trim()) {
    communityIcons.value = []
    return
  }
  loadingCommunity.value = true
  try {
    const data = await $fetch<{
      icons: Array<{
        id: string
        title: string
        tags: string[]
        author: string
        imageUrl: string
        source: 'yotoicons'
      }>
    }>('/api/yotoicons/search', { query: { q: q.trim() } })
    communityIcons.value = (data.icons ?? []).map(icon => ({
      id: icon.id,
      title: icon.title,
      tags: icon.tags,
      author: icon.author,
      url: icon.imageUrl,
      source: 'yotoicons' as const,
    }))
  }
  catch (err: unknown) {
    communityIcons.value = []
    showError(trackArtFetchError(err, 'Could not search yotoicons.com'))
  }
  finally {
    loadingCommunity.value = false
  }
}

function scheduleCommunitySearch(q: string) {
  if (communityTimer) clearTimeout(communityTimer)
  communityTimer = setTimeout(() => {
    void searchCommunity(q)
  }, 280)
}

function onSearchInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  search.value = value
  scheduleCommunitySearch(value)
}

function pickIcon(icon: TrackArtIconItem) {
  selected.value = icon
  const idx = visibleIcons.value.findIndex(i => iconKey(i) === iconKey(icon))
  if (idx >= 0) activeOptionIndex.value = idx
  hintMessage.value = ''
  emit('preview', icon.url)
}

function openFilePicker() {
  if (uploading.value || applying.value) return
  fileInputRef.value?.click()
}

function selectUploaded() {
  if (!uploadedIcon.value) {
    openFilePicker()
    return
  }
  if (uploadIsSelected.value) {
    openFilePicker()
    return
  }
  pickIcon(uploadedIcon.value)
}

function revokeLocalPreview() {
  if (localPreviewUrl.value) {
    URL.revokeObjectURL(localPreviewUrl.value)
    localPreviewUrl.value = null
  }
}

async function onFileChosen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  hintMessage.value = ''

  const validation = await validateYotoIconFile(file)
  if (!validation.ok) {
    showError(validation.error ?? 'Invalid icon file')
    return
  }
  if (validation.warnings.length) {
    hintMessage.value = validation.warnings[0] ?? ''
  }

  uploading.value = true
  revokeLocalPreview()
  localPreviewUrl.value = URL.createObjectURL(file)
  emit('preview', localPreviewUrl.value)

  try {
    const uploaded = await uploadTrackArtPng(file, file.name || 'custom-icon.png', {
      autoConvert: true,
    })
    const previewUrl = uploaded.url || localPreviewUrl.value!
    const item: TrackArtIconItem = {
      id: uploaded.mediaId,
      mediaId: uploaded.mediaId,
      title: 'Uploaded icon',
      tags: ['upload'],
      url: previewUrl,
      source: 'yoto',
    }
    uploadedIcon.value = item
    pickIcon(item)
    if (uploaded.url) {
      revokeLocalPreview()
    }
  }
  catch (err: unknown) {
    revokeLocalPreview()
    emit('preview', selected.value?.url ?? null)
    showError(trackArtFetchError(err, 'Could not upload icon'))
  }
  finally {
    uploading.value = false
  }
}

async function applySelected() {
  if (applying.value) return
  if (!selected.value) return
  applying.value = true
  try {
    if (selected.value.source === 'yoto' && selected.value.mediaId) {
      emit('select', {
        icon16x16: toIcon16x16(selected.value.mediaId),
        previewUrl: selected.value.url,
      })
      return
    }

    const uploaded = await uploadTrackArtFromUrl(selected.value.url, `yotoicons-${selected.value.id}.png`)
    emit('select', {
      icon16x16: toIcon16x16(uploaded.mediaId),
      previewUrl: uploaded.url || selected.value.url,
    })
  }
  catch (err: unknown) {
    showError(trackArtFetchError(err, 'Could not apply icon'))
  }
  finally {
    applying.value = false
  }
}

watch(visibleIcons, (icons) => {
  if (!icons.length) {
    activeOptionIndex.value = 0
    return
  }
  const selIdx = icons.findIndex(isSelected)
  if (selIdx >= 0) activeOptionIndex.value = selIdx
  else if (activeOptionIndex.value >= icons.length) {
    activeOptionIndex.value = 0
  }
  nextTick(() => updateColumnCount())
})

onMounted(() => {
  syncPhoneIconSize()
  window.addEventListener('resize', syncPhoneIconSize)
  void loadPublic()
  nextTick(() => {
    if (gridRef.value && typeof ResizeObserver !== 'undefined') {
      gridResizeObserver = new ResizeObserver(() => updateColumnCount())
      gridResizeObserver.observe(gridRef.value)
    }
    updateColumnCount()
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', syncPhoneIconSize)
  if (communityTimer) clearTimeout(communityTimer)
  gridResizeObserver?.disconnect()
  revokeLocalPreview()
})

defineExpose({
  applySelected,
  applying,
  hasSelection: computed(() => Boolean(selected.value)),
})
</script>

<template>
  <div class="track-art-icons">
    <div class="track-art-icons__toolbar">
      <label class="track-art-icons__search">
        <span class="track-art-icons__search-label">Search icons</span>
        <input
          type="search"
          class="track-art-icons__search-input type-body font-maru"
          placeholder="Search Yoto and yotoicons.com…"
          :value="search"
          autocomplete="off"
          @input="onSearchInput"
        >
      </label>

      <div class="track-art-icons__upload-wrap">
        <input
          ref="fileInputRef"
          class="track-art-icons__file-input"
          type="file"
          :accept="YOTO_ICON_ACCEPT"
          tabindex="-1"
          aria-hidden="true"
          @change="onFileChosen"
        >
        <button
          type="button"
          class="track-art-icons__upload"
          :class="{
            'track-art-icons__upload--selected': uploadIsSelected || uploading,
            'track-art-icons__upload--busy': uploading,
          }"
          :disabled="uploading || applying"
          :aria-pressed="uploadIsSelected"
          :aria-busy="uploading || undefined"
          :aria-label="uploadAriaLabel"
          @click="selectUploaded"
        >
          <img
            v-if="uploadPreviewSrc"
            :src="uploadPreviewSrc"
            alt=""
            class="track-art-icons__upload-preview"
            draggable="false"
          >
          <span class="track-art-icons__upload-label type-caption font-maru-bold">
            {{ uploading ? 'Uploading…' : uploadedIcon ? 'Uploaded' : 'Upload icon' }}
          </span>
        </button>
      </div>

      <div class="track-art-icons__size">
        <label
          class="track-art-icons__size-label type-label font-maru-bold"
          for="track-art-icon-size"
        >Size</label>
        <div class="track-art-icons__size-slider">
          <div
            class="track-art-icons__size-track"
            aria-hidden="true"
          />
          <input
            id="track-art-icon-size"
            class="track-art-icons__size-range"
            type="range"
            min="0"
            :max="ICON_SIZES.length - 1"
            step="1"
            :value="iconSizeIndex"
            :aria-valuetext="`${iconSize} by ${iconSize}`"
            @input="onIconSizeInput"
          >
        </div>
        <div
          class="track-art-icons__size-stops"
          aria-hidden="true"
        >
          <span
            v-for="size in ICON_SIZES"
            :key="size"
            class="track-art-icons__size-stop type-caption font-maru-mono font-maru-bold tabular-nums"
            :class="{ 'track-art-icons__size-stop--active': size === iconSize }"
          >{{ size }}</span>
        </div>
      </div>
    </div>

    <p
      v-if="hintMessage"
      class="track-art-icons__hint type-caption text-maru-gray m-0"
    >
      {{ hintMessage }}
    </p>

    <p
      class="track-art-modal__sr-only"
      aria-live="polite"
    >
      {{ liveStatus }}
    </p>

    <div
      class="track-art-icons__grid-wrap"
      :aria-busy="loadingPublic || loadingCommunity || uploading"
    >
      <p
        v-if="!visibleIcons.length"
        class="track-art-icons__status track-art-icons__status--empty type-empty-body text-maru-gray"
        aria-live="polite"
      >
        {{ emptyStatus }}
      </p>
      <div
        v-else
        ref="gridRef"
        class="track-art-icons__grid"
        role="listbox"
        aria-label="Icons"
        :style="gridStyle"
        @keydown="onGridKeydown"
      >
        <button
          v-for="(icon, index) in visibleIcons"
          :key="iconKey(icon)"
          type="button"
          role="option"
          class="track-art-icons__cell"
          :class="{ 'track-art-icons__cell--selected': isSelected(icon) }"
          :title="icon.title"
          :aria-label="icon.title"
          :aria-selected="isSelected(icon)"
          :tabindex="optionTabIndex(index)"
          @click="pickIcon(icon)"
          @focus="activeOptionIndex = index"
        >
          <img
            :src="icon.url"
            alt=""
            class="track-art-icons__cell-img"
            loading="lazy"
            draggable="false"
          >
        </button>
      </div>
      <p
        v-if="!search.trim() && visibleIcons.length"
        class="track-art-icons__search-hint type-caption text-maru-gray m-0"
      >
        Search above to find more on yotoicons.com
      </p>
      <p
        v-else-if="loadingCommunity && visibleIcons.length"
        class="track-art-icons__status type-caption text-maru-gray"
        aria-live="polite"
      >
        Searching yotoicons.com…
      </p>
    </div>
  </div>
</template>
