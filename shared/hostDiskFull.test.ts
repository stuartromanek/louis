import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  HOST_DISK_FULL_MESSAGE,
  hostDiskFullMessageIfMatch,
  isHostDiskFullError,
  looksLikeHostDiskFull,
} from './hostDiskFull.ts'

describe('hostDiskFull', () => {
  it('detects yt-dlp Errno 28', () => {
    const text = 'unable to write data: [Errno 28] No space left on device'
    assert.equal(looksLikeHostDiskFull(text), true)
    assert.equal(hostDiskFullMessageIfMatch(text), HOST_DISK_FULL_MESSAGE)
  })

  it('detects Node copyfile ENOSPC', () => {
    const text = "ENOSPC: no space left on device, copyfile '/data/audio/jobs/x.m4a' → '/data/audio/cache/save/x.m4a'"
    assert.equal(looksLikeHostDiskFull(text), true)
    assert.match(HOST_DISK_FULL_MESSAGE, /tracks\/time meters/)
    assert.match(HOST_DISK_FULL_MESSAGE, /\/data\/audio/)
  })

  it('detects a Node error with code ENOSPC', () => {
    const err = Object.assign(new Error('no space left on device'), { code: 'ENOSPC' })
    assert.equal(isHostDiskFullError(err), true)
  })

  it('leaves unrelated errors alone', () => {
    assert.equal(looksLikeHostDiskFull('HTTP Error 403: Forbidden'), false)
    assert.equal(hostDiskFullMessageIfMatch('This playlist exceeds Yoto’s 5-hour / 500 MB playlist limit.'), null)
    assert.equal(isHostDiskFullError(new Error('Video unavailable')), false)
  })
})
