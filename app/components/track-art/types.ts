export type TrackArtTab = 'icons' | 'draw'

export type TrackArtIconSource = 'yoto' | 'yotoicons'

export interface TrackArtIconItem {
  id: string
  mediaId?: string
  title: string
  tags: string[]
  url: string
  source: TrackArtIconSource
  author?: string
}

export interface TrackArtUploadResult {
  mediaId: string
  url: string
  displayIconId?: string | null
  new?: boolean
}

export const TRACK_ART_PALETTE = [
  '#000000',
  '#FFFFFF',
  '#CBCCBE',
  '#666660',
  '#FF8080',
  '#FF9400',
  '#FFC800',
  '#00BF3A',
  '#05CF9C',
  '#0068FF',
  '#83BBFF',
  '#FA97FF',
  '#8B4513',
  '#FFCCCC',
  '#FFFF55',
  '#7B4B94',
] as const
