import type { PlaylistTrack } from './types.ts'
import { playlistRowId } from './playlistRowId.ts'
import { resolveDisplayIcon } from './yotoTrackPayload.ts'

export type ResolvedTrackIcon = {
  icon16x16: string | null
  previewUrl: string | null
}

/** Strip `yoto:#` prefix from a display icon value. */
export function mediaIdFromIcon16x16(icon: string | null | undefined): string | null {
  if (!icon || typeof icon !== 'string') return null
  const trimmed = icon.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('yoto:#')) return trimmed.slice('yoto:#'.length) || null
  if (trimmed.startsWith('yoto:')) return trimmed.slice('yoto:'.length).replace(/^#/, '') || null
  return trimmed
}

export function icon16x16FromMediaId(mediaId: string): string {
  const id = mediaId.trim().replace(/^yoto:#?/, '')
  return `yoto:#${id}`
}

export function resolveTrackIcon(track: PlaylistTrack): ResolvedTrackIcon {
  const display = resolveDisplayIcon(track.yotoReuse?.display, track.chapterDisplay)
  return {
    icon16x16: display.icon16x16,
    previewUrl: track.iconPreviewUrl?.trim() || null,
  }
}

/**
 * Apply a Yoto display icon to a playlist row (chapter + track display when reuse exists).
 * Content save mirrors chapter↔track via displaysForPlaylistTrack.
 */
export function applyTrackIcon(
  track: PlaylistTrack,
  icon16x16: string,
  previewUrl: string,
): PlaylistTrack {
  const display = { icon16x16 }
  const next: PlaylistTrack = {
    ...track,
    chapterDisplay: display,
    iconPreviewUrl: previewUrl,
  }
  if (track.yotoReuse) {
    next.yotoReuse = { ...track.yotoReuse, display }
  }
  return next
}

/** Snapshot key for dirty detection (row id + icon). */
export function playlistTrackArtSnapshot(track: PlaylistTrack): {
  id: string
  icon: string | null
} {
  return {
    id: playlistRowId(track),
    icon: resolveTrackIcon(track).icon16x16,
  }
}
