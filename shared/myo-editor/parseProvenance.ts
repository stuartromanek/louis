import type { ProvenanceTrackEntry, TrackSplit, YotoCardsManifest } from './types.ts'
import { YOTO_CARDS_CONTENT_VERSION } from './types.ts'
import { isValidTrackSplit } from './splitTrack.ts'

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
    ? yotoCards.tracks.filter(isValidProvenanceEntry).map(normalizeProvenanceEntry)
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

function normalizeProvenanceEntry(entry: ProvenanceTrackEntry): ProvenanceTrackEntry {
  const split = isValidTrackSplit(entry.split) ? entry.split : undefined
  if (!split) {
    const { split: _ignored, ...rest } = entry
    return rest
  }
  return { ...entry, split }
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

/**
 * Chapter keys are reindexed on save (01, 02, …). A stale metadata note still
 * maps old keys (e.g. deleted track 01:01) onto the new first chapter.
 * Only apply the manifest when its row count matches the card.
 */
export function buildManifestLookupForCard(
  manifest: YotoCardsManifest | null,
  trackCount: number,
): Map<string, ProvenanceTrackEntry> {
  if (!manifest || manifest.tracks.length !== trackCount) {
    return new Map()
  }
  return buildManifestLookup(manifest)
}

export function buildProvenance(
  tracks: Array<{
    chapterKey: string
    trackKey: string
    title: string
    youtubeId: string
    split?: TrackSplit
  }>,
): { note: string; contentVersion: string } {
  const payload = {
    yotoCards: {
      version: 1,
      tracks: tracks.map((track) => {
        const entry: ProvenanceTrackEntry = {
          chapterKey: track.chapterKey,
          trackKey: track.trackKey,
          youtubeId: track.youtubeId,
          title: track.title,
        }
        if (track.split && isValidTrackSplit(track.split)) {
          entry.split = track.split
        }
        return entry
      }),
    },
  }

  return {
    note: JSON.stringify(payload),
    contentVersion: YOTO_CARDS_CONTENT_VERSION,
  }
}
