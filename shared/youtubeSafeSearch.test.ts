import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  normalizeYoutubeSafeSearch,
  YOUTUBE_SAFE_SEARCH_DEFAULT,
  YOUTUBE_SAFE_SEARCH_OPTIONS,
} from './youtubeSafeSearch.ts'

describe('normalizeYoutubeSafeSearch', () => {
  it('defaults empty and invalid values to moderate', () => {
    assert.equal(normalizeYoutubeSafeSearch(undefined), YOUTUBE_SAFE_SEARCH_DEFAULT)
    assert.equal(normalizeYoutubeSafeSearch(null), YOUTUBE_SAFE_SEARCH_DEFAULT)
    assert.equal(normalizeYoutubeSafeSearch(''), YOUTUBE_SAFE_SEARCH_DEFAULT)
    assert.equal(normalizeYoutubeSafeSearch('   '), YOUTUBE_SAFE_SEARCH_DEFAULT)
    assert.equal(normalizeYoutubeSafeSearch('invalid'), YOUTUBE_SAFE_SEARCH_DEFAULT)
  })

  it('accepts valid values case-insensitively', () => {
    assert.equal(normalizeYoutubeSafeSearch('none'), 'none')
    assert.equal(normalizeYoutubeSafeSearch('NONE'), 'none')
    assert.equal(normalizeYoutubeSafeSearch('moderate'), 'moderate')
    assert.equal(normalizeYoutubeSafeSearch('Moderate'), 'moderate')
    assert.equal(normalizeYoutubeSafeSearch('strict'), 'strict')
    assert.equal(normalizeYoutubeSafeSearch(' STRICT '), 'strict')
  })
})

describe('YOUTUBE_SAFE_SEARCH_OPTIONS', () => {
  it('exposes user-facing labels for each level', () => {
    assert.deepEqual(
      YOUTUBE_SAFE_SEARCH_OPTIONS.map(option => option.value),
      ['none', 'moderate', 'strict'],
    )
    assert.equal(YOUTUBE_SAFE_SEARCH_OPTIONS[1]?.label, 'Moderate')
  })
})
