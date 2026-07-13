export interface YoutubeVideo {
  id: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  publishedAt: string
  duration?: string
  description?: string
}

export type YoutubeVideoSummary = Omit<YoutubeVideo, 'duration' | 'description'>

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
