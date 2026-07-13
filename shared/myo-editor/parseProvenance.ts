import type { ProvenanceTrackEntry, YotoCardsManifest } from './types'
import { YOTO_CARDS_CONTENT_VERSION } from './types'

interface NotePayload {
  yotoCards?: {
    version?: number
    tracks?: ProvenanceTrackEntry[]
  }
}

export function parseProvenance(
  note: string | null | undefined,
  contentVersion: string | null | undefined,
): YotoCardsManifest | null {
  if (!note?.trim()) return null

  let parsed: NotePayload
  try {
    parsed = JSON.parse(note) as NotePayload
  }
  catch {
    return null
  }

  const yotoCards = parsed?.yotoCards
  if (!yotoCards || typeof yotoCards.version !== 'number') {
    return null
  }

  if (contentVersion && contentVersion !== YOTO_CARDS_CONTENT_VERSION) {
    // Still accept manifest if note is valid; version is advisory
  }

  const tracks = Array.isArray(yotoCards.tracks)
    ? yotoCards.tracks.filter(isValidProvenanceEntry)
    : []

  if (tracks.length === 0 && yotoCards.version !== 1) {
    return null
  }

  return {
    version: yotoCards.version,
    tracks,
  }
}

function isValidProvenanceEntry(entry: unknown): entry is ProvenanceTrackEntry {
  if (!entry || typeof entry !== 'object') return false
  const e = entry as ProvenanceTrackEntry
  return Boolean(
    e.chapterKey
    && e.trackKey
    && e.youtubeId
    && e.title,
  )
}

export function manifestLookupKey(chapterKey: string, trackKey: string): string {
  return `${chapterKey}:${trackKey}`
}

export function buildManifestLookup(
  manifest: YotoCardsManifest | null,
): Map<string, ProvenanceTrackEntry> {
  const map = new Map<string, ProvenanceTrackEntry>()
  if (!manifest) return map

  for (const entry of manifest.tracks) {
    map.set(manifestLookupKey(entry.chapterKey, entry.trackKey), entry)
  }
  return map
}

export function buildProvenance(
  tracks: Array<{ chapterKey: string; trackKey: string; title: string; youtubeId: string }>,
): { note: string; contentVersion: string } {
  const payload = {
    yotoCards: {
      version: 1,
      tracks: tracks.map(track => ({
        chapterKey: track.chapterKey,
        trackKey: track.trackKey,
        youtubeId: track.youtubeId,
        title: track.title,
      })),
    },
  }

  return {
    note: JSON.stringify(payload),
    contentVersion: YOTO_CARDS_CONTENT_VERSION,
  }
}
