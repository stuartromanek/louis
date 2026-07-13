export type {
  TrackSource,
  YotoTrackDetail as YotoTrack,
  YotoChapterDetail as YotoChapter,
  YotoCardDetail,
  ProvenanceTrackEntry,
  YotoCardsManifest,
  SaveJobState,
  SaveJobPhase,
  SaveTrackStatus,
  SaveJobTrackProgress,
} from '#shared/myo-editor/types'

export { YOTO_CARDS_CONTENT_VERSION } from '#shared/myo-editor/types'

import type { YotoTrackDetail, TrackSource } from '#shared/myo-editor/types'

export interface ClassifiedTrack extends YotoTrackDetail {
  source: TrackSource
  youtubeId?: string
}
