import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatTrackMediaLimitError,
  getCardTotalsLimitError,
  getPlaylistPreflightLimitError,
  getTrackCountLimitError,
  getTrackMediaLimitError,
  mapYotoApiLimitError,
  withMappedYotoLimitError,
  YOTO_MYO_CARD_TOTALS_MESSAGE,
  YOTO_MYO_MAX_CARD_BYTES,
  YOTO_MYO_MAX_CARD_SECONDS,
  YOTO_MYO_MAX_TRACK_BYTES,
  YOTO_MYO_MAX_TRACK_SECONDS,
  YOTO_MYO_MAX_TRACKS,
  YOTO_MYO_TRACK_COUNT_MESSAGE,
  formatCapacityDuration,
  getPlaylistCapacitySnapshot,
} from './yotoMyoLimits.ts'
import type { PlaylistTrack } from './types.ts'

function track(partial: Partial<PlaylistTrack> & Pick<PlaylistTrack, 'id' | 'title'>): PlaylistTrack {
  return {
    subtitle: '',
    thumbnailUrl: '',
    source: 'app-youtube',
    ...partial,
  }
}

describe('getTrackCountLimitError', () => {
  it('allows up to the max track count', () => {
    assert.equal(getTrackCountLimitError(YOTO_MYO_MAX_TRACKS), null)
    assert.equal(getTrackCountLimitError(0), null)
  })

  it('rejects over the max track count', () => {
    assert.equal(getTrackCountLimitError(YOTO_MYO_MAX_TRACKS + 1), YOTO_MYO_TRACK_COUNT_MESSAGE)
  })
})

describe('getTrackMediaLimitError', () => {
  it('ignores missing media fields', () => {
    assert.equal(getTrackMediaLimitError({ title: 'Song' }), null)
  })

  it('rejects overlong duration', () => {
    assert.equal(
      getTrackMediaLimitError({
        title: 'Epic',
        duration: YOTO_MYO_MAX_TRACK_SECONDS + 1,
      }),
      formatTrackMediaLimitError('Epic'),
    )
  })

  it('rejects oversized file', () => {
    assert.equal(
      getTrackMediaLimitError({
        title: 'Huge',
        fileSize: YOTO_MYO_MAX_TRACK_BYTES + 1,
      }),
      formatTrackMediaLimitError('Huge'),
    )
  })

  it('allows values at the limit', () => {
    assert.equal(
      getTrackMediaLimitError({
        title: 'Ok',
        duration: YOTO_MYO_MAX_TRACK_SECONDS,
        fileSize: YOTO_MYO_MAX_TRACK_BYTES,
      }),
      null,
    )
  })
})

describe('getCardTotalsLimitError', () => {
  it('rejects over duration or size', () => {
    assert.equal(
      getCardTotalsLimitError({
        totalDuration: YOTO_MYO_MAX_CARD_SECONDS + 1,
        totalFileSize: 0,
      }),
      YOTO_MYO_CARD_TOTALS_MESSAGE,
    )
    assert.equal(
      getCardTotalsLimitError({
        totalDuration: 0,
        totalFileSize: YOTO_MYO_MAX_CARD_BYTES + 1,
      }),
      YOTO_MYO_CARD_TOTALS_MESSAGE,
    )
  })

  it('allows values at the limit', () => {
    assert.equal(
      getCardTotalsLimitError({
        totalDuration: YOTO_MYO_MAX_CARD_SECONDS,
        totalFileSize: YOTO_MYO_MAX_CARD_BYTES,
      }),
      null,
    )
  })
})

describe('getPlaylistPreflightLimitError', () => {
  it('fails on track count even without media metadata', () => {
    const playlist = Array.from({ length: YOTO_MYO_MAX_TRACKS + 1 }, (_, i) =>
      track({ id: `t${i}`, title: `T${i}` }),
    )
    assert.equal(getPlaylistPreflightLimitError(playlist), YOTO_MYO_TRACK_COUNT_MESSAGE)
  })

  it('skips duration checks when any track lacks duration', () => {
    const playlist = [
      track({ id: 'a', title: 'Known', duration: YOTO_MYO_MAX_TRACK_SECONDS + 10 }),
      track({ id: 'b', title: 'Unknown' }),
    ]
    assert.equal(getPlaylistPreflightLimitError(playlist), null)
  })

  it('checks durations when every track has one', () => {
    const playlist = [
      track({ id: 'a', title: 'Short', duration: 120 }),
      track({ id: 'b', title: 'Long One', duration: YOTO_MYO_MAX_TRACK_SECONDS + 1 }),
    ]
    assert.equal(
      getPlaylistPreflightLimitError(playlist),
      formatTrackMediaLimitError('Long One'),
    )
  })

  it('uses yotoReuse duration and fileSize when present on all tracks', () => {
    const playlist = [
      track({
        id: 'a',
        title: 'Reuse big',
        source: 'yoto-upload',
        yotoReuse: {
          trackUrl: 'yoto:#abc',
          type: 'audio',
          format: 'mp3',
          duration: 60,
          fileSize: YOTO_MYO_MAX_TRACK_BYTES + 1,
        },
      }),
    ]
    assert.equal(
      getPlaylistPreflightLimitError(playlist),
      formatTrackMediaLimitError('Reuse big'),
    )
  })

  it('rejects card-level duration sums when complete', () => {
    // Each under the 60m per-track cap; sum over the 5h card cap.
    const playlist = Array.from({ length: 7 }, (_, i) =>
      track({ id: `t${i}`, title: `T${i}`, duration: 50 * 60 }),
    )
    assert.equal(getPlaylistPreflightLimitError(playlist), YOTO_MYO_CARD_TOTALS_MESSAGE)
  })
})

describe('mapYotoApiLimitError', () => {
  it('returns null for unrelated errors', () => {
    assert.equal(mapYotoApiLimitError('Network timeout'), null)
    assert.equal(withMappedYotoLimitError('Network timeout'), 'Network timeout')
  })

  it('maps track-count wording', () => {
    assert.equal(
      mapYotoApiLimitError('Too many tracks on this content'),
      YOTO_MYO_TRACK_COUNT_MESSAGE,
    )
  })

  it('maps per-track wording', () => {
    assert.equal(
      mapYotoApiLimitError('Track exceeds 100 MB limit'),
      formatTrackMediaLimitError('This track'),
    )
    assert.equal(
      mapYotoApiLimitError('Track exceeds 100 MB limit', 'Epic Jam'),
      formatTrackMediaLimitError('Epic Jam'),
    )
  })

  it('upgrades placeholder This track when a title is provided', () => {
    const placeholder = formatTrackMediaLimitError('This track')
    assert.equal(
      withMappedYotoLimitError(placeholder, 'Real Title'),
      formatTrackMediaLimitError('Real Title'),
    )
  })

  it('keeps an already-titled per-track message', () => {
    const titled = formatTrackMediaLimitError('Keep Me')
    assert.equal(withMappedYotoLimitError(titled, 'Other'), titled)
  })

  it('maps card-capacity wording', () => {
    assert.equal(
      mapYotoApiLimitError('Card capacity of 500 MB exceeded'),
      YOTO_MYO_CARD_TOTALS_MESSAGE,
    )
  })

  it('falls back to card totals for generic capacity wording', () => {
    assert.equal(
      mapYotoApiLimitError('Upload exceeds maximum quota'),
      YOTO_MYO_CARD_TOTALS_MESSAGE,
    )
  })
})

describe('getPlaylistCapacitySnapshot / formatCapacityDuration', () => {
  it('sums known durations and flags incomplete metadata', () => {
    const snapshot = getPlaylistCapacitySnapshot([
      track({ id: 'a', title: 'A', duration: 90 }),
      track({ id: 'b', title: 'B' }),
    ])
    assert.equal(snapshot.trackCount, 2)
    assert.equal(snapshot.knownDurationSeconds, 90)
    assert.equal(snapshot.durationComplete, false)
  })

  it('formats compact duration labels', () => {
    assert.equal(formatCapacityDuration(42 * 60), '42m')
    assert.equal(formatCapacityDuration(3600), '1h')
    assert.equal(formatCapacityDuration(3723), '1h 02m')
  })
})
