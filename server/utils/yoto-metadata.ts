import type { YotoCardMetadata } from '#shared/myo-editor/types'

export interface ContentMetadataPatch {
  title: string
  note: string
  media: {
    duration: number
    fileSize: number
    readableFileSize: number
  }
}

/** Merge playlist updates into existing card metadata without dropping cover art, author, etc. */
export function mergeContentMetadata(
  existing: YotoCardMetadata | null | undefined,
  patch: ContentMetadataPatch,
): YotoCardMetadata {
  const existingMedia = existing?.media && typeof existing.media === 'object'
    ? existing.media
    : {}

  return {
    ...existing,
    title: patch.title,
    note: patch.note,
    media: {
      ...existingMedia,
      duration: patch.media.duration,
      fileSize: patch.media.fileSize,
      readableFileSize: patch.media.readableFileSize,
    },
  }
}
