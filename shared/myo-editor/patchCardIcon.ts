import type { PlaylistTrack, YotoCardDetail, YotoTrackPayload } from './types.ts'
import { playlistRowId } from './playlistRowId.ts'

export type PatchedContentChapter = {
  key: string
  title: string
  overlayLabel?: string
  tracks: YotoTrackPayload[]
  display: { icon16x16: string | null }
}

export class PatchCardIconError extends Error {
  readonly code: 'chapter-not-found' | 'track-not-found'

  constructor(message: string, code: 'chapter-not-found' | 'track-not-found') {
    super(message)
    this.name = 'PatchCardIconError'
    this.code = code
  }
}

/** True when the row already exists on the saved card (baseline + Yoto keys). */
export function isPersistedCardTrack(
  track: PlaylistTrack,
  baseline: PlaylistTrack[],
): boolean {
  return Boolean(
    track.chapterKey
    && track.trackKey
    && baseline.some(b => playlistRowId(b) === playlistRowId(track)),
  )
}

/**
 * Rebuild content chapters from card detail, swapping icons on the target chapter
 * (chapter display + tracks[0], and the matching track if it differs).
 */
export function patchCardDetailIcons(
  detail: YotoCardDetail,
  chapterKey: string,
  trackKey: string,
  icon16x16: string,
): PatchedContentChapter[] {
  const chapterIndex = detail.chapters.findIndex(c => c.key === chapterKey)
  if (chapterIndex < 0) {
    throw new PatchCardIconError(`Chapter "${chapterKey}" not found`, 'chapter-not-found')
  }

  const targetChapter = detail.chapters[chapterIndex]!
  const trackIndex = targetChapter.tracks.findIndex(
    t => t.key === trackKey || t.trackKey === trackKey,
  )
  if (trackIndex < 0) {
    throw new PatchCardIconError(
      `Track "${trackKey}" not found in chapter "${chapterKey}"`,
      'track-not-found',
    )
  }

  const display = { icon16x16 }

  return detail.chapters.map((chapter, ci) => {
    const isTarget = ci === chapterIndex
    const tracks: YotoTrackPayload[] = chapter.tracks.map((track, ti) => {
      const shouldPatch = isTarget && (ti === 0 || ti === trackIndex)
      return {
        key: track.key,
        title: track.title,
        trackUrl: track.trackUrl,
        type: track.type,
        format: track.format,
        duration: track.duration,
        fileSize: track.fileSize,
        overlayLabel: track.overlayLabel,
        channels: track.channels,
        display: shouldPatch
          ? display
          : { icon16x16: track.display?.icon16x16 ?? null },
        uid: track.uid,
      }
    })

    return {
      key: chapter.key,
      title: chapter.title,
      overlayLabel: chapter.tracks[0]?.overlayLabel,
      tracks,
      display: isTarget
        ? display
        : { icon16x16: chapter.display?.icon16x16 ?? null },
    }
  })
}
