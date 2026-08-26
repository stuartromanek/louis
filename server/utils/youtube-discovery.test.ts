import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isRecoverableYoutubeApiError } from './youtube.ts'

describe('isRecoverableYoutubeApiError', () => {
  it('treats quota and upstream failures as recoverable', () => {
    assert.equal(isRecoverableYoutubeApiError({ statusCode: 403 }), true)
    assert.equal(isRecoverableYoutubeApiError({ statusCode: 502 }), true)
    assert.equal(isRecoverableYoutubeApiError({ statusCode: 503 }), true)
  })

  it('does not fall back on client or not-found errors', () => {
    assert.equal(isRecoverableYoutubeApiError({ statusCode: 400 }), false)
    assert.equal(isRecoverableYoutubeApiError({ statusCode: 404 }), false)
    assert.equal(isRecoverableYoutubeApiError(new Error('nope')), false)
  })
})
