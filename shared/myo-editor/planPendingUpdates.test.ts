import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collectPendingUpdateTargets,
  pendingTargetFrom,
  planPendingUpdates,
  type PendingUpdateSnapshot,
} from './planPendingUpdates.ts'
import { applySourceTrimAndSplit } from './splitTrack.ts'
import { YOTO_MYO_MAX_TRACKS } from './yotoMyoLimits.ts'
import type { PlaylistTrack } from './types.ts'

function youtubeTrack(overrides: Partial<PlaylistTrack> = {}): PlaylistTrack {
  return {
    id: 'yt-1',
    title: 'Baby',
    subtitle: '',
    thumbnailUrl: '',
    source: 'app-youtube',
    youtubeId: 'abc123',
    ...overrides,
  }
}

function reusedTrack(id: string, youtubeId: string): PlaylistTrack {
  return youtubeTrack({
    id,
    youtubeId,
    yotoReuse: {
      trackUrl: `yoto:#${id}`,
      type: 'audio',
      format: 'opus',
      duration: 12,
      fileSize: 1000,
      channels: 'stereo',
      display: { icon16x16: null },
    },
  })
}

function snapshot(
  playlist: PlaylistTrack[],
  baseline: PlaylistTrack[] = [],
  cardTitle = 'Card',
): PendingUpdateSnapshot {
  return { playlist, baseline, cardTitle }
}

describe('pendingTargetFrom', () => {
  it('flags a new YouTube extract', () => {
    const target = pendingTargetFrom('a', snapshot([youtubeTrack()]), null)
    assert.equal(target.extractsYoutube, true)
    assert.equal(target.overCapacity, false)
  })

  it('does not flag a reuse-only playlist as extracting', () => {
    const existing = reusedTrack('a', 'abc123')
    const target = pendingTargetFrom('a', snapshot([existing], [existing]), null)
    assert.equal(target.extractsYoutube, false)
  })

  it('flags at-capacity playlists', () => {
    const tracks = Array.from({ length: YOTO_MYO_MAX_TRACKS }, (_, i) => (
      reusedTrack(`t-${i}`, `yt-${i}`)
    ))
    const target = pendingTargetFrom('full', snapshot(tracks, tracks), null)
    assert.equal(target.overCapacity, true)
    assert.equal(target.extractsYoutube, false)
  })

  it('flags extract when a reused split group is trimmed', () => {
    const parts = [0, 1].map(index => youtubeTrack({
      id: `concert#p${index}`,
      youtubeId: 'concert',
      title: `Concert (Part ${index + 1})`,
      duration: 5400,
      yotoReuse: {
        trackUrl: `yoto:#concert${index}`,
        type: 'audio',
        format: 'opus',
        duration: 2700,
        fileSize: 1,
        channels: 'stereo',
        display: { icon16x16: null },
      },
      split: {
        groupId: 'concert',
        index,
        count: 2,
        startSeconds: index * 2700,
        durationSeconds: 2700,
        sourceDurationSeconds: 5400,
      },
    }))
    const trimmed = applySourceTrimAndSplit(
      parts[0]!,
      { startSeconds: 600, endSeconds: 4800 },
      5400,
    )
    const target = pendingTargetFrom('a', snapshot(trimmed, parts), null)
    assert.equal(target.extractsYoutube, true)
  })

  it('does not flag a reuse-only split group as extracting', () => {
    const parts = [0, 1].map(index => youtubeTrack({
      id: `concert#p${index}`,
      youtubeId: 'concert',
      title: `Concert (Part ${index + 1})`,
      duration: 2700,
      yotoReuse: {
        trackUrl: `yoto:#concert${index}`,
        type: 'audio',
        format: 'opus',
        duration: 2700,
        fileSize: 1,
        channels: 'stereo',
        display: { icon16x16: null },
      },
      split: {
        groupId: 'concert',
        index,
        count: 2,
        startSeconds: index * 2700,
        durationSeconds: 2700,
      },
    }))
    const target = pendingTargetFrom('a', snapshot(parts, parts), null)
    assert.equal(target.extractsYoutube, false)
  })
})

describe('collectPendingUpdateTargets', () => {
  const none = () => false

  it('includes a live dirty selection and skips it in drafts', () => {
    const liveSnap = snapshot([youtubeTrack()], [], 'Live')
    const draftSnap = snapshot([youtubeTrack({ id: 'yt-2', youtubeId: 'def' })], [], 'Draft')
    const targets = collectPendingUpdateTargets({
      live: {
        cardId: 'live',
        snapshot: liveSnap,
        isDirty: true,
        isPodcast: false,
        isSaving: false,
        cardDetail: null,
      },
      drafts: new Map([
        ['live', liveSnap],
        ['draft', draftSnap],
      ]),
      isPodcast: none,
      isSaving: none,
    })
    assert.deepEqual(targets.map(t => t.cardId), ['live', 'draft'])
  })

  it('skips live when clean, podcast, or saving', () => {
    const liveSnap = snapshot([youtubeTrack()])
    for (const live of [
      { isDirty: false, isPodcast: false, isSaving: false },
      { isDirty: true, isPodcast: true, isSaving: false },
      { isDirty: true, isPodcast: false, isSaving: true },
    ] as const) {
      const targets = collectPendingUpdateTargets({
        live: { cardId: 'live', snapshot: liveSnap, cardDetail: null, ...live },
        drafts: new Map(),
        isPodcast: none,
        isSaving: none,
      })
      assert.equal(targets.length, 0)
    }
  })

  it('skips the new-playlist draft key', () => {
    const draftSnap = snapshot([youtubeTrack()])
    const targets = collectPendingUpdateTargets({
      live: null,
      drafts: new Map([
        ['new-playlist-draft', draftSnap],
        ['ok', draftSnap],
      ]),
      isPodcast: none,
      isSaving: none,
    })
    assert.deepEqual(targets.map(t => t.cardId), ['ok'])
  })

  it('skips a live new-playlist-draft so Menu batch Update does not Create', () => {
    const targets = collectPendingUpdateTargets({
      live: {
        cardId: 'new-playlist-draft',
        snapshot: snapshot([youtubeTrack()]),
        cardDetail: null,
        isDirty: true,
        isPodcast: false,
        isSaving: false,
      },
      drafts: new Map(),
      isPodcast: none,
      isSaving: none,
    })
    assert.equal(targets.length, 0)
  })

  it('skips podcast and in-flight draft cards', () => {
    const draftSnap = snapshot([youtubeTrack()])
    const targets = collectPendingUpdateTargets({
      live: null,
      drafts: new Map([
        ['pod', draftSnap],
        ['busy', draftSnap],
        ['ok', draftSnap],
      ]),
      isPodcast: id => id === 'pod',
      isSaving: id => id === 'busy',
    })
    assert.deepEqual(targets.map(t => t.cardId), ['ok'])
  })

  it('collects drafts with no live selection', () => {
    const a = snapshot([youtubeTrack()], [], 'A')
    const b = snapshot([reusedTrack('b', 'bbb')], [reusedTrack('b', 'bbb')], 'B')
    const targets = collectPendingUpdateTargets({
      live: null,
      drafts: new Map([['a', a], ['b', b]]),
      isPodcast: none,
      isSaving: none,
    })
    assert.equal(targets.length, 2)
    assert.equal(targets[0]!.extractsYoutube, true)
    assert.equal(targets[1]!.extractsYoutube, false)
  })
})

describe('planPendingUpdates', () => {
  it('is false when every target is within limits and reuse-only', () => {
    const existing = reusedTrack('a', 'abc')
    const plan = planPendingUpdates([
      pendingTargetFrom('a', snapshot([existing], [existing]), null),
    ])
    assert.deepEqual(plan, { overCapacity: false, extractsYoutube: false })
  })

  it('is true when any target extracts or is over capacity', () => {
    const existing = reusedTrack('a', 'abc')
    const full = Array.from({ length: YOTO_MYO_MAX_TRACKS }, (_, i) => (
      reusedTrack(`t-${i}`, `yt-${i}`)
    ))
    const plan = planPendingUpdates([
      pendingTargetFrom('reuse', snapshot([existing], [existing]), null),
      pendingTargetFrom('new', snapshot([youtubeTrack()]), null),
      pendingTargetFrom('full', snapshot(full, full), null),
    ])
    assert.equal(plan.extractsYoutube, true)
    assert.equal(plan.overCapacity, true)
  })

  it('is extract-only when one target reuses and another is new YouTube', () => {
    const existing = reusedTrack('a', 'abc')
    const plan = planPendingUpdates([
      pendingTargetFrom('reuse', snapshot([existing], [existing]), null),
      pendingTargetFrom('new', snapshot([youtubeTrack()]), null),
    ])
    assert.deepEqual(plan, { overCapacity: false, extractsYoutube: true })
  })
})
