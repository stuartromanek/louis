import { YOTO_MYO_MAX_TRACK_SECONDS } from './yotoMyoLimits.ts'

/** Full hint for title / aria. */
export const YOTO_MYO_OVER_TRACK_DURATION_MESSAGE
  = 'Over 1 hour — too long for a MYO card'

/** Short stamp label on over-limit result thumbs. */
export const YOTO_MYO_OVER_TRACK_DURATION_STAMP = 'TOO LONG'

/** Footer label on restricted over-limit result cards. */
export const YOTO_MYO_OVER_TRACK_DURATION_FOOTER = 'Track is over an hour'

/** Tooltip for the over-hour info control. */
export const YOTO_MYO_OVER_TRACK_DURATION_TOOLTIP
  = 'Yoto guidelines warn that a single MYO track has a max length of 1 hour, however tracks slightly longer will often succeed.'

/** Chip on unlocked over-hour result cards. */
export const YOTO_MYO_LONG_TRACK_CHIP = 'Over 1 Hour'

/**
 * Parse YouTube `contentDetails.duration` ISO-8601 strings (`PT1H5M30S`) to seconds.
 */
export function parseYoutubeDurationIso(iso: string): number | null {
  const trimmed = iso.trim()
  if (!trimmed) return null

  const match = trimmed.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
  if (!match) return null

  const hours = match[1] ? Number(match[1]) : 0
  const minutes = match[2] ? Number(match[2]) : 0
  const seconds = match[3] ? Number(match[3]) : 0
  if (![hours, minutes, seconds].every(n => Number.isFinite(n))) return null

  // Reject empty `PT` with no components — treat as unknown rather than 0.
  if (!match[1] && !match[2] && !match[3]) return null

  return hours * 3600 + minutes * 60 + seconds
}

export function isOverMyoTrackDuration(seconds: number): boolean {
  return Number.isFinite(seconds) && seconds > YOTO_MYO_MAX_TRACK_SECONDS
}

/** Format seconds as `m:ss` or `h:mm:ss`. */
export function formatDurationSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return ''
  const whole = Math.floor(totalSeconds)
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Format a YouTube ISO duration for display. */
export function formatYoutubeDurationIso(iso?: string | null): string {
  if (!iso) return ''
  const seconds = parseYoutubeDurationIso(iso)
  if (seconds === null) return iso
  return formatDurationSeconds(seconds)
}
