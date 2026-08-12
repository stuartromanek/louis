import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyTrackIcon,
  icon16x16FromMediaId,
  mediaIdFromIcon16x16,
  resolveTrackIcon,
} from './trackArt.ts'
import type { PlaylistTrack } from './types.ts'

describe('trackArt', () => {
  it('round-trips mediaId and icon16x16', () => {
    assert.equal(icon16x16FromMediaId('abc123'), 'yoto:#abc123')
    assert.equal(mediaIdFromIcon16x16('yoto:#abc123'), 'abc123')
    assert.equal(mediaIdFromIcon16x16(null), null)
  })

  it('applies icon to chapter display and reuse display', () => {
    const track: PlaylistTrack = {
      id: 't1',
      title: 'Song',
      subtitle: 'Ch',
      thumbnailUrl: 'https://yt.example/t.jpg',
      source: 'app-youtube',
      youtubeId: 'vid',
      yotoReuse: {
        trackUrl: 'yoto:#hash',
        type: 'audio',
        format: 'mp3',
        duration: 10,
        fileSize: 100,
        display: { icon16x16: null },
      },
    }

    const next = applyTrackIcon(track, 'yoto:#media', 'https://cdn.example/icon.png')
    assert.deepEqual(next.chapterDisplay, { icon16x16: 'yoto:#media' })
    assert.deepEqual(next.yotoReuse?.display, { icon16x16: 'yoto:#media' })
    assert.equal(next.iconPreviewUrl, 'https://cdn.example/icon.png')
    assert.equal(resolveTrackIcon(next).icon16x16, 'yoto:#media')
  })
})
