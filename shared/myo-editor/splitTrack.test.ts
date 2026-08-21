import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  YOTO_MYO_MAX_TRACKS,
  YOTO_MYO_MAX_TRACK_SECONDS,
  YOTO_MYO_SPLIT_TRACK_SECONDS,
} from './yotoMyoLimits.ts'
import {
  applyProbedDurations,
  blockIndexForTrack,
  expandUnsplitTrack,
  extractGroupShouldCutParts,
  formatSplitIntoChip,
  incomingTrackBlocks,
  isCompleteSplitCopy,
  isCompleteSplitGroup,
  movePlaylistBlock,
  planTrackSplit,
  playlistBlocks,
  removeTrackOrGroup,
  reorderPlaylistBlocks,
  resolveSplitCuts,
  sanitizeSplitGrouping,
  saveNeedsProbedDuration,
  scaleSplitParts,
  scaledPartsExceedMaxTrack,
  selectIncomingTracks,
  snapInsertTrackIndex,
  splitGroupSourceTitle,
  splitPartNumberLabel,
  splitPartTitle,
  splitPartTrackId,
  splitTrackAccessibleName,
  trackIndexForBlock,
} from './splitTrack.ts'
import type { PlaylistTrack } from './types.ts'

function track(partial: Partial<PlaylistTrack> & Pick<PlaylistTrack, 'id'>): PlaylistTrack {
  return {
    title: partial.title ?? partial.id,
    subtitle: '',
    thumbnailUrl: '',
    source: 'app-youtube',
    ...partial,
  }
}

describe('planTrackSplit', () => {
  it('does not split at the 55-minute threshold', () => {
    assert.equal(planTrackSplit(YOTO_MYO_SPLIT_TRACK_SECONDS), null)
    assert.equal(planTrackSplit(YOTO_MYO_SPLIT_TRACK_SECONDS - 1), null)
    assert.equal(planTrackSplit(0), null)
  })

  it('splits 3301 seconds into two equal-ish parts', () => {
    const plan = planTrackSplit(YOTO_MYO_SPLIT_TRACK_SECONDS + 1)
    assert.ok(plan)
    assert.equal(plan.count, 2)
    assert.equal(plan.parts.length, 2)
    assert.equal(plan.parts[0]?.start, 0)
    assert.equal(plan.parts[0]?.duration, 1650)
    assert.equal(plan.parts[1]?.start, 1650)
    assert.equal(plan.parts[1]?.duration, 1651)
    assert.equal(
      plan.parts.reduce((sum, part) => sum + part.duration, 0),
      YOTO_MYO_SPLIT_TRACK_SECONDS + 1,
    )
  })

  it('splits 7200 seconds into three equal parts', () => {
    const plan = planTrackSplit(7200)
    assert.ok(plan)
    assert.equal(plan.count, 3)
    assert.deepEqual(plan.parts, [
      { start: 0, duration: 2400 },
      { start: 2400, duration: 2400 },
      { start: 4800, duration: 2400 },
    ])
  })

  it('puts rounding remainder on the last part', () => {
    const plan = planTrackSplit(7001)
    assert.ok(plan)
    const last = plan.parts.at(-1)!
    const earlier = plan.parts.slice(0, -1)
    for (const part of earlier) {
      assert.equal(part.duration, Math.floor(7001 / plan.count))
    }
    assert.equal(
      earlier.reduce((sum, part) => sum + part.duration, 0) + last.duration,
      7001,
    )
  })

  it('splits a full 60-minute track because it sits above the 55-minute threshold', () => {
    const plan = planTrackSplit(YOTO_MYO_MAX_TRACK_SECONDS)
    assert.ok(plan)
    assert.equal(plan.count, 2)
    assert.ok(plan.parts.every(part => part.duration <= YOTO_MYO_MAX_TRACK_SECONDS))
  })
})

describe('split titles and chips', () => {
  it('appends a 1-based part suffix', () => {
    assert.equal(splitPartTitle('Storytime', 0), 'Storytime (Part 1)')
    assert.equal(splitPartTrackId('abc', 1), 'abc#p1')
    assert.equal(formatSplitIntoChip(3), 'Splits into 3')
  })

  it('strips the part suffix for the group header', () => {
    assert.equal(
      splitGroupSourceTitle('The Beatles Greatest Hits (Part 1)'),
      'The Beatles Greatest Hits',
    )
    assert.equal(splitPartNumberLabel(0), 'Part 1')
    assert.equal(splitPartNumberLabel(2), 'Part 3')
  })
})

describe('playlist grouping', () => {
  const a = track({ id: 'a', youtubeId: 'a' })
  const b0 = track({
    id: 'b#p0',
    youtubeId: 'b',
    split: { groupId: 'b', index: 0, count: 2, startSeconds: 0, durationSeconds: 100 },
  })
  const b1 = track({
    id: 'b#p1',
    youtubeId: 'b',
    split: { groupId: 'b', index: 1, count: 2, startSeconds: 100, durationSeconds: 100 },
  })
  const c = track({ id: 'c', youtubeId: 'c' })

  it('groups a complete contiguous split and leaves singles alone', () => {
    const blocks = playlistBlocks([a, b0, b1, c])
    assert.equal(blocks.length, 3)
    assert.equal(blocks[0]?.kind, 'single')
    assert.equal(blocks[1]?.kind, 'split')
    assert.deepEqual(blocks[1]?.tracks.map(item => item.id), ['b#p0', 'b#p1'])
    assert.equal(blocks[2]?.kind, 'single')
  })

  it('treats incomplete or gapped split rows as singles', () => {
    const blocks = playlistBlocks([b0, a, b1])
    assert.equal(blocks.every(block => block.kind === 'single'), true)
    const sanitized = sanitizeSplitGrouping([b0, a, b1])
    assert.equal(sanitized[0]?.split, undefined)
    assert.equal(sanitized[2]?.split, undefined)
  })

  it('strips leftover (Part N) titles when a split group is incomplete', () => {
    const orphan = track({
      id: 'story#p0',
      youtubeId: 'story',
      title: 'Storytime (Part 1)',
      split: { groupId: 'story', index: 0, count: 2, startSeconds: 0, durationSeconds: 100 },
    })
    const [cleaned] = sanitizeSplitGrouping([orphan])
    assert.equal(cleaned?.split, undefined)
    assert.equal(cleaned?.title, 'Storytime')
  })

  it('removes every part of a grouped split', () => {
    const next = removeTrackOrGroup([a, b0, b1, c], 'b#p1')
    assert.deepEqual(next.map(item => item.id), ['a', 'c'])
  })

  it('moves a split group as one block', () => {
    const down = movePlaylistBlock([a, b0, b1, c], 1, 1)
    assert.deepEqual(down.map(item => item.id), ['a', 'c', 'b#p0', 'b#p1'])
    const up = movePlaylistBlock([a, b0, b1, c], 2, -1)
    assert.deepEqual(up.map(item => item.id), ['b#p0', 'b#p1', 'a', 'c'])
  })

  it('reorders by block index', () => {
    const next = reorderPlaylistBlocks([a, b0, b1, c], 0, 1)
    assert.deepEqual(next.map(item => item.id), ['b#p0', 'b#p1', 'a', 'c'])
  })

  it('maps block indices to track indices and snaps inserts to group starts', () => {
    const list = [a, b0, b1, c]
    assert.equal(blockIndexForTrack(list, 2), 1)
    assert.equal(trackIndexForBlock(list, 1), 1)
    assert.equal(snapInsertTrackIndex(list, 2), 1)
    assert.equal(snapInsertTrackIndex(list, 1), 1)
    assert.equal(snapInsertTrackIndex(list, 3), 3)
  })

  it('keeps incoming split parts in one add block', () => {
    const blocks = incomingTrackBlocks([b0, b1, a])
    assert.equal(blocks.length, 2)
    assert.deepEqual(blocks[0]?.map(item => item.id), ['b#p0', 'b#p1'])
  })
})

describe('scaleSplitParts / expandUnsplitTrack', () => {
  it('scales planned ranges onto the probed duration', () => {
    const scaled = scaleSplitParts(
      [{ start: 0, duration: 1800 }, { start: 1800, duration: 1800 }],
      3600,
      3700,
    )
    assert.equal(scaled.length, 2)
    assert.equal(scaled[0]?.start, 0)
    assert.equal(scaled[1]?.start, scaled[0]?.duration)
    assert.equal(
      Math.round((scaled[0]?.duration ?? 0) + (scaled[1]?.duration ?? 0)),
      3700,
    )
  })

  it('expands a long unsplit track into connected parts', () => {
    const source = track({
      id: 'long',
      youtubeId: 'long',
      title: 'Bedtime',
      duration: 7200,
    })
    const parts = expandUnsplitTrack(source, 7200)
    assert.ok(parts)
    assert.equal(parts.length, 3)
    assert.equal(parts[0]?.title, 'Bedtime (Part 1)')
    assert.equal(parts[0]?.split?.groupId, 'long')
    assert.equal(parts[2]?.split?.index, 2)
  })

  it('re-plans when scaling would put a part over 60 minutes', () => {
    const stretched = resolveSplitCuts(
      [{ start: 0, duration: 1800 }, { start: 1800, duration: 1800 }],
      3600,
      8000,
    )
    assert.ok(stretched.replanned)
    assert.equal(stretched.replanned.count, 3)
    assert.equal(stretched.ranges.length, 3)
    assert.equal(scaledPartsExceedMaxTrack(stretched.ranges), false)
    assert.ok(stretched.ranges.every(part => part.duration <= YOTO_MYO_MAX_TRACK_SECONDS))
  })

  it('applies probed duration: expand unsplit, keep scaled parts under 60 minutes', () => {
    const unsplit = track({
      id: 'album',
      youtubeId: 'album',
      title: 'Album',
      duration: 3600,
    })
    const expanded = applyProbedDurations([unsplit], new Map([['album', 7200]]))
    assert.equal(expanded.length, 3)
    assert.ok(expanded.every(item => (item.duration ?? 0) <= YOTO_MYO_MAX_TRACK_SECONDS))

    const p0 = track({
      id: 'short#p0',
      youtubeId: 'short',
      title: 'Short (Part 1)',
      split: { groupId: 'short', index: 0, count: 2, startSeconds: 0, durationSeconds: 1800 },
    })
    const p1 = track({
      id: 'short#p1',
      youtubeId: 'short',
      title: 'Short (Part 2)',
      split: { groupId: 'short', index: 1, count: 2, startSeconds: 1800, durationSeconds: 1800 },
    })
    const replanned = applyProbedDurations([p0, p1], new Map([['short', 8000]]))
    assert.equal(replanned.length, 3)
    assert.ok(replanned.every(item => (item.split?.durationSeconds ?? 0) <= YOTO_MYO_MAX_TRACK_SECONDS))
  })
})

describe('split completeness / insert / probe', () => {
  it('requires a contiguous index set for a complete split copy', () => {
    const p0 = track({
      id: 'x#p0',
      youtubeId: 'x',
      split: { groupId: 'x', index: 0, count: 3, startSeconds: 0, durationSeconds: 100 },
    })
    const p2 = track({
      id: 'x#p2',
      youtubeId: 'x',
      split: { groupId: 'x', index: 2, count: 3, startSeconds: 200, durationSeconds: 100 },
    })
    assert.equal(isCompleteSplitCopy([p0, p2]), false)
    assert.equal(isCompleteSplitGroup([p0, p2]), false)
  })

  it('still cuts ffmpeg ranges for a lone extract of one split part', () => {
    const part = {
      split: { groupId: 'x', index: 1, count: 3, startSeconds: 100, durationSeconds: 100 },
    }
    assert.equal(extractGroupShouldCutParts([part]), true)
    assert.equal(extractGroupShouldCutParts([{ }]), false)
  })

  it('overflows a 3-part incoming block when only one slot remains', () => {
    const existing = Array.from({ length: YOTO_MYO_MAX_TRACKS - 1 }, (_, i) =>
      track({ id: `t${i}`, youtubeId: `t${i}` }),
    )
    const incoming = [
      track({
        id: 'long#p0',
        youtubeId: 'long',
        split: { groupId: 'long', index: 0, count: 3, startSeconds: 0, durationSeconds: 100 },
      }),
      track({
        id: 'long#p1',
        youtubeId: 'long',
        split: { groupId: 'long', index: 1, count: 3, startSeconds: 100, durationSeconds: 100 },
      }),
      track({
        id: 'long#p2',
        youtubeId: 'long',
        split: { groupId: 'long', index: 2, count: 3, startSeconds: 200, durationSeconds: 100 },
      }),
    ]
    const result = selectIncomingTracks(existing, incoming)
    assert.equal(result.unique.length, 0)
    assert.equal(result.overflow, 3)
    assert.equal(result.skipped, 0)
  })

  it('fails closed without a probe on an unsplit long or unknown-duration extract', () => {
    assert.equal(saveNeedsProbedDuration(track({ id: 'u', youtubeId: 'u' })), true)
    assert.equal(
      saveNeedsProbedDuration(track({ id: 'long', youtubeId: 'long', duration: 4000 })),
      true,
    )
    assert.equal(
      saveNeedsProbedDuration(track({ id: 'short', youtubeId: 'short', duration: 120 })),
      false,
    )
    assert.equal(
      saveNeedsProbedDuration(track({
        id: 'p0',
        youtubeId: 'p',
        split: { groupId: 'p', index: 0, count: 2, startSeconds: 0, durationSeconds: 100 },
      })),
      false,
    )
  })

  it('speaks source title plus Part N for split rows', () => {
    assert.equal(
      splitTrackAccessibleName({
        title: 'Storytime (Part 1)',
        split: { groupId: 's', index: 0, count: 2, startSeconds: 0, durationSeconds: 100 },
      }),
      'Storytime, Part 1',
    )
  })
})
