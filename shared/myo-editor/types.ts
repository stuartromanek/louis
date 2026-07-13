export type TrackSource =
  | 'app-youtube'
  | 'youtube-url'
  | 'yoto-upload'
  | 'stream'
  | 'unknown'

export interface YotoTrackPayload {
  key: string
  title: string
  trackUrl: string
  type: 'audio' | 'stream'
  format: string
  duration: number
  fileSize: number
  overlayLabel: string
  channels?: 'stereo' | 'mono'
  display?: { icon16x16: string | null }
  uid?: string
}

/** Snapshot of Yoto track fields needed to reuse without re-upload. */
export type YotoTrackReuseSnapshot = Omit<YotoTrackPayload, 'key' | 'title' | 'overlayLabel'>

export interface YotoTrackDetail extends YotoTrackPayload {
  chapterKey: string
  trackKey: string
  /** Parent chapter icon when flattened from card detail */
  chapterDisplay?: { icon16x16: string | null }
}

export interface YotoChapterDetail {
  key: string
  title: string
  display?: { icon16x16: string | null }
  tracks: YotoTrackDetail[]
}

export interface YotoCardCover {
  imageL?: string | null
}

/** Metadata returned from Yoto content API — preserved on save to avoid clearing cover, etc. */
export interface YotoCardMetadata {
  title?: string
  description?: string
  author?: string
  cover?: YotoCardCover
  category?: string
  note?: string
  feedUrl?: string
  media?: {
    duration?: number
    fileSize?: number
    readableFileSize?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface YotoCardDetail {
  cardId: string
  title: string
  contentVersion: string | null
  metadataNote: string | null
  feedUrl: string | null
  metadata: YotoCardMetadata | null
  chapters: YotoChapterDetail[]
}

export interface PlaylistTrack {
  id: string
  title: string
  subtitle: string
  thumbnailUrl: string
  source: TrackSource
  youtubeId?: string
  chapterKey?: string
  trackKey?: string
  duration?: number
  /** Parent chapter icon from the loaded card (preserved on save). */
  chapterDisplay?: { icon16x16: string | null }
  /** Cached Yoto fields for reuse on save (avoids ambiguous lookups). */
  yotoReuse?: YotoTrackReuseSnapshot
}

export interface ProvenanceTrackEntry {
  chapterKey: string
  trackKey: string
  youtubeId: string
  title: string
}

export interface YotoCardsManifest {
  version: number
  tracks: ProvenanceTrackEntry[]
}

export const YOTO_CARDS_CONTENT_VERSION = 'yoto-cards:1'

export interface TranscodedAudioResult {
  transcodedSha256: string
  transcodedInfo: {
    duration?: number
    fileSize?: number
    channels?: number | string
    format?: string
    metadata?: { title?: string }
  }
}

export type SaveTrackAction =
  | { kind: 'extract-youtube'; youtubeId: string; playlistIndex: number }
  | { kind: 'reuse-yoto'; snapshot: YotoTrackReuseSnapshot; playlistIndex: number }
  | { kind: 'passthrough-stream'; snapshot: YotoTrackReuseSnapshot; playlistIndex: number }
  | { kind: 'unsupported'; reason: string; playlistIndex: number }

export interface SavePlan {
  tracks: SaveTrackAction[]
  errors: string[]
}

export type SaveJobPhase =
  | 'planning'
  | 'downloading'
  | 'uploading'
  | 'posting'
  | 'complete'
  | 'failed'

export type SaveTrackStatus =
  | 'pending'
  | 'extracting'
  | 'uploading'
  | 'transcoding'
  | 'ready'
  | 'skipped'
  | 'failed'

export interface SaveJobTrackProgress {
  playlistIndex: number
  title: string
  status: SaveTrackStatus
  error?: string
}

export interface SaveJobState {
  id: string
  cardId: string
  status: SaveJobPhase
  /** Monotonic 0–100 progress for the entire save job. */
  progress: number
  /** 0–100 progress for the current step (per-track download/upload/transcode). */
  operationProgress: number
  error?: string
  tracks: SaveJobTrackProgress[]
  createdAt: number
}
