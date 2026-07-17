import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { YOTO_MYO_MAX_TRACK_SECONDS } from './yotoMyoLimits.ts'
import {
  formatDurationSeconds,
  formatYoutubeDurationIso,
  isOverMyoTrackDuration,
  parseYoutubeDurationIso,
  YOTO_MYO_OVER_TRACK_DURATION_FOOTER,
  YOTO_MYO_OVER_TRACK_DURATION_MESSAGE,
  YOTO_MYO_OVER_TRACK_DURATION_TOOLTIP,
} from './youtubeDuration.ts'

describe('parseYoutubeDurationIso', () => {
  it('parses seconds-only', () => {
    assert.equal(parseYoutubeDurationIso('PT15S'), 15)
  })

  it('parses hours-only', () => {
    assert.equal(parseYoutubeDurationIso('PT1H'), 3600)
  })

  it('parses mixed components', () => {
    assert.equal(parseYoutubeDurationIso('PT1H2M3S'), 3723)
  })

  it('parses minutes and seconds', () => {
    assert.equal(parseYoutubeDurationIso('PT3M42S'), 222)
  })

  it('rejects invalid and empty values', () => {
    assert.equal(parseYoutubeDurationIso(''), null)
    assert.equal(parseYoutubeDurationIso('PT'), null)
    assert.equal(parseYoutubeDurationIso('1H2M'), null)
    assert.equal(parseYoutubeDurationIso('nonsense'), null)
  })
})

describe('isOverMyoTrackDuration', () => {
  it('allows durations at the MYO limit', () => {
    assert.equal(isOverMyoTrackDuration(YOTO_MYO_MAX_TRACK_SECONDS), false)
  })

  it('flags durations over the MYO limit', () => {
    assert.equal(isOverMyoTrackDuration(YOTO_MYO_MAX_TRACK_SECONDS + 1), true)
  })
})

describe('formatDurationSeconds / formatYoutubeDurationIso', () => {
  it('formats under an hour as m:ss', () => {
    assert.equal(formatDurationSeconds(222), '3:42')
  })

  it('formats over an hour as h:mm:ss', () => {
    assert.equal(formatDurationSeconds(3723), '1:02:03')
  })

  it('formats ISO via parse', () => {
    assert.equal(formatYoutubeDurationIso('PT1H5M'), '1:05:00')
  })

  it('exposes over-limit copy', () => {
    assert.match(YOTO_MYO_OVER_TRACK_DURATION_MESSAGE, /Over 1 hour/)
    assert.match(YOTO_MYO_OVER_TRACK_DURATION_FOOTER, /over an hour/)
    assert.match(YOTO_MYO_OVER_TRACK_DURATION_TOOLTIP, /max length of 1 hour/)
  })
})
