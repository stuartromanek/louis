import type { PlaylistTrack } from './types.ts'

export const TRIM_MIN_SECONDS = 1
export const TRIM_FULL_FILE_EPSILON_SECONDS = 0.05

export type TrackTrim = {
  startSeconds: number
  endSeconds: number
}

export type AudioCutRange = {
  startSeconds: number
  durationSeconds: number
}

export type PreviewWindow = {
  startSeconds: number
  durationSeconds: number
}

function positiveSeconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

export function youtubeIdForTrack(track: Pick<PlaylistTrack, 'youtubeId' | 'source' | 'id'>): string | undefined {
  const id = track.youtubeId ?? (track.source === 'app-youtube' ? track.id : undefined)
  const trimmed = id?.trim()
  return trimmed || undefined
}

export function canTrimTrack(track: Pick<PlaylistTrack, 'source' | 'youtubeId' | 'id'>): boolean {
  if (track.source !== 'app-youtube' && track.source !== 'youtube-url') return false
  return Boolean(youtubeIdForTrack(track))
}

export function sourceDurationSeconds(track: PlaylistTrack): number | undefined {
  return positiveSeconds(track.duration)
    ?? positiveSeconds(track.split?.durationSeconds)
    ?? positiveSeconds(track.yotoReuse?.duration)
}

/** Full YouTube file length. Split parts store this on `split.sourceDurationSeconds`. */
export function sourceFileDurationSeconds(track: PlaylistTrack): number | undefined {
  return positiveSeconds(track.split?.sourceDurationSeconds)
    ?? (track.split ? undefined : sourceDurationSeconds(track))
}

export function scaleTrimToDuration(
  trim: TrackTrim | null | undefined,
  fromDuration: number,
  toDuration: number,
): TrackTrim | null {
  if (!trim) return null
  if (!(toDuration > 0)) return null
  const from = fromDuration > 0 ? fromDuration : toDuration
  const scale = toDuration / from
  const resolved = clampTrim(trim.startSeconds * scale, trim.endSeconds * scale, toDuration)
  if (isFullFileTrim(resolved.startSeconds, resolved.endSeconds, toDuration)) return null
  return resolved
}

export function isFullFileTrim(
  startSeconds: number,
  endSeconds: number,
  durationSeconds: number,
  epsilon: number = TRIM_FULL_FILE_EPSILON_SECONDS,
): boolean {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return true
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) return true
  return startSeconds <= epsilon && endSeconds >= durationSeconds - epsilon
}

export function clampTrim(
  startSeconds: number,
  endSeconds: number,
  durationSeconds: number,
  minKeep: number = TRIM_MIN_SECONDS,
): TrackTrim {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0
  if (duration <= 0) return { startSeconds: 0, endSeconds: 0 }

  const keep = Math.min(minKeep, duration)
  const start = Math.min(
    Math.max(0, Number.isFinite(startSeconds) ? startSeconds : 0),
    Math.max(0, duration - keep),
  )
  const end = Math.min(
    duration,
    Math.max(start + keep, Number.isFinite(endSeconds) ? endSeconds : duration),
  )
  return { startSeconds: start, endSeconds: end }
}

export function resolveTrim(track: PlaylistTrack, durationSeconds?: number): TrackTrim {
  const duration = durationSeconds ?? sourceFileDurationSeconds(track) ?? sourceDurationSeconds(track) ?? 0
  const trim = track.trim
  if (!trim) return { startSeconds: 0, endSeconds: duration }
  return clampTrim(trim.startSeconds, trim.endSeconds, duration)
}

export function isTrimmed(track: PlaylistTrack, durationSeconds?: number): boolean {
  const duration = durationSeconds
    ?? sourceFileDurationSeconds(track)
    ?? sourceDurationSeconds(track)
  if (typeof duration !== 'number' || duration <= 0) return false
  const trim = track.trim
  if (!trim) return false
  const resolved = clampTrim(trim.startSeconds, trim.endSeconds, duration)
  return !isFullFileTrim(resolved.startSeconds, resolved.endSeconds, duration)
}

export function trimmedDurationSeconds(track: PlaylistTrack): number | undefined {
  if (track.split) {
    return sourceDurationSeconds(track)
  }
  const duration = sourceDurationSeconds(track)
  if (typeof duration !== 'number') return undefined
  if (!isTrimmed(track, duration)) return duration
  const trim = resolveTrim(track, duration)
  return Math.max(0, trim.endSeconds - trim.startSeconds)
}

/** Trim editor is always the full YouTube file (offset 0). */
export function previewOffsetSeconds(_track?: PlaylistTrack): number {
  return 0
}

/** Full-file window for the trim editor. */
export function previewWindow(track: PlaylistTrack): PreviewWindow {
  const duration = sourceFileDurationSeconds(track)
    ?? sourceDurationSeconds(track)
    ?? 0
  return { startSeconds: 0, durationSeconds: duration }
}

/**
 * ffmpeg cut against the downloaded YouTube file.
 * Null means upload the full file (no split, no meaningful trim).
 */
export function effectiveCutRange(
  track: PlaylistTrack,
  probedSourceDuration?: number,
): AudioCutRange | null {
  if (track.split) {
    const start = track.split.startSeconds
    const duration = track.split.durationSeconds
    if (!(duration > 0)) return null
    const full = positiveSeconds(probedSourceDuration)
      ?? positiveSeconds(track.split.sourceDurationSeconds)
      ?? start + duration
    if (isFullFileTrim(start, start + duration, full)) return null
    return { startSeconds: start, durationSeconds: duration }
  }

  const fileDuration = positiveSeconds(probedSourceDuration)
    ?? sourceDurationSeconds(track)
    ?? 0
  if (!(fileDuration > 0)) return null
  if (!isTrimmed(track, fileDuration)) return null
  const trim = resolveTrim(track, fileDuration)
  const duration = trim.endSeconds - trim.startSeconds
  if (isFullFileTrim(trim.startSeconds, trim.endSeconds, fileDuration)) return null
  return { startSeconds: trim.startSeconds, durationSeconds: duration }
}
