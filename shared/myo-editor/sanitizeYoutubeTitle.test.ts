import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sanitizeYoutubeTitle } from './sanitizeYoutubeTitle.ts'

describe('sanitizeYoutubeTitle', () => {
  it('strips official video / audio / lyrics tags', () => {
    assert.equal(
      sanitizeYoutubeTitle('Good Vibrations (Official Music Video)'),
      'Good Vibrations',
    )
    assert.equal(
      sanitizeYoutubeTitle('Surfin\' USA [Official Audio]'),
      'Surfin\' USA',
    )
    assert.equal(
      sanitizeYoutubeTitle('Wouldn\'t It Be Nice (Lyrics)'),
      'Wouldn\'t It Be Nice',
    )
  })

  it('strips quality and Topic suffixes', () => {
    assert.equal(sanitizeYoutubeTitle('Song Title [HD] [4K]'), 'Song Title')
    assert.equal(sanitizeYoutubeTitle('The Beach Boys - Topic'), 'The Beach Boys')
    assert.equal(sanitizeYoutubeTitle('Artist Name | Topic'), 'Artist Name')
  })

  it('strips HTML and control characters', () => {
    assert.equal(sanitizeYoutubeTitle('Hello <b>World</b>'), 'Hello World')
    assert.equal(sanitizeYoutubeTitle('Clean\u0000Title'), 'CleanTitle')
  })

  it('collapses spaces and trims', () => {
    assert.equal(sanitizeYoutubeTitle('  Too   many   spaces  '), 'Too many spaces')
  })

  it('enforces max length', () => {
    const long = `${'a'.repeat(120)} (Official Video)`
    const cleaned = sanitizeYoutubeTitle(long)
    assert.equal(cleaned.length, 100)
    assert.ok(!cleaned.includes('Official'))
  })
})
