import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseFfmpegDuration, ffmpegTimeoutMs, FFMPEG_TIMEOUT_FLOOR_MS, FFMPEG_TIMEOUT_CAP_MS } from './ffmpeg-split.ts'

const SAMPLE = `
Input #0, mov,mp4,aac, from 'cache/save/abc.m4a':
  Duration: 01:10:05.12, start: 0.000000, bitrate: 131 kb/s
    Stream #0:0(und): Audio: aac (LC), 44100 Hz, stereo
`

describe('parseFfmpegDuration', () => {
  it('reads hours, minutes, and fractional seconds', () => {
    assert.equal(parseFfmpegDuration(SAMPLE), 3600 + 10 * 60 + 5.12)
  })

  it('returns null when Duration is missing', () => {
    assert.equal(parseFfmpegDuration('no duration here'), null)
  })
})

describe('ffmpegTimeoutMs', () => {
  it('uses the 10-minute floor when duration is unknown', () => {
    assert.equal(ffmpegTimeoutMs(), FFMPEG_TIMEOUT_FLOOR_MS)
    assert.equal(ffmpegTimeoutMs(0), FFMPEG_TIMEOUT_FLOOR_MS)
  })

  it('scales with duration for a ~45-minute AAC encode', () => {
    const timeout = ffmpegTimeoutMs(45 * 60)
    assert.ok(timeout > FFMPEG_TIMEOUT_FLOOR_MS)
    assert.ok(timeout < FFMPEG_TIMEOUT_CAP_MS)
    assert.equal(timeout, 45 * 90_000)
  })

  it('caps very long loudnorm jobs', () => {
    assert.equal(ffmpegTimeoutMs(5 * 60 * 60), FFMPEG_TIMEOUT_CAP_MS)
  })
})
