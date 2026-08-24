import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildSavePlan, EMPTY_CARD_DETAIL, playlistSaveExtractsYoutube } from './buildSavePlan.ts'
import { applySourceTrimAndSplit, expandUnsplitTrack } from './splitTrack.ts'
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

describe('playlistSaveExtractsYoutube', () => {
  it('is true for a new YouTube track', () => {
    assert.equal(playlistSaveExtractsYoutube([], [youtubeTrack()], null), true)
  })

  it('extracts every YouTube track against an empty card detail', () => {
    const plan = buildSavePlan([], [youtubeTrack()], EMPTY_CARD_DETAIL)
    assert.equal(plan.tracks.length, 1)
    assert.equal(plan.tracks[0]?.kind, 'extract-youtube')
    assert.equal(playlistSaveExtractsYoutube([], [youtubeTrack()], EMPTY_CARD_DETAIL), true)
  })

  it('is false when the YouTube track can be reused from the card', () => {
    const existing = youtubeTrack({
      yotoReuse: {
        trackUrl: 'yoto:#deadbeef',
        type: 'audio',
        format: 'opus',
        duration: 12,
        fileSize: 1000,
        channels: 'stereo',
        display: { icon16x16: null },
      },
    })
    assert.equal(playlistSaveExtractsYoutube([existing], [existing], null), false)
  })

  it('extracts a reused YouTube track when it has a trim', () => {
    const existing = youtubeTrack({
      duration: 60,
      yotoReuse: {
        trackUrl: 'yoto:#deadbeef',
        type: 'audio',
        format: 'opus',
        duration: 60,
        fileSize: 1000,
        channels: 'stereo',
        display: { icon16x16: null },
      },
    })
    const trimmed = {
      ...existing,
      trim: { startSeconds: 5, endSeconds: 40 },
    }
    assert.equal(playlistSaveExtractsYoutube([existing], [trimmed], null), true)
    const plan = buildSavePlan([existing], [trimmed], EMPTY_CARD_DETAIL)
    assert.equal(plan.tracks[0]?.kind, 'extract-youtube')
  })

  it('is false for a reuse-only reorder', () => {
    const a = youtubeTrack({
      id: 'a',
      yotoReuse: {
        trackUrl: 'yoto:#aaa',
        type: 'audio',
        format: 'opus',
        duration: 10,
        fileSize: 1,
        channels: 'stereo',
        display: { icon16x16: null },
      },
    })
    const b = youtubeTrack({
      id: 'b',
      youtubeId: 'def',
      yotoReuse: {
        trackUrl: 'yoto:#bbb',
        type: 'audio',
        format: 'opus',
        duration: 10,
        fileSize: 1,
        channels: 'stereo',
        display: { icon16x16: null },
      },
    })
    assert.equal(playlistSaveExtractsYoutube([a, b], [b, a], null), false)
  })
})

describe('empty playlist save', () => {
  it('plans a clear with no extracts or errors', () => {
    const existing = youtubeTrack({
      yotoReuse: {
        trackUrl: 'yoto:#deadbeef',
        type: 'audio',
        format: 'opus',
        duration: 12,
        fileSize: 1000,
        channels: 'stereo',
        display: { icon16x16: null },
      },
    })
    const plan = buildSavePlan([existing], [], EMPTY_CARD_DETAIL)
    assert.deepEqual(plan.tracks, [])
    assert.deepEqual(plan.errors, [])
    assert.equal(playlistSaveExtractsYoutube([existing], [], null), false)
  })
})

describe('split YouTube groups', () => {
  function splitPart(index: number, count = 2): PlaylistTrack {
    return youtubeTrack({
      id: `abc123#p${index}`,
      title: `Baby (Part ${index + 1})`,
      duration: 1800,
      split: {
        groupId: 'abc123',
        index,
        count,
        startSeconds: index * 1800,
        durationSeconds: 1800,
      },
    })
  }

  it('allows the same youtubeId across a complete split group', () => {
    const plan = buildSavePlan([], [splitPart(0), splitPart(1)], EMPTY_CARD_DETAIL)
    assert.deepEqual(plan.errors, [])
    assert.equal(plan.tracks.length, 2)
    assert.equal(plan.tracks[0]?.kind, 'extract-youtube')
    assert.equal(plan.tracks[1]?.kind, 'extract-youtube')
    if (plan.tracks[0]?.kind === 'extract-youtube') {
      assert.equal(plan.tracks[0].split?.index, 0)
    }
  })

  it('rejects two independent copies of the same video', () => {
    const plan = buildSavePlan([], [youtubeTrack(), youtubeTrack({ id: 'copy' })], EMPTY_CARD_DETAIL)
    assert.match(plan.errors[0] ?? '', /Duplicate YouTube video/)
  })

  it('reuses saved split parts without re-extracting', () => {
    const reuse = {
      trackUrl: 'yoto:#part',
      type: 'audio' as const,
      format: 'opus',
      duration: 1800,
      fileSize: 1,
      channels: 'stereo' as const,
      display: { icon16x16: null },
    }
    const parts = [0, 1].map(index => splitPart(index)).map(part => ({
      ...part,
      yotoReuse: { ...reuse, trackUrl: `yoto:#part${part.split?.index}` },
    }))
    assert.equal(playlistSaveExtractsYoutube(parts, parts, null), false)
  })

  it('extracts a reused split group after applySourceTrimAndSplit', () => {
    const reuse = {
      trackUrl: 'yoto:#part',
      type: 'audio' as const,
      format: 'opus',
      duration: 1800,
      fileSize: 1,
      channels: 'stereo' as const,
      display: { icon16x16: null },
    }
    const baseline = [0, 1].map(index => splitPart(index)).map(part => ({
      ...part,
      duration: 5400,
      yotoReuse: { ...reuse, trackUrl: `yoto:#part${part.split?.index}` },
    }))
    const stillLong = applySourceTrimAndSplit(
      baseline[0]!,
      { startSeconds: 600, endSeconds: 4800 },
      5400,
    )
    assert.ok(stillLong.length >= 2)
    assert.equal(stillLong.every(row => row.yotoReuse === undefined), true)
    assert.equal(playlistSaveExtractsYoutube(baseline, stillLong, null), true)
    const longPlan = buildSavePlan(baseline, stillLong, EMPTY_CARD_DETAIL)
    assert.equal(longPlan.tracks.every(action => action.kind === 'extract-youtube'), true)

    const collapsed = applySourceTrimAndSplit(
      baseline[0]!,
      { startSeconds: 120, endSeconds: 3120 },
      5400,
    )
    assert.equal(collapsed.length, 1)
    assert.equal(collapsed[0]?.yotoReuse, undefined)
    assert.equal(playlistSaveExtractsYoutube(baseline, collapsed, null), true)
    const collapsedPlan = buildSavePlan(baseline, collapsed, EMPTY_CARD_DETAIL)
    assert.equal(collapsedPlan.tracks[0]?.kind, 'extract-youtube')
  })

  it('extracts only the new split group in a mixed playlist', () => {
    const reused = youtubeTrack({
      id: 'short',
      youtubeId: 'short',
      yotoReuse: {
        trackUrl: 'yoto:#short',
        type: 'audio',
        format: 'opus',
        duration: 60,
        fileSize: 1,
        channels: 'stereo',
        display: { icon16x16: null },
      },
    })
    const playlist = [reused, splitPart(0), splitPart(1)]
    const plan = buildSavePlan([reused], playlist, EMPTY_CARD_DETAIL)
    assert.deepEqual(plan.errors, [])
    assert.equal(plan.tracks[0]?.kind, 'reuse-yoto')
    assert.equal(plan.tracks[1]?.kind, 'extract-youtube')
    assert.equal(plan.tracks[2]?.kind, 'extract-youtube')
    assert.equal(playlistSaveExtractsYoutube([reused], playlist, null), true)
  })

  it('extracts a reused unsplit track that later has split parts', () => {
    const existing = youtubeTrack({
      id: 'long',
      youtubeId: 'long',
      title: 'Concert',
      duration: 7200,
      yotoReuse: {
        trackUrl: 'yoto:#long',
        type: 'audio',
        format: 'opus',
        duration: 7200,
        fileSize: 1,
        channels: 'stereo',
        display: { icon16x16: null },
      },
    })
    const parts = expandUnsplitTrack(existing, 7200)
    assert.ok(parts)
    assert.equal(parts.length, 3)
    assert.equal(playlistSaveExtractsYoutube([existing], parts, null), true)
    const plan = buildSavePlan([existing], parts, EMPTY_CARD_DETAIL)
    assert.equal(plan.tracks.every(action => action.kind === 'extract-youtube'), true)
  })
})
