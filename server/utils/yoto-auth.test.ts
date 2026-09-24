import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decideYotoAccess, YOTO_SCOPES } from './yoto-auth.ts'

function accessInput(overrides: Partial<Parameters<typeof decideYotoAccess>[0]> = {}) {
  return {
    cookieAccess: '',
    cookieRefresh: '',
    sessionAccess: '',
    sessionRefresh: '',
    sessionExpired: false,
    preferSession: false,
    ...overrides,
  }
}

describe('YOTO_SCOPES', () => {
  it('requests offline_access so Yoto returns a refresh token', () => {
    assert.match(YOTO_SCOPES, /\boffline_access\b/)
    assert.match(YOTO_SCOPES, /\buser:content:manage\b/)
  })
})

describe('decideYotoAccess', () => {
  it('uses a live access cookie without refreshing', () => {
    assert.deepEqual(
      decideYotoAccess(accessInput({
        cookieAccess: 'cookie-at',
        sessionAccess: 'session-at',
        sessionRefresh: 'rt',
      })),
      { action: 'use', accessToken: 'cookie-at' },
    )
  })

  it('uses a non-expired desktop session access token', () => {
    assert.deepEqual(
      decideYotoAccess(accessInput({
        sessionAccess: 'session-at',
        sessionRefresh: 'rt',
      })),
      { action: 'use', accessToken: 'session-at' },
    )
  })

  it('refreshes when the access cookie is gone and the desktop session is expired', () => {
    assert.deepEqual(
      decideYotoAccess(accessInput({
        sessionAccess: 'stale-at',
        sessionExpired: true,
        sessionRefresh: 'rt',
      })),
      { action: 'refresh', refreshToken: 'rt' },
    )
  })

  it('treats expired desktop access without a refresh token as expired', () => {
    assert.deepEqual(
      decideYotoAccess(accessInput({
        sessionAccess: 'stale-at',
        sessionExpired: true,
      })),
      { action: 'expired' },
    )
  })

  it('prefers the desktop session access token over an Electron cookie', () => {
    assert.deepEqual(
      decideYotoAccess(accessInput({
        cookieAccess: 'old-cookie-at',
        cookieRefresh: 'old-cookie-rt',
        sessionAccess: 'desktop-at',
        sessionRefresh: 'desktop-rt',
        preferSession: true,
      })),
      { action: 'use', accessToken: 'desktop-at' },
    )
  })

  it('refreshes the desktop session instead of using an old Electron cookie', () => {
    assert.deepEqual(
      decideYotoAccess(accessInput({
        cookieAccess: 'old-cookie-at',
        cookieRefresh: 'old-cookie-rt',
        sessionAccess: 'stale-desktop-at',
        sessionRefresh: 'desktop-rt',
        sessionExpired: true,
        preferSession: true,
      })),
      { action: 'refresh', refreshToken: 'desktop-rt' },
    )
  })

  it('falls back to cookies when no desktop session credentials exist', () => {
    assert.deepEqual(
      decideYotoAccess(accessInput({
        cookieAccess: 'cookie-at',
        cookieRefresh: 'cookie-rt',
        preferSession: true,
      })),
      { action: 'use', accessToken: 'cookie-at' },
    )
  })

  it('is disconnected with no credentials', () => {
    assert.deepEqual(
      decideYotoAccess(accessInput()),
      { action: 'disconnected' },
    )
  })
})
