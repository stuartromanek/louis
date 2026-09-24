import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canRefreshSelectedPlaylist,
  shouldRefreshYotoOnResume,
  YOTO_RESUME_REFRESH_INTERVAL_MS,
} from './playlistSync.ts'

describe('canRefreshSelectedPlaylist', () => {
  const cleanSelection = {
    selectedCardId: 'card-1',
    isNewPlaylist: false,
    loading: false,
    isDirty: false,
    isSaving: false,
  }

  it('allows a clean, idle selected playlist to refresh', () => {
    assert.equal(canRefreshSelectedPlaylist(cleanSelection), true)
  })

  it('protects unpublished, loading, saving, new, and unselected state', () => {
    assert.equal(canRefreshSelectedPlaylist({ ...cleanSelection, isDirty: true }), false)
    assert.equal(canRefreshSelectedPlaylist({ ...cleanSelection, loading: true }), false)
    assert.equal(canRefreshSelectedPlaylist({ ...cleanSelection, isSaving: true }), false)
    assert.equal(canRefreshSelectedPlaylist({ ...cleanSelection, isNewPlaylist: true }), false)
    assert.equal(canRefreshSelectedPlaylist({ ...cleanSelection, selectedCardId: null }), false)
  })
})

describe('shouldRefreshYotoOnResume', () => {
  it('refreshes a connected session with no successful fetch', () => {
    assert.equal(shouldRefreshYotoOnResume({
      connected: true,
      lastSuccessfulFetchAt: 0,
      now: 1,
    }), true)
  })

  it('throttles repeated focus and visibility events', () => {
    const lastSuccessfulFetchAt = 10_000
    assert.equal(shouldRefreshYotoOnResume({
      connected: true,
      lastSuccessfulFetchAt,
      now: lastSuccessfulFetchAt + YOTO_RESUME_REFRESH_INTERVAL_MS - 1,
    }), false)
    assert.equal(shouldRefreshYotoOnResume({
      connected: true,
      lastSuccessfulFetchAt,
      now: lastSuccessfulFetchAt + YOTO_RESUME_REFRESH_INTERVAL_MS,
    }), true)
  })

  it('does not refresh while disconnected', () => {
    assert.equal(shouldRefreshYotoOnResume({
      connected: false,
      lastSuccessfulFetchAt: 0,
      now: 100_000,
    }), false)
  })
})
