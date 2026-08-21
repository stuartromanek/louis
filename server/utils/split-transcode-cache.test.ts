import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  readSplitPartTranscodeCache,
  splitPartCachePath,
  shouldSkipSplitSourceDownload,
  transcodedFromSplitCache,
  writeSplitPartTranscodeCache,
} from './split-transcode-cache.ts'

const KEY = {
  youtubeId: 'dQw4w9wgXcQ',
  index: 1,
  count: 3,
  normalizeVolume: true,
  startSeconds: 2640,
  durationSeconds: 2640,
}

const RESULT = {
  transcodedSha256: 'abc123def',
  transcodedInfo: {
    duration: 2640,
    fileSize: 40_000_000,
    format: 'opus',
    channels: 2,
  },
}

describe('split-transcode-cache', () => {
  it('round-trips a transcoded hash under the save cache dir', async () => {
    const audioWorkDir = await mkdtemp(path.join(os.tmpdir(), 'louis-split-cache-'))
    try {
      await writeSplitPartTranscodeCache(audioWorkDir, KEY, RESULT, 'source-sha')
      const record = await readSplitPartTranscodeCache(audioWorkDir, KEY)
      assert.equal(record?.transcodedSha256, RESULT.transcodedSha256)
      assert.equal(record?.transcodedInfo.duration, 2640)
      assert.equal(record?.sourceSha256, 'source-sha')
      assert.ok(splitPartCachePath(audioWorkDir, KEY).includes('cache/save/'))
    }
    finally {
      await rm(audioWorkDir, { recursive: true, force: true })
    }
  })

  it('skips upload on cache hit', () => {
    const hit = transcodedFromSplitCache({
      ...KEY,
      transcodedSha256: RESULT.transcodedSha256,
      transcodedInfo: RESULT.transcodedInfo,
      cachedAt: 1,
    })
    assert.deepEqual(hit, RESULT)
  })

  it('misses when the split cut changed', async () => {
    const audioWorkDir = await mkdtemp(path.join(os.tmpdir(), 'louis-split-cache-'))
    try {
      await writeSplitPartTranscodeCache(audioWorkDir, KEY, RESULT, 'source-sha')
      assert.equal(
        await readSplitPartTranscodeCache(audioWorkDir, {
          ...KEY,
          startSeconds: 0,
        }),
        null,
      )
    }
    finally {
      await rm(audioWorkDir, { recursive: true, force: true })
    }
  })

  it('returns null when the cache file is missing', async () => {
    const audioWorkDir = await mkdtemp(path.join(os.tmpdir(), 'louis-split-cache-'))
    try {
      assert.equal(await readSplitPartTranscodeCache(audioWorkDir, KEY), null)
    }
    finally {
      await rm(audioWorkDir, { recursive: true, force: true })
    }
  })

  it('misses when the source hash no longer matches', async () => {
    const audioWorkDir = await mkdtemp(path.join(os.tmpdir(), 'louis-split-cache-'))
    try {
      await writeSplitPartTranscodeCache(audioWorkDir, KEY, RESULT, 'source-sha')
      assert.equal(
        await readSplitPartTranscodeCache(audioWorkDir, KEY, 'other-sha'),
        null,
      )
      const hit = await readSplitPartTranscodeCache(audioWorkDir, KEY, 'source-sha')
      assert.equal(hit?.transcodedSha256, RESULT.transcodedSha256)
    }
    finally {
      await rm(audioWorkDir, { recursive: true, force: true })
    }
  })

  it('skips download only when every part has a cache hit', () => {
    assert.equal(shouldSkipSplitSourceDownload([RESULT, RESULT, RESULT]), true)
    assert.equal(shouldSkipSplitSourceDownload([RESULT, null, RESULT]), false)
    assert.equal(shouldSkipSplitSourceDownload([]), false)
  })
})
