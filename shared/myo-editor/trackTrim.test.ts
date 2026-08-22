import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PlaylistTrack } from './types.ts'
import {
  canTrimTrack,
  clampTrim,
  effectiveCutRange,
  isFullFileTrim,
  isTrimmed,
  previewOffsetSeconds,
  previewWindow,
  resolveTrim,
  sourceDurationSeconds,
  trimmedDurationSeconds,
} from './trackTrim.ts'

function track(overrides: Partial<PlaylistTrack> = {}): PlaylistTrack {
  return {
    id: 'yt-1',
    title: 'Song',
    subtitle: '',
    thumbnailUrl: '',
    source: 'app-youtube',
    youtubeId: 'abcdefghijk',
    duration: 120,
    ...overrides,
  }
}

describe('clampTrim', () => {
  it('keeps a valid window', () => {
    assert.deepEqual(clampTrim(10, 40, 120), { startSeconds: 10, endSeconds: 40 })
  })

  it('enforces a 1s minimum keep', () => {
    assert.deepEqual(clampTrim(10, 10.2, 120), { startSeconds: 10, endSeconds: 11 })
  })

  it('clamps to the source duration', () => {
    assert.deepEqual(clampTrim(-5, 999, 30), { startSeconds: 0, endSeconds: 30 })
  })
})

describe('isTrimmed / trimmedDurationSeconds', () => {
  it('treats a missing trim as the full file', () => {
    assert.equal(isTrimmed(track()), false)
    assert.equal(trimmedDurationSeconds(track()), 120)
  })

  it('treats a near-full window as untrimmed', () => {
    assert.equal(isTrimmed(track({ trim: { startSeconds: 0.01, endSeconds: 119.99 } })), false)
  })

  it('returns the keep-region length', () => {
    const trimmed = track({ trim: { startSeconds: 15, endSeconds: 75 } })
    assert.equal(isTrimmed(trimmed), true)
    assert.equal(trimmedDurationSeconds(trimmed), 60)
  })

  it('compares split-part trim against the source file, not the chapter', () => {
    const part = track({
      duration: 2100,
      trim: { startSeconds: 600, endSeconds: 4800 },
      split: {
        groupId: 'abcdefghijk',
        index: 0,
        count: 2,
        startSeconds: 600,
        durationSeconds: 2100,
        sourceDurationSeconds: 5400,
      },
    })
    assert.equal(isTrimmed(part), true)
    assert.equal(trimmedDurationSeconds(part), 2100)
  })
})

describe('canTrimTrack', () => {
  it('allows YouTube-sourced rows', () => {
    assert.equal(canTrimTrack(track()), true)
    assert.equal(canTrimTrack(track({ source: 'youtube-url' })), true)
  })

  it('rejects streams and yoto uploads', () => {
    assert.equal(canTrimTrack(track({ source: 'stream' })), false)
    assert.equal(canTrimTrack(track({ source: 'yoto-upload', youtubeId: undefined })), false)
  })
})

describe('effectiveCutRange', () => {
  it('is null for an untrimmed full track', () => {
    assert.equal(effectiveCutRange(track()), null)
  })

  it('returns the keep-region for a trimmed track', () => {
    assert.deepEqual(
      effectiveCutRange(track({ trim: { startSeconds: 8, endSeconds: 20 } })),
      { startSeconds: 8, durationSeconds: 12 },
    )
  })

  it('does not add source trim on top of a split window', () => {
    const part = track({
      duration: 2100,
      split: {
        groupId: 'abcdefghijk',
        index: 1,
        count: 2,
        startSeconds: 2700,
        durationSeconds: 2100,
        sourceDurationSeconds: 5400,
      },
      trim: { startSeconds: 600, endSeconds: 4800 },
    })
    assert.deepEqual(effectiveCutRange(part), {
      startSeconds: 2700,
      durationSeconds: 2100,
    })
  })

  it('returns the split window when the part is untrimmed', () => {
    const part = track({
      duration: 1800,
      split: {
        groupId: 'abcdefghijk',
        index: 0,
        count: 2,
        startSeconds: 0,
        durationSeconds: 1800,
      },
    })
    assert.deepEqual(effectiveCutRange(part, 3600), {
      startSeconds: 0,
      durationSeconds: 1800,
    })
  })
})

describe('isFullFileTrim', () => {
  it('is true within the 50ms epsilon', () => {
    assert.equal(isFullFileTrim(0, 10, 10), true)
    assert.equal(isFullFileTrim(0.04, 9.97, 10), true)
    assert.equal(isFullFileTrim(0.2, 10, 10), false)
  })
})

describe('resolveTrim', () => {
  it('defaults to the full source window', () => {
    assert.deepEqual(resolveTrim(track()), { startSeconds: 0, endSeconds: 120 })
  })
})

describe('previewWindow / sourceDurationSeconds', () => {
  const part1 = {
    groupId: 'abcdefghijk',
    index: 0,
    count: 2,
    startSeconds: 0,
    durationSeconds: 1800,
    sourceDurationSeconds: 3500,
  }
  const part2 = {
    groupId: 'abcdefghijk',
    index: 1,
    count: 2,
    startSeconds: 1800,
    durationSeconds: 1700,
    sourceDurationSeconds: 3500,
  }

  it('uses the full duration at offset 0 for an unsplit track', () => {
    assert.deepEqual(previewWindow(track()), { startSeconds: 0, durationSeconds: 120 })
  })

  it('uses the full source file for split parts', () => {
    const part = track({ duration: 1800, split: part1 })
    assert.equal(previewOffsetSeconds(part), 0)
    assert.deepEqual(previewWindow(part), { startSeconds: 0, durationSeconds: 3500 })
  })

  it('windows part 2 from the start of the file', () => {
    const part = track({ duration: 1700, split: part2 })
    assert.equal(previewOffsetSeconds(part), 0)
    assert.deepEqual(previewWindow(part), { startSeconds: 0, durationSeconds: 3500 })
  })

  it('falls back to split.durationSeconds when the full source length is unknown', () => {
    const part = track({
      duration: undefined,
      split: {
        groupId: 'abcdefghijk',
        index: 0,
        count: 2,
        startSeconds: 0,
        durationSeconds: 1800,
      },
    })
    assert.equal(sourceDurationSeconds(part), 1800)
    assert.deepEqual(previewWindow(part), { startSeconds: 0, durationSeconds: 1800 })
  })
})
