import type { PlaylistTrack, TranscodedAudioResult } from '../../shared/myo-editor/types.ts'
import { extractGroupShouldCutParts } from '../../shared/myo-editor/splitTrack.ts'
import {
  effectiveCutRange,
  isTrimmed,
  type AudioCutRange,
} from '../../shared/myo-editor/trackTrim.ts'
import {
  shouldSkipSplitSourceDownload,
  type SplitPartTranscodeCacheKey,
} from './split-transcode-cache.ts'

export type ExtractCutVia = 'trim' | 'split'

export interface YoutubeGroupExtractPart {
  cacheHit: boolean
  cut: AudioCutRange | null
  cutVia: ExtractCutVia | null
  loudnormPart: boolean
  upload: boolean
}

export interface YoutubeGroupExtractPlan {
  shouldCut: boolean
  skipDownload: boolean
  loudnormFullFile: boolean
  parts: YoutubeGroupExtractPart[]
}

export function extractCutCacheKey(
  youtubeId: string,
  track: PlaylistTrack,
  normalizeVolume: boolean,
  actualDuration?: number,
): SplitPartTranscodeCacheKey | null {
  const range = effectiveCutRange(track, actualDuration)
    ?? (track.split
      ? {
          startSeconds: track.split.startSeconds,
          durationSeconds: track.split.durationSeconds,
        }
      : null)
  if (!range) return null
  return {
    youtubeId,
    index: track.split?.index ?? 0,
    count: track.split?.count ?? 1,
    normalizeVolume,
    startSeconds: range.startSeconds,
    durationSeconds: range.durationSeconds,
  }
}

export function youtubeGroupShouldCut(
  tracks: PlaylistTrack[],
  actualDuration?: number,
): boolean {
  return extractGroupShouldCutParts(tracks)
    || tracks.some(track => Boolean(effectiveCutRange(track, actualDuration)))
}

export function planYoutubeGroupExtract(input: {
  youtubeId: string
  tracks: PlaylistTrack[]
  normalizeVolume: boolean
  actualDuration?: number
  cacheHits?: Array<TranscodedAudioResult | null>
}): YoutubeGroupExtractPlan {
  const tracks = input.tracks
  const cacheHits = input.cacheHits ?? tracks.map(() => null)
  const shouldCut = youtubeGroupShouldCut(tracks, input.actualDuration)
  const skipDownload = shouldCut && shouldSkipSplitSourceDownload(cacheHits)
  const loudnormFullFile = input.normalizeVolume && !shouldCut

  const parts = tracks.map((track, index) => {
    const cacheHit = cacheHits[index] != null
    if (cacheHit) {
      return {
        cacheHit: true,
        cut: null,
        cutVia: null,
        loudnormPart: false,
        upload: false,
      }
    }
    const cut = shouldCut ? effectiveCutRange(track, input.actualDuration) : null
    const cutVia: ExtractCutVia | null = cut
      ? (isTrimmed(track) ? 'trim' : 'split')
      : null
    return {
      cacheHit: false,
      cut,
      cutVia,
      loudnormPart: input.normalizeVolume && shouldCut,
      upload: true,
    }
  })

  return { shouldCut, skipDownload, loudnormFullFile, parts }
}
