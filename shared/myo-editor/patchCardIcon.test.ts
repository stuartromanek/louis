import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  contentChaptersFromDetail,
  isPersistedCardTrack,
  PatchCardIconError,
  patchCardDetailIcons,
} from './patchCardIcon.ts'
import type { PlaylistTrack, YotoCardDetail } from './types.ts'

function fixtureDetail(): YotoCardDetail {
  return {
    cardId: 'card-1',
    title: 'Test Card',
    contentVersion: '1',
    metadataNote: null,
    feedUrl: null,
    metadata: null,
    chapters: [
      {
        key: '01',
        title: 'First',
        display: { icon16x16: 'yoto:#old-a' },
        tracks: [
          {
            chapterKey: '01',
            trackKey: '01',
            key: '01',
            title: 'First',
            trackUrl: 'yoto:#audio-a',
            type: 'audio',
            format: 'mp3',
            duration: 10,
            fileSize: 100,
            overlayLabel: '1',
            display: { icon16x16: 'yoto:#old-a' },
          },
        ],
      },
      {
        key: '02',
        title: 'Second',
        display: { icon16x16: 'yoto:#old-b' },
        tracks: [
          {
            chapterKey: '02',
            trackKey: '01',
            key: '01',
            title: 'Second',
            trackUrl: 'yoto:#audio-b',
            type: 'audio',
            format: 'mp3',
            duration: 20,
            fileSize: 200,
            overlayLabel: '2',
            display: { icon16x16: 'yoto:#old-b' },
          },
        ],
      },
    ],
  }
}

describe('patchCardDetailIcons', () => {
  it('updates chapter + track[0] icon and leaves other chapters alone', () => {
    const chapters = patchCardDetailIcons(fixtureDetail(), '02', '01', 'yoto:#new')
    assert.equal(chapters.length, 2)
    assert.deepEqual(chapters[0]!.display, { icon16x16: 'yoto:#old-a' })
    assert.deepEqual(chapters[0]!.tracks[0]!.display, { icon16x16: 'yoto:#old-a' })
    assert.deepEqual(chapters[1]!.display, { icon16x16: 'yoto:#new' })
    assert.deepEqual(chapters[1]!.tracks[0]!.display, { icon16x16: 'yoto:#new' })
    assert.equal(chapters[1]!.tracks[0]!.trackUrl, 'yoto:#audio-b')
    assert.equal(chapters[1]!.key, '02')
  })

  it('throws when chapter is missing', () => {
    assert.throws(
      () => patchCardDetailIcons(fixtureDetail(), '99', '01', 'yoto:#new'),
      (err: unknown) => err instanceof PatchCardIconError && err.code === 'chapter-not-found',
    )
  })

  it('throws when track is missing', () => {
    assert.throws(
      () => patchCardDetailIcons(fixtureDetail(), '01', '99', 'yoto:#new'),
      (err: unknown) => err instanceof PatchCardIconError && err.code === 'track-not-found',
    )
  })
})

describe('isPersistedCardTrack', () => {
  it('requires chapter/track keys and baseline membership', () => {
    const baseline: PlaylistTrack[] = [
      {
        id: 'yoto:01:01',
        title: 'A',
        subtitle: '',
        thumbnailUrl: '',
        source: 'app-youtube',
        chapterKey: '01',
        trackKey: '01',
      },
    ]
    const persisted: PlaylistTrack = {
      id: 'yoto:01:01',
      title: 'A',
      subtitle: '',
      thumbnailUrl: '',
      source: 'app-youtube',
      chapterKey: '01',
      trackKey: '01',
    }
    const fresh: PlaylistTrack = {
      id: 'local-1',
      title: 'B',
      subtitle: '',
      thumbnailUrl: '',
      source: 'app-youtube',
      youtubeId: 'abc',
    }

    assert.equal(isPersistedCardTrack(persisted, baseline), true)
    assert.equal(isPersistedCardTrack(fresh, baseline), false)
    assert.equal(isPersistedCardTrack({ ...persisted, chapterKey: undefined }, baseline), false)
  })
})

describe('contentChaptersFromDetail', () => {
  it('maps chapters and icons without changing them', () => {
    const chapters = contentChaptersFromDetail(fixtureDetail())
    assert.equal(chapters.length, 2)
    assert.equal(chapters[0]!.title, 'First')
    assert.deepEqual(chapters[0]!.display, { icon16x16: 'yoto:#old-a' })
    assert.deepEqual(chapters[0]!.tracks[0]!.display, { icon16x16: 'yoto:#old-a' })
    assert.equal(chapters[0]!.tracks[0]!.trackUrl, 'yoto:#audio-a')
    assert.equal(chapters[1]!.overlayLabel, '2')
  })

  it('returns an empty chapter list for an empty playlist', () => {
    const empty = fixtureDetail()
    empty.chapters = []
    assert.deepEqual(contentChaptersFromDetail(empty), [])
  })
})
