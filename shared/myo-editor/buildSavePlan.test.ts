import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { playlistSaveExtractsYoutube } from './buildSavePlan.ts'
import type { PlaylistTrack } from './types.ts'

function youtubeTrack(overrides: Partial<PlaylistTrack> = {}): PlaylistTrack {
  return {
    id: 'yt-1',
    title: 'Baby',
    subtitle: '',
    thumbnailUrl: '',
    source: 'app-youtube',
    youtubeId: 'abc123',
    ...overrides,
  }
}

describe('playlistSaveExtractsYoutube', () => {
  it('is true for a new YouTube track', () => {
    assert.equal(playlistSaveExtractsYoutube([], [youtubeTrack()], null), true)
  })

  it('is false when the YouTube track can be reused from the card', () => {
    const existing = youtubeTrack({
      yotoReuse: {
        trackUrl: 'yoto:#deadbeef',
        type: 'audio',
        format: 'opus',
        duration: 12,
        fileSize: 1000,
        channels: 'stereo',
        display: { icon16x16: null },
      },
    })
    assert.equal(playlistSaveExtractsYoutube([existing], [existing], null), false)
  })

  it('is false for a reuse-only reorder', () => {
    const a = youtubeTrack({
      id: 'a',
      yotoReuse: {
        trackUrl: 'yoto:#aaa',
        type: 'audio',
        format: 'opus',
        duration: 10,
        fileSize: 1,
        channels: 'stereo',
        display: { icon16x16: null },
      },
    })
    const b = youtubeTrack({
      id: 'b',
      youtubeId: 'def',
      yotoReuse: {
        trackUrl: 'yoto:#bbb',
        type: 'audio',
        format: 'opus',
        duration: 10,
        fileSize: 1,
        channels: 'stereo',
        display: { icon16x16: null },
      },
    })
    assert.equal(playlistSaveExtractsYoutube([a, b], [b, a], null), false)
  })
})
