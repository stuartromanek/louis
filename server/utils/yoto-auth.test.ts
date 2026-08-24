import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decideYotoAccess, YOTO_SCOPES } from './yoto-auth.ts'

describe('YOTO_SCOPES', () => {
  it('requests offline_access so Yoto returns a refresh token', () => {
    assert.match(YOTO_SCOPES, /\boffline_access\b/)
    assert.match(YOTO_SCOPES, /\buser:content:manage\b/)
  })
})

describe('decideYotoAccess', () => {
  it('uses a live access cookie without refreshing', () => {
    assert.deepEqual(
      decideYotoAccess({
        cookieAccess: 'cookie-at',
        sessionAccess: 'session-at',
        sessionExpired: false,
        refreshToken: 'rt',
      }),
      { action: 'use', accessToken: 'cookie-at' },
    )
  })

  it('uses a non-expired desktop session access token', () => {
    assert.deepEqual(
      decideYotoAccess({
        cookieAccess: '',
        sessionAccess: 'session-at',
        sessionExpired: false,
        refreshToken: 'rt',
      }),
      { action: 'use', accessToken: 'session-at' },
    )
  })

  it('refreshes when the access cookie is gone and the desktop session is expired', () => {
    assert.deepEqual(
      decideYotoAccess({
        cookieAccess: '',
        sessionAccess: 'stale-at',
        sessionExpired: true,
        refreshToken: 'rt',
      }),
      { action: 'refresh', refreshToken: 'rt' },
    )
  })

  it('treats expired desktop access without a refresh token as expired', () => {
    assert.deepEqual(
      decideYotoAccess({
        cookieAccess: '',
        sessionAccess: 'stale-at',
        sessionExpired: true,
        refreshToken: '',
      }),
      { action: 'expired' },
    )
  })

  it('is disconnected with no credentials', () => {
    assert.deepEqual(
      decideYotoAccess({
        cookieAccess: '',
        sessionAccess: '',
        sessionExpired: false,
        refreshToken: '',
      }),
      { action: 'disconnected' },
    )
  })
})
