export interface YoutubeVideo {
  id: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  publishedAt: string
  /** YouTube contentDetails.duration ISO-8601 string (e.g. PT3M42S). */
  duration?: string
  /** Parsed duration in seconds when known. */
  durationSeconds?: number
  description?: string
}

/** Search-row shape: duration fields when enriched; no description. */
export type YoutubeVideoSummary = Omit<YoutubeVideo, 'description'>

export interface YoutubeSearchResponse {
  items: YoutubeVideoSummary[]
  nextPageToken?: string
  prevPageToken?: string
}

export interface YoutubeVideosResponse {
  items: YoutubeVideo[]
}

export type PickerStatus = 'idle' | 'loading' | 'error'

export type ResultsLayout = 'tiles' | 'list'
