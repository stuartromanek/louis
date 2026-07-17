import { computed, readonly, ref } from 'vue'

const STORAGE_KEY = 'yoto-cards:user-preferences'
const SESSION_STORAGE_KEY = 'yoto-cards:session-preferences'

type StoredPrefs = {
  showDebugPanel?: boolean
  /** Empty array = user cleared (use app defaults). Absent = never customized. */
  searchPlaceholders?: string[]
}

type SessionPrefs = {
  /** Unlock over-hour YouTube tracks for this browser tab session. */
  allowLongTracks?: boolean
}

const showDebugPanelStored = ref<boolean | null>(null)
/** null = never customized; [] = cleared to defaults; non-empty = custom list */
const searchPlaceholdersStored = ref<string[] | null>(null)
const allowLongTracksStored = ref(false)

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

function readSessionStored(): SessionPrefs {
  if (typeof sessionStorage === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as SessionPrefs
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
}

function persistSession() {
  if (typeof sessionStorage === 'undefined') return
  const toSave: SessionPrefs = {}
  if (allowLongTracksStored.value) {
    toSave.allowLongTracks = true
  }
  if (Object.keys(toSave).length === 0) {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
    return
  }
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toSave))
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
  const session = readSessionStored()
  if (session.allowLongTracks === true) {
    allowLongTracksStored.value = true
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

  const allowLongTracks = computed(() => allowLongTracksStored.value)

  function setAllowLongTracks(value: boolean) {
    allowLongTracksStored.value = value
    persistSession()
  }

  return {
    showDebugPanel,
    searchPlaceholders: readonly(searchPlaceholders),
    searchPlaceholdersText,
    setShowDebugPanel,
    setSearchPlaceholdersFromText,
    allowLongTracks: readonly(allowLongTracks),
    setAllowLongTracks,
  }
}
