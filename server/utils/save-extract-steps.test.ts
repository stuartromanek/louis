import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EMPTY_CARD_DETAIL,
  buildSavePlan,
} from '../../shared/myo-editor/buildSavePlan.ts'
import { applySourceTrimAndSplit } from '../../shared/myo-editor/splitTrack.ts'
import type { PlaylistTrack, TranscodedAudioResult } from '../../shared/myo-editor/types.ts'
import {
  extractCutCacheKey,
  planYoutubeGroupExtract,
} from './save-extract-steps.ts'

function youtubeTrack(overrides: Partial<PlaylistTrack> = {}): PlaylistTrack {
  return {
    id: 'yt-1',
    title: 'Baby',
    subtitle: '',
    thumbnailUrl: '',
    source: 'app-youtube',
    youtubeId: 'abc123',
    duration: 120,
    ...overrides,
  }
}

function splitPart(index: number, count = 2, durationSeconds = 1800): PlaylistTrack {
  return youtubeTrack({
    id: `abc123#p${index}`,
    title: `Baby (Part ${index + 1})`,
    duration: durationSeconds,
    split: {
      groupId: 'abc123',
      index,
      count,
      startSeconds: index * durationSeconds,
      durationSeconds,
    },
  })
}

function fakeTranscoded(sha = 'cached-sha'): TranscodedAudioResult {
  return {
    transcodedSha256: sha,
    transcodedInfo: { duration: 1800, fileSize: 1 },
  }
}

describe('planYoutubeGroupExtract', () => {
  it('loudnorms the full file for an unsplit normalize with no cut', () => {
    const track = youtubeTrack()
    const plan = planYoutubeGroupExtract({
      youtubeId: 'abc123',
      tracks: [track],
      normalizeVolume: true,
    })
    assert.equal(plan.shouldCut, false)
    assert.equal(plan.skipDownload, false)
    assert.equal(plan.loudnormFullFile, true)
    assert.equal(plan.parts.length, 1)
    assert.equal(plan.parts[0]?.cut, null)
    assert.equal(plan.parts[0]?.loudnormPart, false)
    assert.equal(plan.parts[0]?.upload, true)
  })

  it('cuts via trim and loudnorms the part for an unsplit trim plus normalize', () => {
    const track = youtubeTrack({
      duration: 120,
      trim: { startSeconds: 5, endSeconds: 40 },
    })
    const plan = planYoutubeGroupExtract({
      youtubeId: 'abc123',
      tracks: [track],
      normalizeVolume: true,
      actualDuration: 120,
    })
    assert.equal(plan.shouldCut, true)
    assert.equal(plan.loudnormFullFile, false)
    assert.deepEqual(plan.parts[0]?.cut, { startSeconds: 5, durationSeconds: 35 })
    assert.equal(plan.parts[0]?.cutVia, 'trim')
    assert.equal(plan.parts[0]?.loudnormPart, true)
    assert.equal(plan.parts[0]?.upload, true)
  })

  it('loudnorms each part after split cuts, not the full file', () => {
    const tracks = [splitPart(0), splitPart(1)]
    const plan = planYoutubeGroupExtract({
      youtubeId: 'abc123',
      tracks,
      normalizeVolume: true,
      actualDuration: 3600,
    })
    assert.equal(plan.shouldCut, true)
    assert.equal(plan.loudnormFullFile, false)
    assert.equal(plan.parts.length, 2)
    assert.equal(plan.parts.every(part => part.cutVia === 'split'), true)
    assert.equal(plan.parts.every(part => part.loudnormPart), true)
    assert.deepEqual(plan.parts[0]?.cut, { startSeconds: 0, durationSeconds: 1800 })
    assert.deepEqual(plan.parts[1]?.cut, { startSeconds: 1800, durationSeconds: 1800 })
  })

  it('uses keep-relative split starts after trim plus split', () => {
    const source = youtubeTrack({
      id: 'concert',
      youtubeId: 'concert',
      title: 'Concert',
      duration: 5400,
    })
    const tracks = applySourceTrimAndSplit(
      source,
      { startSeconds: 600, endSeconds: 4800 },
      5400,
    )
    const plan = planYoutubeGroupExtract({
      youtubeId: 'concert',
      tracks,
      normalizeVolume: false,
      actualDuration: 5400,
    })
    assert.ok(tracks.length >= 2)
    assert.equal(plan.shouldCut, true)
    assert.equal(plan.parts[0]?.cut?.startSeconds, 600)
    assert.equal(plan.parts[0]?.cut?.startSeconds, tracks[0]?.split?.startSeconds)
    assert.notEqual(plan.parts[0]?.cut?.startSeconds, 0)
    assert.equal(
      plan.parts[1]?.cut?.startSeconds,
      600 + (tracks[0]?.duration ?? 0),
    )
  })

  it('skips download, cut, loudnorm, and upload on a full cache hit', () => {
    const tracks = [splitPart(0), splitPart(1)]
    const plan = planYoutubeGroupExtract({
      youtubeId: 'abc123',
      tracks,
      normalizeVolume: true,
      cacheHits: [fakeTranscoded('a'), fakeTranscoded('b')],
    })
    assert.equal(plan.skipDownload, true)
    assert.equal(plan.loudnormFullFile, false)
    assert.equal(plan.parts.every(part => part.cacheHit), true)
    assert.equal(plan.parts.every(part => part.cut === null), true)
    assert.equal(plan.parts.every(part => part.loudnormPart === false), true)
    assert.equal(plan.parts.every(part => part.upload === false), true)
  })

  it('re-cuts and uploads when a trim change misses the cache', () => {
    const source = youtubeTrack({
      id: 'concert',
      youtubeId: 'concert',
      title: 'Concert',
      duration: 5400,
    })
    const tracks = applySourceTrimAndSplit(
      source,
      { startSeconds: 120, endSeconds: 3120 },
      5400,
    )
    const previousKey = extractCutCacheKey(
      'concert',
      youtubeTrack({
        duration: 5400,
        split: {
          groupId: 'concert',
          index: 0,
          count: 2,
          startSeconds: 0,
          durationSeconds: 2700,
        },
      }),
      false,
    )
    const nextKey = extractCutCacheKey('concert', tracks[0]!, false, 5400)
    assert.notDeepEqual(previousKey, nextKey)

    const plan = planYoutubeGroupExtract({
      youtubeId: 'concert',
      tracks,
      normalizeVolume: false,
      actualDuration: 5400,
      cacheHits: tracks.map(() => null),
    })
    assert.equal(plan.skipDownload, false)
    assert.equal(plan.parts.every(part => part.cacheHit === false), true)
    assert.equal(plan.parts.every(part => part.upload), true)
    assert.ok(plan.parts.some(part => part.cut != null))
  })

  it('plans extract rows only in a mixed reuse plus new split playlist', () => {
    const reused = youtubeTrack({
      id: 'short',
      youtubeId: 'short',
      yotoReuse: {
        trackUrl: 'yoto:#short',
        type: 'audio',
        format: 'opus',
        duration: 60,
        fileSize: 1,
        channels: 'stereo',
        display: { icon16x16: null },
      },
    })
    const playlist = [reused, splitPart(0), splitPart(1)]
    const savePlan = buildSavePlan([reused], playlist, EMPTY_CARD_DETAIL)
    assert.equal(savePlan.tracks[0]?.kind, 'reuse-yoto')
    const extractIndexes = savePlan.tracks.flatMap((action, index) => (
      action.kind === 'extract-youtube' ? [index] : []
    ))
    const extractTracks = extractIndexes.map(index => playlist[index]!)
    assert.deepEqual(extractTracks.map(track => track.youtubeId), ['abc123', 'abc123'])
    const plan = planYoutubeGroupExtract({
      youtubeId: 'abc123',
      tracks: extractTracks,
      normalizeVolume: true,
      actualDuration: 3600,
    })
    assert.equal(plan.parts.length, 2)
    assert.equal(plan.shouldCut, true)
    assert.equal(plan.loudnormFullFile, false)
  })
})
