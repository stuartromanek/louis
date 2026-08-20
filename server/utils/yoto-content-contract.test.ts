import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isUncertainCreatePostError,
  requireCreatedCardId,
  withContentCardId,
} from './yoto-content-contract.ts'

describe('Yoto content create contract', () => {
  it('omits cardId for create and includes it for update', () => {
    assert.deepEqual(
      withContentCardId('create', undefined, { title: 'New playlist' }),
      { title: 'New playlist' },
    )
    assert.deepEqual(
      withContentCardId('update', 'existing-card', { title: 'Existing playlist' }),
      { title: 'Existing playlist', cardId: 'existing-card' },
    )
  })

  it('requires the official card.cardId create response', () => {
    assert.equal(
      requireCreatedCardId({ card: { cardId: 'created-card' } }),
      'created-card',
    )
    assert.throws(
      () => requireCreatedCardId({}),
      /It may already exist; check Playlists before trying again/,
    )
    assert.throws(
      () => requireCreatedCardId({
        card: { cardId: 'created-card' },
        cardId: 'different-card',
      }),
      /conflicting card IDs/,
    )
  })

  it('treats transport-like final create failures as uncertain', () => {
    assert.equal(isUncertainCreatePostError(new TypeError('fetch failed')), true)
    assert.equal(isUncertainCreatePostError({ statusCode: 408 }), true)
    assert.equal(isUncertainCreatePostError({ statusCode: 502 }), true)
  })

  it('keeps explicit Yoto rejections retryable', () => {
    assert.equal(isUncertainCreatePostError({ statusCode: 400 }), false)
    assert.equal(isUncertainCreatePostError({ statusCode: 401 }), false)
    assert.equal(isUncertainCreatePostError({ statusCode: 403 }), false)
    assert.equal(isUncertainCreatePostError({ statusCode: 429 }), false)
  })
})
