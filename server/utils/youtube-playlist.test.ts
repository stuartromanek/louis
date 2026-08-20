import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fetchYoutubePlaylistPageSources } from './youtube-playlist.ts'

describe('fetchYoutubePlaylistPageSources', () => {
  it('retains public-playlist metadata validation for paginated requests', async () => {
    const calls: Array<{ cacheKey: string, url: string }> = []
    const playlistResponse = { items: [{ id: 'PL1234567890' }] }
    const itemsResponse = { items: [], nextPageToken: 'next-token' }

    const fetchCached = async <T>(cacheKey: string, url: string): Promise<T> => {
      calls.push({ cacheKey, url })
      return (cacheKey.startsWith('playlist-items:')
        ? itemsResponse
        : playlistResponse) as T
    }

    const [playlist, items] = await fetchYoutubePlaylistPageSources<
      typeof playlistResponse,
      typeof itemsResponse
    >(fetchCached, {
      playlistId: 'PL1234567890',
      pageToken: 'page-two-token',
      apiKey: 'test-key',
    })

    assert.equal(playlist, playlistResponse)
    assert.equal(items, itemsResponse)
    assert.equal(calls.length, 2)
    assert.equal(calls[0]?.cacheKey, 'playlist:PL1234567890')
    assert.match(calls[0]?.url ?? '', /\/youtube\/v3\/playlists\?/)
    assert.equal(calls[1]?.cacheKey, 'playlist-items:PL1234567890:page-two-token')
    assert.match(calls[1]?.url ?? '', /pageToken=page-two-token/)
  })
})
