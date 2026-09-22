import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldPlaySplashCue, splashCueLocalDay } from './splashCueDay.ts'

describe('splashCueDay', () => {
  it('formats the local calendar day as YYYY-MM-DD', () => {
    assert.equal(splashCueLocalDay(new Date(2026, 8, 22, 23, 59)), '2026-09-22')
    assert.equal(splashCueLocalDay(new Date(2026, 8, 23, 0, 1)), '2026-09-23')
  })

  it('plays when no day has been stored', () => {
    assert.equal(shouldPlaySplashCue({ storedDay: null, now: new Date(2026, 8, 22) }), true)
  })

  it('skips when the shout already played today', () => {
    const now = new Date(2026, 8, 22, 18)
    assert.equal(shouldPlaySplashCue({ storedDay: '2026-09-22', now }), false)
  })

  it('plays again on the next local day', () => {
    assert.equal(
      shouldPlaySplashCue({ storedDay: '2026-09-22', now: new Date(2026, 8, 23, 0, 1) }),
      true,
    )
  })

  it('always plays when forced, even if already heard today', () => {
    assert.equal(
      shouldPlaySplashCue({ force: true, storedDay: '2026-09-22', now: new Date(2026, 8, 22) }),
      true,
    )
  })
})
