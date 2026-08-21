import { computed, readonly, ref } from 'vue'

const STORAGE_KEY = 'yoto-cards:user-preferences'

type StoredPrefs = {
  showDebugPanel?: boolean
  /** Empty array = user cleared (use app defaults). Absent = never customized. */
  searchPlaceholders?: string[]
  /** Pixel editor paint/erase ticks. Absent = on. */
  drawEditorSounds?: boolean
  /** Icons tab grid size in the track art editor. Absent = 32. */
  trackArtIconSize?: 32 | 64
}

const showDebugPanelStored = ref<boolean | null>(null)
/** null = never customized; [] = cleared to defaults; non-empty = custom list */
const searchPlaceholdersStored = ref<string[] | null>(null)
const drawEditorSoundsStored = ref<boolean | null>(null)
const trackArtIconSizeStored = ref<32 | 64 | null>(null)

let initialized = false

function readStored(): StoredPrefs {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as StoredPrefs
    return parsed && typeof parsed === 'object' ? parsed : {}
  }
  catch {
    return {}
  }
}

function persist() {
  if (typeof localStorage === 'undefined') return
  const toSave: StoredPrefs = {}
  if (showDebugPanelStored.value !== null) {
    toSave.showDebugPanel = showDebugPanelStored.value
  }
  if (searchPlaceholdersStored.value !== null) {
    toSave.searchPlaceholders = searchPlaceholdersStored.value
  }
  if (drawEditorSoundsStored.value !== null) {
    toSave.drawEditorSounds = drawEditorSoundsStored.value
  }
  if (trackArtIconSizeStored.value !== null) {
    toSave.trackArtIconSize = trackArtIconSizeStored.value
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
}

function ensureInitialized() {
  if (initialized || import.meta.server) return
  initialized = true
  const stored = readStored()
  if (typeof stored.showDebugPanel === 'boolean') {
    showDebugPanelStored.value = stored.showDebugPanel
  }
  if (Array.isArray(stored.searchPlaceholders)) {
    searchPlaceholdersStored.value = stored.searchPlaceholders
  }
  if (typeof stored.drawEditorSounds === 'boolean') {
    drawEditorSoundsStored.value = stored.drawEditorSounds
  }
  if (stored.trackArtIconSize === 32 || stored.trackArtIconSize === 64) {
    trackArtIconSizeStored.value = stored.trackArtIconSize
  }
}

export function parsePlaceholdersText(text: string): string[] {
  return text
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
}

export function formatPlaceholdersText(list: string[] | null | undefined): string {
  if (!list?.length) return ''
  return list.join(', ')
}

export function useUserPreferences() {
  ensureInitialized()

  const showDebugPanel = computed(() => {
    if (showDebugPanelStored.value !== null) return showDebugPanelStored.value
    return false
  })

  /** Custom list when non-empty; null means fall back to app defaults. */
  const searchPlaceholders = computed(() => {
    const list = searchPlaceholdersStored.value
    if (list && list.length > 0) return list
    return null
  })

  const searchPlaceholdersText = computed(() =>
    formatPlaceholdersText(searchPlaceholdersStored.value),
  )

  function setShowDebugPanel(value: boolean) {
    showDebugPanelStored.value = value
    persist()
  }

  function setSearchPlaceholdersFromText(text: string) {
    searchPlaceholdersStored.value = parsePlaceholdersText(text)
    persist()
  }

  const drawEditorSounds = computed(() => {
    if (drawEditorSoundsStored.value !== null) return drawEditorSoundsStored.value
    return true
  })

  function setDrawEditorSounds(value: boolean) {
    drawEditorSoundsStored.value = value
    persist()
  }

  const trackArtIconSize = computed(() => {
    if (trackArtIconSizeStored.value === 64) return 64 as const
    return 32 as const
  })

  function setTrackArtIconSize(value: 32 | 64) {
    trackArtIconSizeStored.value = value
    persist()
  }

  return {
    showDebugPanel,
    searchPlaceholders: readonly(searchPlaceholders),
    searchPlaceholdersText,
    setShowDebugPanel,
    setSearchPlaceholdersFromText,
    drawEditorSounds: readonly(drawEditorSounds),
    setDrawEditorSounds,
    trackArtIconSize: readonly(trackArtIconSize),
    setTrackArtIconSize,
  }
}
