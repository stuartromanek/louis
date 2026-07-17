import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  backoffMsBeforeAttempt,
  classifyYtdlpStderr,
  formatYtdlpError,
  playerClientForAttempt,
  shouldRetryYtdlp,
  YTDLP_MAX_ATTEMPTS,
} from './ytdlpErrors.ts'

describe('classifyYtdlpStderr', () => {
  it('classifies HTTP 403 as retryable', () => {
    assert.equal(
      classifyYtdlpStderr('ERROR: [youtube] abc: Unable to download video data: HTTP Error 403: Forbidden'),
      'retryable',
    )
  })

  it('classifies 429 / rate limit as retryable', () => {
    assert.equal(
      classifyYtdlpStderr('ERROR: Unable to download webpage: HTTP Error 429: Too Many Requests'),
      'retryable',
    )
  })

  it('classifies connection reset as retryable', () => {
    assert.equal(classifyYtdlpStderr('ERROR: Connection reset by peer'), 'retryable')
  })

  it('classifies nsig / format issues as outdated', () => {
    assert.equal(classifyYtdlpStderr('WARNING: nsig extraction failed\nERROR: Requested format is not available'), 'outdated')
    assert.equal(classifyYtdlpStderr('ERROR: Only images are available'), 'outdated')
  })

  it('classifies bot sign-in as bot_signin', () => {
    assert.equal(
      classifyYtdlpStderr('ERROR: Sign in to confirm you’re not a bot'),
      'bot_signin',
    )
  })

  it('classifies private videos', () => {
    assert.equal(
      classifyYtdlpStderr('ERROR: [youtube] abc: Private video. Sign in if you\'ve been granted access'),
      'private',
    )
  })

  it('classifies age-restricted videos', () => {
    assert.equal(
      classifyYtdlpStderr('ERROR: Sign in to confirm your age'),
      'age_restricted',
    )
    assert.equal(
      classifyYtdlpStderr('ERROR: This video may be inappropriate for some users. Age-restricted video'),
      'age_restricted',
    )
  })

  it('classifies region-locked videos', () => {
    assert.equal(
      classifyYtdlpStderr('ERROR: The uploader has not made this video available in your country'),
      'region_locked',
    )
    assert.equal(
      classifyYtdlpStderr('ERROR: Video unavailable. This video is blocked in your country'),
      'region_locked',
    )
  })

  it('classifies unavailable videos', () => {
    assert.equal(
      classifyYtdlpStderr('ERROR: [youtube] abc: Video unavailable'),
      'unavailable',
    )
    assert.equal(
      classifyYtdlpStderr('ERROR: This video is no longer available'),
      'unavailable',
    )
  })

  it('classifies unknown ERROR as other', () => {
    assert.equal(classifyYtdlpStderr('ERROR: something mysterious happened'), 'other')
  })
})

describe('shouldRetryYtdlp', () => {
  it('retries retryable until max attempts', () => {
    assert.equal(shouldRetryYtdlp('retryable', 0), true)
    assert.equal(shouldRetryYtdlp('retryable', 2), true)
    assert.equal(shouldRetryYtdlp('retryable', YTDLP_MAX_ATTEMPTS - 1), false)
  })

  it('allows only one alternate attempt for outdated', () => {
    assert.equal(shouldRetryYtdlp('outdated', 0), true)
    assert.equal(shouldRetryYtdlp('outdated', 1), false)
  })

  it('does not retry bot_signin, availability, or other', () => {
    assert.equal(shouldRetryYtdlp('bot_signin', 0), false)
    assert.equal(shouldRetryYtdlp('private', 0), false)
    assert.equal(shouldRetryYtdlp('age_restricted', 0), false)
    assert.equal(shouldRetryYtdlp('region_locked', 0), false)
    assert.equal(shouldRetryYtdlp('unavailable', 0), false)
    assert.equal(shouldRetryYtdlp('other', 0), false)
  })
})

describe('playerClientForAttempt / backoff', () => {
  it('starts with default client then android/ios/tv', () => {
    assert.equal(playerClientForAttempt(0), null)
    assert.equal(playerClientForAttempt(1), 'android')
    assert.equal(playerClientForAttempt(2), 'ios')
    assert.equal(playerClientForAttempt(3), 'tv')
  })

  it('returns backoff before retries only', () => {
    assert.equal(backoffMsBeforeAttempt(0), 0)
    assert.equal(backoffMsBeforeAttempt(1), 1000)
    assert.equal(backoffMsBeforeAttempt(2), 3000)
    assert.equal(backoffMsBeforeAttempt(3), 8000)
  })
})

describe('formatYtdlpError', () => {
  it('maps 403 to friendly blocked message', () => {
    const msg = formatYtdlpError(
      'ERROR: [youtube] NCtzkaL2t_Y: Unable to download video data: HTTP Error 403: Forbidden',
      'NCtzkaL2t_Y',
    )
    assert.match(msg, /HTTP 403/)
    assert.match(msg, /NCtzkaL2t_Y/)
  })

  it('maps outdated extractor signal', () => {
    const msg = formatYtdlpError('ERROR: Only images are available', 'abc')
    assert.match(msg, /outdated/)
  })

  it('maps private / age / region / unavailable', () => {
    assert.match(
      formatYtdlpError('ERROR: Private video', 'priv1'),
      /priv1 is private/,
    )
    assert.match(
      formatYtdlpError('ERROR: Sign in to confirm your age', 'age1'),
      /age1 is age-restricted/,
    )
    assert.match(
      formatYtdlpError('ERROR: not available in your country', 'geo1'),
      /geo1 is not available in this region/,
    )
    assert.match(
      formatYtdlpError('ERROR: Video unavailable', 'gone1'),
      /gone1 is unavailable/,
    )
  })
})
