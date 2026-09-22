import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  coverDestRect,
  coverFitZoom,
  panFromDestOrigin,
  playlistCoverAspect,
  playlistCoverFileError,
  PLAYLIST_COVER_ASPECT_HEIGHT,
  PLAYLIST_COVER_ASPECT_WIDTH,
  PLAYLIST_COVER_EXPORT_HEIGHT,
  PLAYLIST_COVER_EXPORT_WIDTH,
} from './playlistCoverCrop.ts'

const FRAME = { zoom: 1, panX: 0, panY: 0 }

describe('playlistCoverCrop', () => {
  it('uses the Yoto default cover frame (638×1011)', () => {
    assert.equal(PLAYLIST_COVER_EXPORT_WIDTH, 638)
    assert.equal(PLAYLIST_COVER_EXPORT_HEIGHT, 1011)
    assert.equal(playlistCoverAspect(), PLAYLIST_COVER_ASPECT_WIDTH / PLAYLIST_COVER_ASPECT_HEIGHT)
  })

  it('fills the frame for an exact cover-sized source at zoom 1', () => {
    const dest = coverDestRect(
      PLAYLIST_COVER_EXPORT_WIDTH,
      PLAYLIST_COVER_EXPORT_HEIGHT,
      FRAME,
    )
    assert.equal(dest.x, 0)
    assert.equal(dest.y, 0)
    assert.equal(dest.width, PLAYLIST_COVER_EXPORT_WIDTH)
    assert.equal(dest.height, PLAYLIST_COVER_EXPORT_HEIGHT)
  })

  it('letterboxes a taller-than-frame image at zoom 1 so the full source is visible', () => {
    const dest = coverDestRect(500, 1200, FRAME)
    assert.equal(dest.height, PLAYLIST_COVER_EXPORT_HEIGHT)
    assert.ok(dest.width < PLAYLIST_COVER_EXPORT_WIDTH)
    assert.ok(dest.x > 0)
    assert.equal(dest.y, 0)
    assert.equal(Math.round(dest.x * 2 + dest.width), PLAYLIST_COVER_EXPORT_WIDTH)
  })

  it('pillarboxes a square at zoom 1 instead of cropping top and bottom', () => {
    const dest = coverDestRect(700, 700, FRAME)
    assert.equal(dest.width, PLAYLIST_COVER_EXPORT_WIDTH)
    assert.ok(dest.height < PLAYLIST_COVER_EXPORT_HEIGHT)
    assert.equal(dest.x, 0)
    assert.ok(dest.y > 0)
  })

  it('fills the frame at cover-fit zoom', () => {
    const zoom = coverFitZoom(700, 700)
    const dest = coverDestRect(700, 700, { zoom, panX: 0, panY: 0 })
    assert.ok(dest.height >= PLAYLIST_COVER_EXPORT_HEIGHT - 0.5)
    assert.ok(dest.width >= PLAYLIST_COVER_EXPORT_WIDTH - 0.5)
    assert.ok(dest.x <= 0)
    assert.ok(Math.abs(dest.y) < 0.5)
  })

  it('grows the dest rect when zooming in', () => {
    const full = coverDestRect(700, 700, FRAME)
    const zoomed = coverDestRect(700, 700, { zoom: 2, panX: 0, panY: 0 })
    assert.equal(Math.round(zoomed.width), Math.round(full.width * 2))
    assert.equal(Math.round(zoomed.height), Math.round(full.height * 2))
  })

  it('ignores pan while the image is fully inside the frame', () => {
    const center = coverDestRect(700, 700, FRAME)
    const panned = coverDestRect(700, 700, { zoom: 1, panX: -1, panY: 1 })
    assert.equal(panned.x, center.x)
    assert.equal(panned.y, center.y)
  })

  it('clamps pan so a cover-fit crop stays in frame', () => {
    const zoom = coverFitZoom(1600, 900)
    const left = coverDestRect(1600, 900, { zoom, panX: -2, panY: 0 })
    const right = coverDestRect(1600, 900, { zoom, panX: 2, panY: 0 })
    assert.equal(Math.round(left.x), 0)
    assert.equal(Math.round(right.x + right.width), PLAYLIST_COVER_EXPORT_WIDTH)
  })

  it('round-trips pan from a dest origin', () => {
    const zoom = coverFitZoom(1600, 900)
    const next = panFromDestOrigin(1600, 900, zoom, 0, 0)
    const dest = coverDestRect(1600, 900, next)
    assert.equal(Math.round(dest.x), 0)
  })

  it('rejects non-image files', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'notes.txt', { type: 'text/plain' })
    assert.equal(playlistCoverFileError(file), 'Use a JPG, PNG, WebP, or GIF.')
  })
})
