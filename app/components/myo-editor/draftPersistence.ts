import type { PlaylistTrack } from '#shared/myo-editor/types'

const DRAFTS_STORAGE_KEY = 'yoto-cards:pending-drafts'
const PODCAST_STORAGE_KEY = 'yoto-cards:podcast-card-ids'

export type PersistedDraftSnapshot = {
  playlist: PlaylistTrack[]
  baseline: PlaylistTrack[]
  cardTitle: string
}

export type PersistedDrafts = Record<string, PersistedDraftSnapshot>

function isTrack(value: unknown): value is PlaylistTrack {
  if (!value || typeof value !== 'object') return false
  const t = value as Record<string, unknown>
  return typeof t.id === 'string'
    && typeof t.title === 'string'
    && typeof t.subtitle === 'string'
    && typeof t.thumbnailUrl === 'string'
    && typeof t.source === 'string'
}

function isSnapshot(value: unknown): value is PersistedDraftSnapshot {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  return typeof s.cardTitle === 'string'
    && Array.isArray(s.playlist)
    && Array.isArray(s.baseline)
    && s.playlist.every(isTrack)
    && s.baseline.every(isTrack)
}

export function readPersistedDrafts(): PersistedDrafts {
  if (typeof localStorage === 'undefined') return {}

  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}

    const out: PersistedDrafts = {}
    for (const [cardId, snap] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof cardId === 'string' && cardId && isSnapshot(snap)) {
        out[cardId] = snap
      }
    }
    return out
  }
  catch {
    return {}
  }
}

export function writePersistedDrafts(drafts: PersistedDrafts): void {
  if (typeof localStorage === 'undefined') return

  if (Object.keys(drafts).length === 0) {
    localStorage.removeItem(DRAFTS_STORAGE_KEY)
    return
  }

  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts))
}

export function readPodcastCardIds(): string[] {
  if (typeof localStorage === 'undefined') return []

  try {
    const raw = localStorage.getItem(PODCAST_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
  }
  catch {
    return []
  }
}

export function writePodcastCardIds(ids: string[]): void {
  if (typeof localStorage === 'undefined') return

  if (ids.length === 0) {
    localStorage.removeItem(PODCAST_STORAGE_KEY)
    return
  }

  localStorage.setItem(PODCAST_STORAGE_KEY, JSON.stringify([...new Set(ids)]))
}
