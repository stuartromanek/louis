import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mediaUrlFromCoverResponse } from './yoto-cover-parse.ts'

describe('yoto-cover', () => {
  it('reads mediaUrl from the official coverImage wrapper', () => {
    assert.equal(
      mediaUrlFromCoverResponse({
        coverImage: { mediaUrl: 'https://cdn.yoto.io/cover.png' },
      }),
      'https://cdn.yoto.io/cover.png',
    )
  })

  it('falls back to top-level mediaUrl and ignores empty strings', () => {
    assert.equal(
      mediaUrlFromCoverResponse({ mediaUrl: 'https://cdn.yoto.io/alt.png' }),
      'https://cdn.yoto.io/alt.png',
    )
    assert.equal(
      mediaUrlFromCoverResponse({ coverImage: { mediaUrl: '  ' }, url: 'https://cdn.yoto.io/url.png' }),
      'https://cdn.yoto.io/url.png',
    )
    assert.equal(mediaUrlFromCoverResponse({}), null)
    assert.equal(mediaUrlFromCoverResponse(null), null)
  })
})
