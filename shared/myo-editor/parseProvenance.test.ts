import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildManifestLookupForCard,
  buildProvenance,
  parseProvenance,
} from './parseProvenance.ts'
import { playlistToYotoContent } from './playlistToYotoContent.ts'
import type { PlaylistTrack, SaveTrackAction } from './types.ts'

describe('buildManifestLookupForCard', () => {
  it('applies the manifest when row counts match', () => {
    const provenance = buildProvenance([
      { chapterKey: '01', trackKey: '01', title: 'One', youtubeId: 'aaa' },
    ])
    const manifest = parseProvenance(provenance.note, provenance.contentVersion)
    const lookup = buildManifestLookupForCard(manifest, 1)
    assert.equal(lookup.get('01:01')?.title, 'One')
  })

  it('ignores a stale manifest when the card has fewer tracks', () => {
    const provenance = buildProvenance([
      { chapterKey: '01', trackKey: '01', title: 'Deleted first', youtubeId: 'old' },
      { chapterKey: '02', trackKey: '01', title: 'Kept', youtubeId: 'new' },
    ])
    const manifest = parseProvenance(provenance.note, provenance.contentVersion)
    const lookup = buildManifestLookupForCard(manifest, 1)
    assert.equal(lookup.size, 0)
  })
})

describe('playlistToYotoContent provenance', () => {
  it('reindexes chapter keys and does not keep a stale metadata note', () => {
    const reuse = {
      trackUrl: 'yoto:#abc',
      type: 'audio' as const,
      format: 'opus',
      duration: 10,
      fileSize: 1,
      channels: 'stereo' as const,
      display: { icon16x16: null },
    }
    const playlist: PlaylistTrack[] = [
      {
        id: 'yoto:02:01',
        title: 'Kept second',
        subtitle: '',
        thumbnailUrl: '',
        source: 'app-youtube',
        youtubeId: 'kept',
        chapterKey: '02',
        trackKey: '01',
        yotoReuse: reuse,
      },
    ]
    const plan: SaveTrackAction[] = [
      { kind: 'reuse-yoto', snapshot: reuse, playlistIndex: 0 },
    ]
    const stale = buildProvenance([
      { chapterKey: '01', trackKey: '01', title: 'Deleted first', youtubeId: 'gone' },
      { chapterKey: '02', trackKey: '01', title: 'Kept second', youtubeId: 'kept' },
    ]).note

    const built = playlistToYotoContent('Card', playlist, plan, new Map(), {
      existingMetadataNote: stale,
    })
    const manifest = parseProvenance(built.note, built.contentVersion)
    assert.equal(built.chapters[0]?.key, '01')
    assert.equal(built.chapters[0]?.title, 'Kept second')
    assert.equal(manifest?.tracks.length, 1)
    assert.equal(manifest?.tracks[0]?.chapterKey, '01')
    assert.equal(manifest?.tracks[0]?.youtubeId, 'kept')
    assert.equal(manifest?.tracks[0]?.title, 'Kept second')
  })

  it('round-trips split provenance on extract', () => {
    const split = {
      groupId: 'long',
      index: 0,
      count: 2,
      startSeconds: 0,
      durationSeconds: 1800,
    }
    const playlist: PlaylistTrack[] = [
      {
        id: 'long#p0',
        title: 'Long (Part 1)',
        subtitle: '',
        thumbnailUrl: '',
        source: 'app-youtube',
        youtubeId: 'long',
        duration: 1800,
        split,
      },
    ]
    const plan: SaveTrackAction[] = [
      { kind: 'extract-youtube', youtubeId: 'long', playlistIndex: 0, split },
    ]
    const uploaded = new Map([
      [0, {
        transcodedSha256: 'deadbeef',
        transcodedInfo: { duration: 1800, fileSize: 12, format: 'aac', channels: 2 },
      }],
    ])
    const built = playlistToYotoContent('Card', playlist, plan, uploaded)
    const manifest = parseProvenance(built.note, built.contentVersion)
    assert.equal(manifest?.tracks[0]?.youtubeId, 'long')
    assert.deepEqual(manifest?.tracks[0]?.split, split)
  })

  it('builds empty chapters when the playlist is cleared', () => {
    const built = playlistToYotoContent('Card', [], [], new Map())
    assert.deepEqual(built.chapters, [])
    assert.equal(built.totalDuration, 0)
    assert.equal(built.totalFileSize, 0)
    const manifest = parseProvenance(built.note, built.contentVersion)
    assert.equal(manifest?.tracks.length, 0)
  })
})
