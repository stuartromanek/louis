import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatDurationSeconds,
  formatYoutubeDurationIso,
  parseYoutubeDurationIso,
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
})
