import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  TRANSCODE_POLL_CAP_MS,
  TRANSCODE_POLL_FAST_INTERVAL_MS,
  TRANSCODE_POLL_FLOOR_MS,
  TRANSCODE_POLL_SLOW_INTERVAL_MS,
  TRANSCODE_STALL_GRACE_MS,
  TRANSCODE_STALL_MS,
  formatElapsedMinutes,
  formatTranscodeGiveUpMessage,
  transcodePollBudget,
  transcodePollIntervalMs,
  transcodeProgressKey,
  transcodeRetryDecision,
  transcodeShouldStall,
} from './yoto-transcode-poll.ts'

describe('transcodePollBudget', () => {
  it('uses the 6-minute floor for small short files', () => {
    assert.equal(transcodePollBudget({ bytes: 5_000_000, durationSeconds: 120 }), TRANSCODE_POLL_FLOOR_MS)
  })

  it('scales with file size past the floor', () => {
    const budget = transcodePollBudget({ bytes: 80_000_000, durationSeconds: 60 })
    assert.equal(budget, 80 * 8_000)
    assert.ok(budget > TRANSCODE_POLL_FLOOR_MS)
  })

  it('scales with audio duration past the floor', () => {
    const budget = transcodePollBudget({ bytes: 1_000_000, durationSeconds: 15 * 60 })
    assert.equal(budget, 15 * 30_000)
    assert.ok(budget > TRANSCODE_POLL_FLOOR_MS)
  })

  it('caps a ~44-minute split chapter at 20 minutes', () => {
    assert.equal(
      transcodePollBudget({ bytes: 40_000_000, durationSeconds: 44 * 60 }),
      TRANSCODE_POLL_CAP_MS,
    )
  })

  it('caps at 20 minutes', () => {
    assert.equal(
      transcodePollBudget({ bytes: 400_000_000, durationSeconds: 3 * 60 * 60 }),
      TRANSCODE_POLL_CAP_MS,
    )
  })
})

describe('transcodePollIntervalMs', () => {
  it('polls every 2s then 4s after the grace window', () => {
    assert.equal(transcodePollIntervalMs(0), TRANSCODE_POLL_FAST_INTERVAL_MS)
    assert.equal(transcodePollIntervalMs(TRANSCODE_STALL_GRACE_MS - 1), TRANSCODE_POLL_FAST_INTERVAL_MS)
    assert.equal(transcodePollIntervalMs(TRANSCODE_STALL_GRACE_MS), TRANSCODE_POLL_SLOW_INTERVAL_MS)
  })
})

describe('transcodeProgressKey / stall', () => {
  it('treats phase or percent changes as progress', () => {
    assert.notEqual(
      transcodeProgressKey('encoding', 40),
      transcodeProgressKey('encoding', 41),
    )
    assert.notEqual(
      transcodeProgressKey('uploading', 40),
      transcodeProgressKey('encoding', 40),
    )
  })

  it('does not stall during the 2-minute grace window', () => {
    assert.equal(
      transcodeShouldStall({ elapsedMs: TRANSCODE_STALL_GRACE_MS - 1, unchangedMs: TRANSCODE_STALL_MS }),
      false,
    )
  })

  it('stalls after grace plus 4 minutes unchanged', () => {
    assert.equal(
      transcodeShouldStall({ elapsedMs: TRANSCODE_STALL_GRACE_MS, unchangedMs: TRANSCODE_STALL_MS }),
      true,
    )
    assert.equal(
      transcodeShouldStall({ elapsedMs: TRANSCODE_STALL_GRACE_MS, unchangedMs: TRANSCODE_STALL_MS - 1 }),
      false,
    )
  })
})

describe('formatTranscodeGiveUpMessage', () => {
  it('includes part, percent, and elapsed minutes', () => {
    assert.equal(
      formatTranscodeGiveUpMessage({
        reason: 'timeout',
        title: 'Elmo',
        partLabel: '2/3',
        lastPercent: 61.4,
        elapsedMs: 12 * 60_000,
      }),
      'Yoto was still processing “Elmo” (2/3) at 61% after 12 minutes.',
    )
  })

  it('uses stall copy when progress froze', () => {
    assert.equal(
      formatTranscodeGiveUpMessage({
        reason: 'stall',
        partLabel: '3/3',
        elapsedMs: 6 * 60_000,
      }),
      'Yoto stopped making progress on part 3/3 after 6 minutes.',
    )
  })

  it('rounds elapsed time up to at least one minute', () => {
    assert.equal(formatElapsedMinutes(20_000), '1 minute')
  })
})

describe('transcodeRetryDecision', () => {
  it('does not re-PUT when percent is still moving (timeout)', () => {
    assert.deepEqual(
      transcodeRetryDecision({
        reason: 'timeout',
        alreadyRetried: false,
        newUploadUrl: 'https://upload.example/new',
        oldUploadId: 'old',
        newUploadId: 'new',
      }),
      { action: 'throw' },
    )
  })

  it('re-PUTs once on stall when Yoto issues a new upload URL', () => {
    assert.deepEqual(
      transcodeRetryDecision({
        reason: 'stall',
        alreadyRetried: false,
        newUploadUrl: 'https://upload.example/new',
        oldUploadId: 'old',
        newUploadId: 'new',
      }),
      { action: 'reput', uploadId: 'new' },
    )
  })

  it('keeps polling the same id when sha256 coalesces (null upload URL)', () => {
    assert.deepEqual(
      transcodeRetryDecision({
        reason: 'failed',
        alreadyRetried: false,
        newUploadUrl: null,
        oldUploadId: 'same',
        newUploadId: 'same',
      }),
      { action: 'extra-poll', uploadId: 'same' },
    )
  })

  it('caps at one retry per part', () => {
    assert.deepEqual(
      transcodeRetryDecision({
        reason: 'stall',
        alreadyRetried: true,
        newUploadUrl: 'https://upload.example/new',
        oldUploadId: 'old',
        newUploadId: 'new',
      }),
      { action: 'throw' },
    )
  })
})
