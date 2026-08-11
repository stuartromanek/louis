import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUNDLED_YOTO_CLIENT_ID } from './bundledYotoClientId.mjs'

describe('BUNDLED_YOTO_CLIENT_ID', () => {
  it('exports a non-empty public PKCE client id string', () => {
    assert.equal(typeof BUNDLED_YOTO_CLIENT_ID, 'string')
    assert.ok(BUNDLED_YOTO_CLIENT_ID.trim().length > 0)
    assert.equal(BUNDLED_YOTO_CLIENT_ID, BUNDLED_YOTO_CLIENT_ID.trim())
  })
})
