import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  appendArtworkHistory,
  artworkPreviewUrl,
  artworkSpecsEqual,
  dicebearUrl,
  DICEBEAR_PNG_SIZE,
  parsePlaylistArtworkSpec,
  PLAYLIST_ARTWORK_BACKGROUNDS,
  PLAYLIST_ARTWORK_HISTORY_CAP,
  PLAYLIST_ARTWORK_STYLES,
  ARTWORK_STYLE_PREVIEW_SEED,
  artworkStyleLabel,
  artworkStylePreviewUrl,
  nextArtworkPoolExclusion,
  randomArtworkSpec,
  type PlaylistArtworkHistoryItem,
  type PlaylistArtworkSpec,
} from './playlistArtwork.ts'

const spec: PlaylistArtworkSpec = {
  style: 'lorelei',
  seed: 'user-8f3a2c',
  backgroundColor: '0068FF',
}

describe('playlistArtwork', () => {
  it('builds DiceBear svg and png URLs', () => {
    assert.equal(
      dicebearUrl(spec, 'svg'),
      'https://api.dicebear.com/10.x/lorelei/svg?seed=user-8f3a2c&backgroundColor=0068FF',
    )
    assert.equal(
      dicebearUrl(spec, 'png'),
      `https://api.dicebear.com/10.x/lorelei/png?seed=user-8f3a2c&backgroundColor=0068FF&size=${DICEBEAR_PNG_SIZE}`,
    )
  })

  it('encodes special characters in the seed', () => {
    const url = dicebearUrl({ ...spec, seed: 'a b/c' }, 'svg')
    assert.match(url, /seed=a\+b%2Fc/)
  })

  it('parses a valid spec and rejects unknown styles or backgrounds', () => {
    assert.deepEqual(parsePlaylistArtworkSpec({
      style: 'dylan',
      seed: 'abc',
      backgroundColor: '#ffc800',
    }), {
      style: 'dylan',
      seed: 'abc',
      backgroundColor: 'FFC800',
    })
    assert.equal(parsePlaylistArtworkSpec({ style: 'avataaars', seed: 'x', backgroundColor: '0068FF' }), null)
    assert.equal(parsePlaylistArtworkSpec({ style: 'lorelei', seed: '', backgroundColor: '0068FF' }), null)
    assert.equal(parsePlaylistArtworkSpec({ style: 'lorelei', seed: 'x', backgroundColor: 'ffffff' }), null)
  })

  it('humanizes DiceBear style ids for the tag cloud', () => {
    assert.equal(artworkStyleLabel('lorelei-neutral'), 'Lorelei Neutral')
    assert.equal(artworkStyleLabel('fun-emoji'), 'Fun Emoji')
    assert.equal(artworkStyleLabel('shape-grid'), 'Shape Grid')
    assert.equal(artworkStyleLabel('pixelbot'), 'Pixel Bots')
    assert.equal(artworkStyleLabel('voxel-bot'), 'Voxel Bots')
  })

  it('builds a style-only preview URL with a stable seed', () => {
    assert.equal(
      artworkStylePreviewUrl('lorelei-neutral'),
      `https://api.dicebear.com/10.x/lorelei-neutral/svg?seed=${ARTWORK_STYLE_PREVIEW_SEED}`,
    )
  })

  it('isolates from all-on, then toggles items in the inverted pool', () => {
    const all = ['lorelei', 'dylan', 'bottts'] as const
    const isolated = nextArtworkPoolExclusion(all, new Set(), 'dylan')
    assert.deepEqual(isolated, new Set(['lorelei', 'bottts']))

    const added = nextArtworkPoolExclusion(all, isolated!, 'bottts')
    assert.deepEqual(added, new Set(['lorelei']))

    const deactivated = nextArtworkPoolExclusion(all, added!, 'dylan')
    assert.deepEqual(deactivated, new Set(['lorelei', 'dylan']))

    assert.equal(nextArtworkPoolExclusion(all, isolated!, 'dylan'), null)
  })

  it('picks a curated style and Maru background', () => {
    const generated = randomArtworkSpec(() => 0)
    assert.equal(generated.style, PLAYLIST_ARTWORK_STYLES[0])
    assert.equal(generated.backgroundColor, PLAYLIST_ARTWORK_BACKGROUNDS[0])
    assert.ok(generated.seed.length > 0)
  })

  it('picks only from the supplied style and background pool', () => {
    const generated = randomArtworkSpec(() => 0, {
      styles: ['bottts', 'personas'],
      backgrounds: ['FF8080', 'FA97FF'],
    })
    assert.equal(generated.style, 'bottts')
    assert.equal(generated.backgroundColor, 'FF8080')
  })

  it('falls back to the full lists when a pool is empty', () => {
    const generated = randomArtworkSpec(() => 0, { styles: [], backgrounds: [] })
    assert.equal(generated.style, PLAYLIST_ARTWORK_STYLES[0])
    assert.equal(generated.backgroundColor, PLAYLIST_ARTWORK_BACKGROUNDS[0])
  })

  it('compares specs and previews generated items as SVG', () => {
    assert.equal(artworkSpecsEqual(spec, { ...spec }), true)
    assert.equal(artworkSpecsEqual(spec, { ...spec, seed: 'other' }), false)
    assert.equal(
      artworkPreviewUrl({ kind: 'generated', spec }),
      dicebearUrl(spec, 'svg'),
    )
    assert.equal(
      artworkPreviewUrl({ kind: 'existing', url: 'https://cdn.example/cover.jpg' }),
      'https://cdn.example/cover.jpg',
    )
  })

  it('appends like a browser: drop forward items, then cap the stack', () => {
    const first: PlaylistArtworkHistoryItem = { kind: 'existing', url: 'https://a' }
    const second: PlaylistArtworkHistoryItem = { kind: 'generated', spec }
    const third: PlaylistArtworkHistoryItem = {
      kind: 'generated',
      spec: { ...spec, seed: 'later' },
    }

    const afterTwo = appendArtworkHistory([first], 0, second)
    assert.deepEqual(afterTwo.items, [first, second])
    assert.equal(afterTwo.index, 1)

    const fromMiddle = appendArtworkHistory(afterTwo.items, 0, third)
    assert.deepEqual(fromMiddle.items, [first, third])
    assert.equal(fromMiddle.index, 1)

    let items: PlaylistArtworkHistoryItem[] = []
    let index = -1
    for (let i = 0; i < PLAYLIST_ARTWORK_HISTORY_CAP + 3; i++) {
      const next = appendArtworkHistory(items, index, {
        kind: 'generated',
        spec: { ...spec, seed: String(i) },
      })
      items = next.items
      index = next.index
    }
    assert.equal(items.length, PLAYLIST_ARTWORK_HISTORY_CAP)
    assert.equal(index, PLAYLIST_ARTWORK_HISTORY_CAP - 1)
    assert.equal(items[0]?.kind === 'generated' ? items[0].spec.seed : '', '3')
  })
})
