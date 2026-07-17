import type { PlaylistTrack } from './types'

/** Official Yoto MYO card capacity (support.yotoplay.com). */
export const YOTO_MYO_MAX_TRACKS = 100
export const YOTO_MYO_MAX_TRACK_SECONDS = 60 * 60
export const YOTO_MYO_MAX_TRACK_BYTES = 100 * 1024 * 1024
export const YOTO_MYO_MAX_CARD_SECONDS = 5 * 60 * 60
export const YOTO_MYO_MAX_CARD_BYTES = 500 * 1024 * 1024

export const YOTO_MYO_TRACK_COUNT_MESSAGE
  = 'Yoto MYO cards allow up to 100 tracks. Remove some tracks before updating.'

export const YOTO_MYO_CARD_TOTALS_MESSAGE
  = 'This playlist exceeds Yoto’s 5-hour / 500 MB card limit.'

export function formatTrackMediaLimitError(title: string): string {
  const label = title.trim() || 'This track'
  return `"${label}" is over Yoto’s 60-minute / 100 MB per-track limit.`
}

export function getTrackCountLimitError(count: number): string | null {
  if (count > YOTO_MYO_MAX_TRACKS) return YOTO_MYO_TRACK_COUNT_MESSAGE
  return null
}

export function getTrackMediaLimitError(input: {
  title: string
  duration?: number | null
  fileSize?: number | null
}): string | null {
  const duration = input.duration
  const fileSize = input.fileSize
  const overDuration = typeof duration === 'number'
    && Number.isFinite(duration)
    && duration > YOTO_MYO_MAX_TRACK_SECONDS
  const overSize = typeof fileSize === 'number'
    && Number.isFinite(fileSize)
    && fileSize > YOTO_MYO_MAX_TRACK_BYTES

  if (overDuration || overSize) {
    return formatTrackMediaLimitError(input.title)
  }
  return null
}

export function getCardTotalsLimitError(input: {
  totalDuration: number
  totalFileSize: number
}): string | null {
  const overDuration = Number.isFinite(input.totalDuration)
    && input.totalDuration > YOTO_MYO_MAX_CARD_SECONDS
  const overSize = Number.isFinite(input.totalFileSize)
    && input.totalFileSize > YOTO_MYO_MAX_CARD_BYTES

  if (overDuration || overSize) return YOTO_MYO_CARD_TOTALS_MESSAGE
  return null
}

function trackDurationSeconds(track: PlaylistTrack): number | undefined {
  if (typeof track.duration === 'number' && Number.isFinite(track.duration) && track.duration > 0) {
    return track.duration
  }
  const reuse = track.yotoReuse?.duration
  if (typeof reuse === 'number' && Number.isFinite(reuse) && reuse > 0) {
    return reuse
  }
  return undefined
}

export interface PlaylistCapacitySnapshot {
  trackCount: number
  trackMax: number
  knownDurationSeconds: number
  durationMax: number
  /** False when any track is missing a usable duration. */
  durationComplete: boolean
}

export function getPlaylistCapacitySnapshot(playlist: PlaylistTrack[]): PlaylistCapacitySnapshot {
  const durations = playlist.map(trackDurationSeconds)
  const known = durations.filter((d): d is number => typeof d === 'number')
  return {
    trackCount: playlist.length,
    trackMax: YOTO_MYO_MAX_TRACKS,
    knownDurationSeconds: known.reduce((sum, n) => sum + n, 0),
    durationMax: YOTO_MYO_MAX_CARD_SECONDS,
    durationComplete: playlist.length === 0 || known.length === playlist.length,
  }
}

/** Compact MYO duration readout: `12m`, `1h 05m`, `5h`. */
export function formatCapacityDuration(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  if (h <= 0) return `${m}m`
  if (m <= 0) return `${h}h`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function trackFileSizeBytes(track: PlaylistTrack): number | undefined {
  const reuse = track.yotoReuse?.fileSize
  if (typeof reuse === 'number' && Number.isFinite(reuse) && reuse > 0) {
    return reuse
  }
  return undefined
}

/**
 * Client preflight using only known playlist fields.
 * Returns an error when track count exceeds the cap, or when every track has
 * duration/size and those known values violate MYO limits.
 * Incomplete metadata is ignored (server enforces after download/transcode).
 */
export function getPlaylistPreflightLimitError(playlist: PlaylistTrack[]): string | null {
  const countError = getTrackCountLimitError(playlist.length)
  if (countError) return countError

  const durations = playlist.map(trackDurationSeconds)
  if (durations.every((d): d is number => typeof d === 'number')) {
    for (let i = 0; i < playlist.length; i++) {
      const trackError = getTrackMediaLimitError({
        title: playlist[i]!.title,
        duration: durations[i],
      })
      if (trackError) return trackError
    }
    const cardError = getCardTotalsLimitError({
      totalDuration: durations.reduce((sum, n) => sum + n, 0),
      totalFileSize: 0,
    })
    if (cardError) return cardError
  }

  const sizes = playlist.map(trackFileSizeBytes)
  if (sizes.every((s): s is number => typeof s === 'number')) {
    for (let i = 0; i < playlist.length; i++) {
      const trackError = getTrackMediaLimitError({
        title: playlist[i]!.title,
        fileSize: sizes[i],
      })
      if (trackError) return trackError
    }
    const cardError = getCardTotalsLimitError({
      totalDuration: 0,
      totalFileSize: sizes.reduce((sum, n) => sum + n, 0),
    })
    if (cardError) return cardError
  }

  return null
}

const TRACK_MEDIA_LIMIT_MESSAGE_RE
  = /^"(.+)" is over Yoto’s 60-minute \/ 100 MB per-track limit\.$/

/**
 * Rewrite opaque Yoto API error text that looks like a capacity/limit failure.
 * Pass `trackTitle` when the failing track is known (save job active track).
 */
export function mapYotoApiLimitError(
  message: string,
  trackTitle?: string | null,
): string | null {
  const text = message.trim()
  if (!text) return null

  const titled = trackTitle?.trim() || ''
  const existing = text.match(TRACK_MEDIA_LIMIT_MESSAGE_RE)
  if (existing) {
    const label = existing[1] ?? 'This track'
    if (label !== 'This track') return null
    if (titled) return formatTrackMediaLimitError(titled)
    return null
  }

  const lower = text.toLowerCase()

  if (/\b100\s*tracks?\b|\btrack\s*count\b|\btoo\s*many\s*tracks?\b/i.test(lower)) {
    return YOTO_MYO_TRACK_COUNT_MESSAGE
  }

  const hintsCapacity = /(?:\b(?:limit|capacity|quota|exceed|maximum|filesize|file\s*size|duration)\b)|(?:too\s+(?:large|long))|(?:\b(?:100|500)\s*m(?:b|ib)\b)|(?:\b(?:60|5)\s*(?:min(?:ute)?s?|hours?)\b)/i.test(
    lower,
  )
  if (!hintsCapacity) return null

  if (
    /\b(?:500\s*m(?:b|ib)|5\s*hours?|card\s*(?:limit|capacity|total)|playlist\s*(?:limit|capacity))\b/i.test(lower)
  ) {
    return YOTO_MYO_CARD_TOTALS_MESSAGE
  }

  if (
    /\b(?:100\s*m(?:b|ib)|60\s*min(?:ute)?s?|per[- ]?track|single\s*track|track\s*(?:limit|too\s*(?:large|long)))\b/i.test(
      lower,
    )
  ) {
    return formatTrackMediaLimitError(titled || 'This track')
  }

  return YOTO_MYO_CARD_TOTALS_MESSAGE
}

export function withMappedYotoLimitError(
  message: string,
  trackTitle?: string | null,
): string {
  return mapYotoApiLimitError(message, trackTitle) ?? message
}
