import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  coverSourceRect,
  minCoverCropSize,
  panFromSourceOrigin,
  playlistCoverAspect,
  playlistCoverFileError,
  PLAYLIST_COVER_ASPECT_HEIGHT,
  PLAYLIST_COVER_ASPECT_WIDTH,
} from './playlistCoverCrop.ts'

describe('playlistCoverCrop', () => {
  it('uses a 5:7 frame', () => {
    assert.equal(playlistCoverAspect(), PLAYLIST_COVER_ASPECT_WIDTH / PLAYLIST_COVER_ASPECT_HEIGHT)
  })

  it('crops a square to a centered 5:7 window', () => {
    const min = minCoverCropSize(700, 700)
    assert.equal(min.height, 700)
    assert.equal(Math.round(min.width), Math.round(700 * (5 / 7)))
    const rect = coverSourceRect(700, 700, { zoom: 1, panX: 0, panY: 0 })
    assert.equal(rect.y, 0)
    assert.ok(rect.x > 0)
    assert.equal(Math.round(rect.x * 2 + rect.width), 700)
  })

  it('crops a landscape photo from the center', () => {
    const rect = coverSourceRect(1600, 900, { zoom: 1, panX: 0, panY: 0 })
    assert.equal(rect.height, 900)
    assert.equal(Math.round(rect.width / rect.height * 7), 5)
    assert.ok(rect.x > 0)
    assert.equal(rect.y, 0)
  })

  it('zooms by shrinking the source window', () => {
    const full = coverSourceRect(700, 700, { zoom: 1, panX: 0, panY: 0 })
    const zoomed = coverSourceRect(700, 700, { zoom: 2, panX: 0, panY: 0 })
    assert.equal(Math.round(zoomed.width * 2), Math.round(full.width))
    assert.equal(Math.round(zoomed.height * 2), Math.round(full.height))
  })

  it('clamps pan so the crop stays inside the image', () => {
    const left = coverSourceRect(700, 700, { zoom: 1, panX: -2, panY: 0 })
    const right = coverSourceRect(700, 700, { zoom: 1, panX: 2, panY: 0 })
    assert.equal(left.x, 0)
    assert.equal(Math.round(right.x + right.width), 700)
  })

  it('round-trips pan from a source origin', () => {
    const next = panFromSourceOrigin(1600, 900, 1, 0, 0)
    const rect = coverSourceRect(1600, 900, next)
    assert.equal(rect.x, 0)
    assert.equal(rect.y, 0)
  })

  it('rejects non-image files', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'notes.txt', { type: 'text/plain' })
    assert.equal(playlistCoverFileError(file), 'Use a JPG, PNG, WebP, or GIF.')
  })
})
