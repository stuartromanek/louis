import type { PlaylistTrack, YotoCardDetail } from './types.ts'
import { playlistSaveExtractsYoutube } from './buildSavePlan.ts'
import { playlistIsAtOrOverCapacity } from './yotoMyoLimits.ts'

export interface PendingUpdateSnapshot {
  playlist: PlaylistTrack[]
  baseline: PlaylistTrack[]
  cardTitle: string
}

export interface PendingUpdateTarget {
  cardId: string
  snapshot: PendingUpdateSnapshot
  overCapacity: boolean
  extractsYoutube: boolean
}

export interface CollectPendingUpdatesLive {
  cardId: string
  snapshot: PendingUpdateSnapshot
  isDirty: boolean
  isPodcast: boolean
  isSaving: boolean
  cardDetail: YotoCardDetail | null
}

export interface CollectPendingUpdatesInput {
  live: CollectPendingUpdatesLive | null
  drafts: Iterable<[string, PendingUpdateSnapshot]>
  isPodcast: (cardId: string) => boolean
  isSaving: (cardId: string) => boolean
}

export function pendingTargetFrom(
  cardId: string,
  snapshot: PendingUpdateSnapshot,
  cardDetail: YotoCardDetail | null,
): PendingUpdateTarget {
  return {
    cardId,
    snapshot,
    overCapacity: playlistIsAtOrOverCapacity(snapshot.playlist),
    extractsYoutube: playlistSaveExtractsYoutube(
      snapshot.baseline,
      snapshot.playlist,
      cardDetail,
    ),
  }
}

/** Live dirty selection first, then stashed drafts that are not already included. */
export function collectPendingUpdateTargets(
  input: CollectPendingUpdatesInput,
): PendingUpdateTarget[] {
  const targets: PendingUpdateTarget[] = []
  const seen = new Set<string>()

  const live = input.live
  if (live && live.isDirty && !live.isPodcast && !live.isSaving) {
    targets.push(pendingTargetFrom(live.cardId, live.snapshot, live.cardDetail))
    seen.add(live.cardId)
  }

  for (const [cardId, snapshot] of input.drafts) {
    if (seen.has(cardId)) continue
    if (input.isPodcast(cardId) || input.isSaving(cardId)) continue
    targets.push(pendingTargetFrom(cardId, snapshot, null))
    seen.add(cardId)
  }

  return targets
}

export function planPendingUpdates(targets: PendingUpdateTarget[]): {
  overCapacity: boolean
  extractsYoutube: boolean
} {
  return {
    overCapacity: targets.some(target => target.overCapacity),
    extractsYoutube: targets.some(target => target.extractsYoutube),
  }
}
