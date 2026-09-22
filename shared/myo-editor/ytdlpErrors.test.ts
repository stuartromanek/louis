import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  backoffMsBeforeAttempt,
  classifyYtdlpStderr,
  formatYtdlpError,
  isHard403,
  playerClientForAttempt,
  ytdlpPlayerClientExtractorArgs,
  shouldEscalateToCookies,
  shouldRetryYtdlp,
  YTDLP_BOT_CLIENT_SWITCH_MS,
  YTDLP_COOKIE_FOLLOWUP_ATTEMPTS,
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
    assert.equal(
      classifyYtdlpStderr('ERROR: Sign in to confirm you\'re not a bot'),
      'bot_signin',
    )
    assert.equal(
      classifyYtdlpStderr('ERROR: Sign in to confirm youre not a bot'),
      'bot_signin',
    )
  })

  it('classifies yt-dlp cookies FAQ dump as bot_signin', () => {
    const faq = [
      'ERROR: [youtube] QAnco5_C1d0: Sign in to confirm youre not a bot.',
      'Use --cookies-from-browser or --cookies for the authentication.',
      'See https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp',
    ].join(' ')
    assert.equal(classifyYtdlpStderr(faq), 'bot_signin')
  })

  it('classifies private videos', () => {
    assert.equal(
      classifyYtdlpStderr('ERROR: [youtube] abc: Private video. Sign in if you\'ve been granted access'),
      'private',
    )
  })

  it('classifies age-restricted and members-only videos', () => {
    assert.equal(
      classifyYtdlpStderr('ERROR: Sign in to confirm your age'),
      'age_restricted',
    )
    assert.equal(
      classifyYtdlpStderr('ERROR: This video may be inappropriate for some users. Age-restricted video'),
      'age_restricted',
    )
    assert.equal(
      classifyYtdlpStderr('ERROR: This video is members-only'),
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

describe('shouldEscalateToCookies / isHard403', () => {
  it('detects hard 403', () => {
    assert.equal(isHard403('ERROR: HTTP Error 403: Forbidden'), true)
    assert.equal(isHard403('ERROR: HTTP Error 429: Too Many Requests'), false)
  })

  it('escalates bot, age, and hard 403 — not plain 429 or private', () => {
    assert.equal(shouldEscalateToCookies('bot_signin', ''), true)
    assert.equal(shouldEscalateToCookies('age_restricted', ''), true)
    assert.equal(
      shouldEscalateToCookies('retryable', 'ERROR: HTTP Error 403: Forbidden'),
      true,
    )
    assert.equal(
      shouldEscalateToCookies('retryable', 'ERROR: HTTP Error 429: Too Many Requests'),
      false,
    )
    assert.equal(shouldEscalateToCookies('private', ''), false)
    assert.equal(shouldEscalateToCookies('outdated', ''), false)
  })
})

describe('shouldRetryYtdlp', () => {
  it('retries retryable until max attempts', () => {
    assert.equal(shouldRetryYtdlp('retryable', 0), true)
    assert.equal(shouldRetryYtdlp('retryable', 2), true)
    assert.equal(shouldRetryYtdlp('retryable', YTDLP_MAX_ATTEMPTS - 1), false)
  })

  it('respects custom maxAttempts for cookie follow-ups', () => {
    const max = YTDLP_MAX_ATTEMPTS + YTDLP_COOKIE_FOLLOWUP_ATTEMPTS
    assert.equal(shouldRetryYtdlp('retryable', YTDLP_MAX_ATTEMPTS, { maxAttempts: max }), true)
    assert.equal(shouldRetryYtdlp('retryable', max - 1, { maxAttempts: max }), false)
  })

  it('allows only one alternate attempt for outdated', () => {
    assert.equal(shouldRetryYtdlp('outdated', 0), true)
    assert.equal(shouldRetryYtdlp('outdated', 1), false)
  })

  it('retries bot_signin without cookies; does not retry age_restricted', () => {
    assert.equal(shouldRetryYtdlp('bot_signin', 0), true)
    assert.equal(shouldRetryYtdlp('bot_signin', 2), true)
    assert.equal(shouldRetryYtdlp('bot_signin', YTDLP_MAX_ATTEMPTS - 1), false)
    assert.equal(shouldRetryYtdlp('age_restricted', 0), false)
  })

  it('retries bot_signin / age_restricted once using cookies', () => {
    assert.equal(shouldRetryYtdlp('bot_signin', 0, { usingCookies: true }), true)
    assert.equal(shouldRetryYtdlp('age_restricted', 1, { usingCookies: true }), true)
    assert.equal(
      shouldRetryYtdlp('bot_signin', YTDLP_MAX_ATTEMPTS - 1, { usingCookies: true }),
      false,
    )
  })

  it('does not retry availability or other', () => {
    assert.equal(shouldRetryYtdlp('private', 0), false)
    assert.equal(shouldRetryYtdlp('region_locked', 0), false)
    assert.equal(shouldRetryYtdlp('unavailable', 0), false)
    assert.equal(shouldRetryYtdlp('other', 0), false)
  })
})

describe('playerClientForAttempt / backoff', () => {
  it('starts with default client then android/ios/tv and reuses tv past schedule', () => {
    assert.equal(playerClientForAttempt(0), null)
    assert.equal(playerClientForAttempt(1), 'android')
    assert.equal(playerClientForAttempt(2), 'ios')
    assert.equal(playerClientForAttempt(3), 'tv')
    assert.equal(playerClientForAttempt(4), 'tv')
    assert.equal(playerClientForAttempt(5), 'tv')
  })

  it('returns backoff before retries only', () => {
    assert.equal(backoffMsBeforeAttempt(0), 0)
    assert.equal(backoffMsBeforeAttempt(1), 1000)
    assert.equal(backoffMsBeforeAttempt(2), 3000)
    assert.equal(backoffMsBeforeAttempt(3), 8000)
    assert.equal(backoffMsBeforeAttempt(5), 8000)
  })

  it('uses a short pause when the previous error was a bot check', () => {
    assert.equal(backoffMsBeforeAttempt(1, 'bot_signin'), YTDLP_BOT_CLIENT_SWITCH_MS)
    assert.equal(backoffMsBeforeAttempt(3, 'bot_signin'), YTDLP_BOT_CLIENT_SWITCH_MS)
    assert.equal(backoffMsBeforeAttempt(1, 'retryable'), 1000)
    assert.equal(backoffMsBeforeAttempt(0, 'bot_signin'), 0)
  })

  it('omits player_client when cookies are set so android/ios are not skipped', () => {
    assert.deepEqual(ytdlpPlayerClientExtractorArgs('android', false), [
      '--extractor-args',
      'youtube:player_client=android',
    ])
    assert.deepEqual(ytdlpPlayerClientExtractorArgs('ios', true), [])
    assert.deepEqual(ytdlpPlayerClientExtractorArgs('android', true), [])
    assert.deepEqual(ytdlpPlayerClientExtractorArgs(null, false), [])
    assert.deepEqual(ytdlpPlayerClientExtractorArgs(null, true), [])
  })
})

describe('formatYtdlpError', () => {
  it('maps 403 to friendly blocked message', () => {
    const msg = formatYtdlpError(
      'ERROR: [youtube] NCtzkaL2t_Y: Unable to download video data: HTTP Error 403: Forbidden',
      'NCtzkaL2t_Y',
    )
    assert.match(msg, /HTTP 403/)
    assert.match(msg, /cookies\.txt/)
    assert.doesNotMatch(msg, /NCtzkaL2t_Y/)
  })

  it('maps 403 after cookies to a re-export hint', () => {
    const msg = formatYtdlpError(
      'ERROR: HTTP Error 403: Forbidden',
      'abc',
      { cookiesTried: true },
    )
    assert.match(msg, /HTTP 403/)
    assert.match(msg, /Re-export cookies\.txt/)
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

  it('maps bot check to Settings cookies copy without yt-dlp wiki dump', () => {
    const faq = [
      'ERROR: [youtube] QAnco5_C1d0: Sign in to confirm youre not a bot.',
      'Use --cookies-from-browser or --cookies for the authentication.',
      'See https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp',
    ].join(' ')
    const msg = formatYtdlpError(faq, 'QAnco5_C1d0')
    assert.match(msg, /Settings → Advanced/)
    assert.match(msg, /cookies\.txt/)
    assert.doesNotMatch(msg, /cookies-from-browser/)
    assert.doesNotMatch(msg, /github\.com/)
    assert.doesNotMatch(msg, /QAnco5_C1d0/)
  })

  it('maps bot check after cookies to a re-export hint', () => {
    const msg = formatYtdlpError(
      'ERROR: Sign in to confirm you’re not a bot',
      'abc',
      { cookiesTried: true },
    )
    assert.match(msg, /Re-export cookies\.txt/)
    assert.match(msg, /download/)
  })

  it('maps lookup bot check with lookup wording', () => {
    const msg = formatYtdlpError(
      'ERROR: Sign in to confirm you’re not a bot',
      'discovery',
      { kind: 'lookup' },
    )
    assert.match(msg, /blocked this lookup/)
    assert.match(msg, /Settings → Advanced/)
  })

  it('maps missing JS runtime (GUI PATH) before generic unavailable', () => {
    const stderr = [
      'WARNING: [youtube] No supported JavaScript runtime could be found. Only deno is enabled by default',
      'ERROR: [youtube] abc: This video is not available',
    ].join('\n')
    assert.match(formatYtdlpError(stderr, 'abc'), /no JavaScript runtime/)
  })

  it('maps ENOSPC / Errno 28 to a host-disk message, not playlist capacity', () => {
    const ytdlp = formatYtdlpError(
      'ERROR: [youtube] vSYadh2xmcI: unable to write data: [Errno 28] No space left on device',
      'vSYadh2xmcI',
    )
    assert.match(ytdlp, /audio folder/)
    assert.match(ytdlp, /tracks\/time meters/)
    assert.doesNotMatch(ytdlp, /vSYadh2xmcI/)
    assert.doesNotMatch(ytdlp, /Errno 28/)

    const nodeCopy = formatYtdlpError(
      "ENOSPC: no space left on device, copyfile '/data/audio/jobs/x.m4a'",
      'raWnI3FfJ90',
    )
    assert.match(nodeCopy, /\/data\/audio/)
    assert.doesNotMatch(nodeCopy, /raWnI3FfJ90/)
  })
})
