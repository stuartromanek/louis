export interface YoutubePlaylistPageSourceOptions {
  playlistId: string
  pageToken?: string
  apiKey: string
}

type YoutubeApiFetcher = <T>(cacheKey: string, url: string) => Promise<T>

/**
 * Fetch playlist metadata on every page so public-only validation cannot be
 * bypassed or accidentally skipped. The shared API cache avoids repeat quota
 * cost while the user pages through a playlist.
 */
export async function fetchYoutubePlaylistPageSources<TPlaylist, TItems>(
  fetchCached: YoutubeApiFetcher,
  options: YoutubePlaylistPageSourceOptions,
): Promise<[TPlaylist, TItems]> {
  const playlistParams = new URLSearchParams({
    part: 'snippet,contentDetails,status',
    id: options.playlistId,
    key: options.apiKey,
  })
  const itemsParams = new URLSearchParams({
    part: 'snippet,contentDetails',
    playlistId: options.playlistId,
    maxResults: '50',
    key: options.apiKey,
  })
  if (options.pageToken) itemsParams.set('pageToken', options.pageToken)

  return await Promise.all([
    fetchCached<TPlaylist>(
      `playlist:${options.playlistId}`,
      `https://www.googleapis.com/youtube/v3/playlists?${playlistParams}`,
    ),
    fetchCached<TItems>(
      `playlist-items:${options.playlistId}:${options.pageToken ?? ''}`,
      `https://www.googleapis.com/youtube/v3/playlistItems?${itemsParams}`,
    ),
  ])
}
