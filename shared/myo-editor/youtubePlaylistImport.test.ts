import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  importableResultKeys,
  isListableYoutubeSearchResult,
  mapPlaylistImportItems,
  parseYoutubePlaylistUrl,
  videoResultKey,
  videosForGroupDrag,
  youtubePlaylistItemBlockReason,
  type YoutubePlaylistImportItem,
} from './youtubePlaylistImport.ts'
import { YOTO_MYO_MAX_TRACK_SECONDS } from './yotoMyoLimits.ts'

function item(
  id: string,
  partial: Partial<YoutubePlaylistImportItem> = {},
): YoutubePlaylistImportItem {
  return {
    playlistItemId: `item-${id}`,
    videoId: id,
    position: 0,
    title: id,
    channelTitle: 'Channel',
    thumbnailUrl: '',
    durationSeconds: 60,
    available: true,
    ...partial,
  }
}

describe('parseYoutubePlaylistUrl', () => {
  it('accepts supported HTTPS YouTube hosts', () => {
    assert.equal(
      parseYoutubePlaylistUrl('https://www.youtube.com/playlist?list=PL1234567890'),
      'PL1234567890',
    )
    assert.equal(
      parseYoutubePlaylistUrl('https://music.youtube.com/watch?v=abc&list=PLabcdefghij'),
      'PLabcdefghij',
    )
    assert.equal(
      parseYoutubePlaylistUrl('https://youtu.be/abc?list=PLabcdefghij'),
      'PLabcdefghij',
    )
  })

  it('rejects ambiguous, spoofed, and non-HTTPS URLs', () => {
    assert.equal(parseYoutubePlaylistUrl('PL1234567890'), null)
    assert.equal(parseYoutubePlaylistUrl('http://youtube.com/playlist?list=PL1234567890'), null)
    assert.equal(parseYoutubePlaylistUrl('https://youtube.com.example/playlist?list=PL1234567890'), null)
    assert.equal(
      parseYoutubePlaylistUrl('https://youtube.com/playlist?list=PL1234567890&list=PLabcdefghij'),
      null,
    )
  })
})

describe('playlist import results', () => {
  it('omits unavailable items and maps resultKey from playlistItemId', () => {
    const mapped = mapPlaylistImportItems([
      item('one'),
      item('gone', { available: false }),
      item('two'),
    ])

    assert.equal(mapped.skippedUnavailable, 1)
    assert.equal(mapped.skippedMissingDuration, 0)
    assert.deepEqual(
      mapped.videos.map(video => ({ id: video.id, resultKey: video.resultKey })),
      [
        { id: 'one', resultKey: 'item-one' },
        { id: 'two', resultKey: 'item-two' },
      ],
    )
  })

  it('omits missing-duration and placeholder-title rows from the list', () => {
    const mapped = mapPlaylistImportItems([
      item('one'),
      item('unknown', { durationSeconds: undefined }),
      item('stub', { title: 'YouTube video', durationSeconds: undefined }),
      item('gone', { available: false }),
    ])

    assert.equal(mapped.skippedUnavailable, 1)
    assert.equal(mapped.skippedMissingDuration, 2)
    assert.deepEqual(
      mapped.videos.map(video => video.id),
      ['one'],
    )
  })

  it('blocks missing duration, not long tracks', () => {
    assert.equal(
      youtubePlaylistItemBlockReason(item('gone', { available: false })),
      'unavailable',
    )
    assert.equal(
      youtubePlaylistItemBlockReason(item('unknown', { durationSeconds: undefined })),
      'missing-duration',
    )
    assert.equal(
      youtubePlaylistItemBlockReason(
        item('long', { durationSeconds: YOTO_MYO_MAX_TRACK_SECONDS + 1 }),
      ),
      undefined,
    )
    assert.equal(youtubePlaylistItemBlockReason(item('ok')), undefined)
  })

  it('does not list placeholder titles or rows without duration', () => {
    assert.equal(
      isListableYoutubeSearchResult({
        id: 'abcdefghijk',
        title: 'YouTube video',
        durationSeconds: undefined,
      }),
      false,
    )
    assert.equal(
      isListableYoutubeSearchResult({
        id: 'abcdefghijk',
        title: 'A real clip',
        durationSeconds: 0,
      }),
      false,
    )
    assert.equal(
      isListableYoutubeSearchResult({
        id: 'abcdefghijk',
        title: 'A real clip',
        durationSeconds: 90,
      }),
      true,
    )
  })

  it('pre-checks importable rows including long tracks', () => {
    const videos = mapPlaylistImportItems([
      item('one'),
      item('long', { durationSeconds: YOTO_MYO_MAX_TRACK_SECONDS + 1 }),
      item('two'),
    ]).videos

    assert.deepEqual(
      importableResultKeys(videos),
      ['item-one', 'item-long', 'item-two'],
    )
  })
})

describe('group drag payload', () => {
  const results = [
    { id: 'a', resultKey: 'row-a' },
    { id: 'b', resultKey: 'row-b' },
    { id: 'c', resultKey: 'row-c' },
  ]

  it('returns only the source when it is unchecked', () => {
    const selected = new Set(['row-a', 'row-c'])
    assert.deepEqual(
      videosForGroupDrag(results, selected, results[1]!),
      [results[1]],
    )
  })

  it('returns checked rows in results order', () => {
    const selected = new Set(['row-c', 'row-a'])
    assert.deepEqual(
      videosForGroupDrag(results, selected, results[0]!),
      [results[0], results[2]],
    )
  })

  it('uses video.id when resultKey is missing', () => {
    assert.equal(videoResultKey({ id: 'yt-1' }), 'yt-1')
    assert.equal(videoResultKey({ id: 'yt-1', resultKey: 'item-1' }), 'item-1')
  })
})
