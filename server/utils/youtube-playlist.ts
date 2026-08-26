import { parseYoutubeDurationIso } from '../../shared/myo-editor/youtubeDuration.ts'
import type { YoutubePlaylistImportResponse } from '../../shared/myo-editor/youtubePlaylistImport.ts'
import { decodeHtmlEntities, fetchYoutubeApiCached, pickThumbnail } from './youtube.ts'

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

interface YoutubePlaylistListItem {
  id: string
  snippet?: {
    title?: string
    channelTitle?: string
  }
  contentDetails?: {
    itemCount?: number
  }
  status?: {
    privacyStatus?: string
  }
}

interface YoutubePlaylistListResponse {
  items?: YoutubePlaylistListItem[]
}

interface YoutubePlaylistItem {
  id: string
  snippet?: {
    title?: string
    channelTitle?: string
    position?: number
    thumbnails?: Record<string, { url: string } | undefined>
    resourceId?: {
      videoId?: string
    }
  }
  contentDetails?: {
    videoId?: string
  }
}

interface YoutubePlaylistItemsResponse {
  items?: YoutubePlaylistItem[]
  nextPageToken?: string
}

interface YoutubeVideoItem {
  id: string
  snippet?: {
    title?: string
    channelTitle?: string
    thumbnails?: Record<string, { url: string } | undefined>
  }
  contentDetails?: {
    duration?: string
  }
  status?: {
    uploadStatus?: string
    privacyStatus?: string
  }
}

interface YoutubeVideosResponse {
  items?: YoutubeVideoItem[]
}

export async function fetchYoutubePlaylistViaDataApi(
  apiKey: string,
  options: { playlistId: string, pageToken?: string },
): Promise<YoutubePlaylistImportResponse> {
  const { playlistId, pageToken } = options
  const [playlistData, itemsData] = await fetchYoutubePlaylistPageSources<
    YoutubePlaylistListResponse,
    YoutubePlaylistItemsResponse
  >(fetchYoutubeApiCached, {
    playlistId,
    pageToken,
    apiKey,
  })
  const playlistItem = playlistData?.items?.[0]

  if (!playlistItem) {
    throw createError({
      statusCode: 404,
      message: 'Playlist not found or not public',
    })
  }
  if (playlistItem.status?.privacyStatus !== 'public') {
    throw createError({
      statusCode: 400,
      message: 'Only public playlists can be imported',
    })
  }

  const sourceItems = itemsData.items ?? []
  const videoIds = [
    ...new Set(
      sourceItems
        .map(item => item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]

  let videosData: YoutubeVideosResponse = {}
  if (videoIds.length > 0) {
    const videosParams = new URLSearchParams({
      part: 'snippet,contentDetails,status',
      id: videoIds.join(','),
      key: apiKey,
    })
    videosData = await fetchYoutubeApiCached<YoutubeVideosResponse>(
      `playlist-videos:${[...videoIds].sort().join(',')}`,
      `https://www.googleapis.com/youtube/v3/videos?${videosParams}`,
    )
  }

  const videosById = new Map(
    (videosData.items ?? []).map(video => [video.id, video]),
  )

  return {
    playlist: {
      id: playlistItem.id,
      title: decodeHtmlEntities(playlistItem.snippet?.title ?? 'YouTube playlist'),
      channelTitle: decodeHtmlEntities(playlistItem.snippet?.channelTitle ?? ''),
      itemCount: playlistItem.contentDetails?.itemCount,
    },
    items: sourceItems.map((sourceItem, index) => {
      const videoId
        = sourceItem.contentDetails?.videoId
          ?? sourceItem.snippet?.resourceId?.videoId
          ?? ''
      const video = videosById.get(videoId)
      const duration = video?.contentDetails?.duration
      const durationSeconds = duration
        ? parseYoutubeDurationIso(duration) ?? undefined
        : undefined
      const uploadStatus = video?.status?.uploadStatus?.toLowerCase()
      const privacyStatus = video?.status?.privacyStatus?.toLowerCase()
      const available = Boolean(
        video
        && privacyStatus !== 'private'
        && (!uploadStatus || uploadStatus === 'processed' || uploadStatus === 'uploaded'),
      )

      return {
        playlistItemId: sourceItem.id || `${playlistId}:${pageToken ?? 'first'}:${index}`,
        videoId,
        position: sourceItem.snippet?.position ?? index,
        title: decodeHtmlEntities(
          video?.snippet?.title
          ?? sourceItem.snippet?.title
          ?? 'Unavailable video',
        ),
        channelTitle: decodeHtmlEntities(
          video?.snippet?.channelTitle
          ?? sourceItem.snippet?.channelTitle
          ?? '',
        ),
        thumbnailUrl: pickThumbnail(
          video?.snippet?.thumbnails
          ?? sourceItem.snippet?.thumbnails
          ?? {},
        ),
        duration,
        durationSeconds,
        available,
      }
    }),
    nextPageToken: itemsData.nextPageToken,
  }
}
