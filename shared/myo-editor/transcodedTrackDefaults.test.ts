import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  normalizeYotoAudioFormat,
  yotoChannelsOrStereo,
} from './transcodedTrackDefaults.ts'

describe('transcodedTrackDefaults', () => {
  it('defaults missing format to opus and channels to stereo', () => {
    // Mirrors TranscodedAudioResult.transcodedInfo without format/channels
    assert.equal(normalizeYotoAudioFormat(undefined), 'opus')
    assert.equal(yotoChannelsOrStereo(undefined), 'stereo')
  })

  it('normalizes ogg/opus aliases to opus', () => {
    assert.equal(normalizeYotoAudioFormat('ogg'), 'opus')
    assert.equal(normalizeYotoAudioFormat('Opus'), 'opus')
    assert.equal(normalizeYotoAudioFormat('mp3'), 'mp3')
  })

  it('maps numeric channels when present', () => {
    assert.equal(yotoChannelsOrStereo(2), 'stereo')
    assert.equal(yotoChannelsOrStereo(1), 'mono')
  })
})
