import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isImportableYoutubeResult } from '../../shared/myo-editor/youtubePlaylistImport.ts'
import {
  decodeYtdlpPageToken,
  encodeYtdlpPageToken,
  mapYtdlpChannelDump,
  mapYtdlpEntryToSearchItem,
  mapYtdlpPlaylistDump,
  unwrapYtdlpEntries,
  type YtdlpDump,
} from './youtube-ytdlp-map.ts'

const searchEntry: YtdlpDump = {
  id: 'fZ9WiuJPnNA',
  title: 'Sesame Street: Feist sings 1,2,3,4',
  channel: 'Sesame Street',
  duration: 141,
  thumbnail: 'https://i.ytimg.com/vi/fZ9WiuJPnNA/mqdefault.jpg',
  upload_date: '20080718',
}

const liveEntry: YtdlpDump = {
  id: 'liveVideoId1',
  title: 'Live now',
  channel: 'Sesame Street',
  live_status: 'is_live',
}

describe('yt-dlp page tokens', () => {
  it('round-trips 1-based offsets', () => {
    assert.equal(decodeYtdlpPageToken(undefined), 1)
    assert.equal(decodeYtdlpPageToken(encodeYtdlpPageToken(13)), 13)
  })

  it('rejects Data API tokens so backends cannot mix', () => {
    assert.throws(() => decodeYtdlpPageToken('CAUQAA'), { statusCode: 400 })
  })
})

describe('mapYtdlpEntryToSearchItem', () => {
  it('maps duration so rows are importable', () => {
    const item = mapYtdlpEntryToSearchItem(searchEntry)
    assert.ok(item)
    assert.equal(item.durationSeconds, 141)
    assert.equal(item.duration, 'PT2M21S')
    assert.equal(item.publishedAt, '2008-07-18T00:00:00Z')
    assert.equal(isImportableYoutubeResult(item), true)
  })

  it('omits live and upcoming rows', () => {
    assert.equal(mapYtdlpEntryToSearchItem(liveEntry), null)
    assert.equal(mapYtdlpEntryToSearchItem({
      id: 'upcomingVid1',
      title: 'Premiere tonight',
      live_status: 'is_upcoming',
    }), null)
  })

  it('omits untitled stubs, placeholder titles, and non-video ids', () => {
    assert.equal(mapYtdlpEntryToSearchItem({
      id: 'abcdefghijk',
      channel: 'Marcin Plaza',
    }), null)
    assert.equal(mapYtdlpEntryToSearchItem({
      id: 'abcdefghijk',
      title: 'NA',
      channel: 'Marcin Plaza',
    }), null)
    assert.equal(mapYtdlpEntryToSearchItem({
      id: 'abcdefghijk',
      title: 'YouTube video',
      channel: 'Marcin Plaza',
    }), null)
    assert.equal(mapYtdlpEntryToSearchItem({
      id: 'UCoookXUzPciGrEZEXmh4Jjg',
      title: 'Marcin Plaza',
      channel: 'Marcin Plaza',
    }), null)
  })

  it('synthesizes a thumbnail from the video id when missing', () => {
    const item = mapYtdlpEntryToSearchItem({ id: 'abcdefghijk', title: 'Clip' })
    assert.ok(item)
    assert.equal(item.thumbnailUrl, 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg')
  })
})

describe('mapYtdlpPlaylistDump', () => {
  it('marks deleted entries unavailable and keeps durations on public items', () => {
    const dump: YtdlpDump = {
      id: 'PLtest12345',
      title: 'Kids songs',
      channel: 'Example',
      playlist_count: 3,
      entries: [
        { id: 'aaaaaaaaaaa', title: 'Hello', duration: 90, channel: 'Example' },
        { title: '[Deleted video]' },
        { id: 'bbbbbbbbbbb', title: '[Private video]' },
      ],
    }
    const mapped = mapYtdlpPlaylistDump(dump, { playlistId: 'PLtest12345', start: 1, pageSize: 50 })
    assert.equal(mapped.items[0]?.available, true)
    assert.equal(mapped.items[0]?.durationSeconds, 90)
    assert.equal(isImportableYoutubeResult({ durationSeconds: mapped.items[0]?.durationSeconds }), true)
    assert.equal(mapped.items[1]?.available, false)
    assert.equal(mapped.items[2]?.available, false)
    assert.equal(mapped.playlist?.itemCount, 3)
  })
})

describe('mapYtdlpChannelDump', () => {
  it('resolves channel id and page token from a videos tab dump', () => {
    const dump: YtdlpDump = {
      id: 'UCoookXUzPciGrEZEXmh4Jjg',
      channel: 'Sesame Street',
      channel_id: 'UCoookXUzPciGrEZEXmh4Jjg',
      title: 'Sesame Street - Videos',
      entries: Array.from({ length: 12 }, (_, i) => ({
        id: `id${String(i).padStart(9, '0')}`,
        title: `Video ${i}`,
        duration: 60 + i,
      })),
    }
    const mapped = mapYtdlpChannelDump(dump, { start: 1, maxResults: 12 })
    assert.equal(mapped.channel.id, 'UCoookXUzPciGrEZEXmh4Jjg')
    assert.equal(mapped.channel.title, 'Sesame Street')
    assert.equal(mapped.items.length, 12)
    assert.equal(mapped.items[0]?.durationSeconds, 60)
    assert.equal(mapped.nextPageToken, encodeYtdlpPageToken(13))
  })

  it('drops untitled stubs without shifting the page token', () => {
    const dump: YtdlpDump = {
      id: 'UCoookXUzPciGrEZEXmh4Jjg',
      channel: 'Marcin Plaza',
      channel_id: 'UCoookXUzPciGrEZEXmh4Jjg',
      entries: [
        { id: 'aaaaaaaaaaa', title: 'Real clip', duration: 60 },
        { id: 'bbbbbbbbbbb', channel: 'Marcin Plaza' },
        { id: 'ccccccccccc', title: 'Also real', duration: 90 },
      ],
    }
    const mapped = mapYtdlpChannelDump(dump, { start: 1, maxResults: 3 })
    assert.deepEqual(mapped.items.map(item => item.id), ['aaaaaaaaaaa', 'ccccccccccc'])
    assert.equal(mapped.nextPageToken, encodeYtdlpPageToken(4))
  })
})

describe('unwrapYtdlpEntries', () => {
  it('treats a single video dump as one entry', () => {
    assert.equal(unwrapYtdlpEntries(searchEntry).length, 1)
  })
})
