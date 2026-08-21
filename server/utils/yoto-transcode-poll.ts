/** Floor: today's "large file" wait (180 × 2s). */
export const TRANSCODE_POLL_FLOOR_MS = 6 * 60 * 1000
export const TRANSCODE_POLL_CAP_MS = 20 * 60 * 1000
export const TRANSCODE_POLL_MS_PER_MB = 8_000
export const TRANSCODE_POLL_MS_PER_AUDIO_MINUTE = 30_000
/** Don't stall-fail until we've waited at least this long. */
export const TRANSCODE_STALL_GRACE_MS = 2 * 60 * 1000
/** Unchanged phase/percent for this long (after grace) → hung. */
export const TRANSCODE_STALL_MS = 4 * 60 * 1000
export const TRANSCODE_POLL_FAST_INTERVAL_MS = 2_000
export const TRANSCODE_POLL_SLOW_INTERVAL_MS = 4_000

export function transcodePollBudget(options: {
  bytes: number
  durationSeconds?: number
}): number {
  const mb = Math.max(0, options.bytes) / 1_000_000
  const sizeMs = mb * TRANSCODE_POLL_MS_PER_MB
  const minutes = Math.max(0, options.durationSeconds ?? 0) / 60
  const durationMs = minutes * TRANSCODE_POLL_MS_PER_AUDIO_MINUTE
  const scaled = Math.max(TRANSCODE_POLL_FLOOR_MS, sizeMs, durationMs)
  return Math.min(TRANSCODE_POLL_CAP_MS, Math.round(scaled))
}

export function transcodePollIntervalMs(elapsedMs: number): number {
  return elapsedMs >= TRANSCODE_STALL_GRACE_MS
    ? TRANSCODE_POLL_SLOW_INTERVAL_MS
    : TRANSCODE_POLL_FAST_INTERVAL_MS
}

export function transcodeProgressKey(phase?: string, percent?: number): string {
  const phaseKey = phase?.trim() || ''
  const percentKey = typeof percent === 'number' && Number.isFinite(percent)
    ? String(Math.round(percent))
    : ''
  return `${phaseKey}|${percentKey}`
}

export function transcodeShouldStall(options: {
  elapsedMs: number
  unchangedMs: number
}): boolean {
  return (
    options.elapsedMs >= TRANSCODE_STALL_GRACE_MS
    && options.unchangedMs >= TRANSCODE_STALL_MS
  )
}

export function formatElapsedMinutes(elapsedMs: number): string {
  const minutes = Math.max(1, Math.round(elapsedMs / 60_000))
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

export function formatTranscodeGiveUpMessage(options: {
  reason: 'stall' | 'timeout'
  title?: string
  partLabel?: string
  lastPercent?: number
  elapsedMs: number
}): string {
  const elapsed = formatElapsedMinutes(options.elapsedMs)
  const who = formatTranscodeSubject(options.title, options.partLabel)
  const at = formatTranscodePercent(options.lastPercent)
  if (options.reason === 'stall') {
    return `Yoto stopped making progress on ${who}${at} after ${elapsed}.`
  }
  return `Yoto was still processing ${who}${at} after ${elapsed}.`
}

function formatTranscodeSubject(title?: string, partLabel?: string): string {
  const trimmedTitle = title?.trim()
  const part = partLabel?.trim()
  if (trimmedTitle && part) return `“${trimmedTitle}” (${part})`
  if (trimmedTitle) return `“${trimmedTitle}”`
  if (part) return `part ${part}`
  return 'this track'
}

function formatTranscodePercent(percent?: number): string {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return ''
  return ` at ${Math.round(percent)}%`
}

export function formatTranscodeLogLine(options: {
  result: 'ok' | 'stall' | 'timeout' | 'failed' | 'retry'
  jobId?: string
  youtubeId?: string
  partLabel?: string
  sizeMb: number
  durationSec?: number
  uploadId: string
  priorUploadId?: string
  attempt: number
  lastPhase?: string
  lastPercent?: number
  elapsedMs: number
}): string {
  const duration = typeof options.durationSec === 'number' && Number.isFinite(options.durationSec)
    ? String(Math.round(options.durationSec))
    : '-'
  const phase = options.lastPhase?.trim() || '-'
  const percent = typeof options.lastPercent === 'number' && Number.isFinite(options.lastPercent)
    ? String(Math.round(options.lastPercent))
    : '-'
  const fields = [
    '[yoto-transcode]',
    `job=${options.jobId || '-'}`,
    `youtubeId=${options.youtubeId || '-'}`,
    `part=${options.partLabel || '-'}`,
    `sizeMb=${options.sizeMb.toFixed(1)}`,
    `durationSec=${duration}`,
    `uploadId=${options.uploadId}`,
  ]
  if (options.priorUploadId) {
    fields.push(`priorUploadId=${options.priorUploadId}`)
  }
  fields.push(
    `attempt=${options.attempt}`,
    `lastPhase=${phase}`,
    `lastPercent=${percent}`,
    `elapsedMs=${Math.round(options.elapsedMs)}`,
    `result=${options.result}`,
  )
  return fields.join(' ')
}

export type TranscodeGiveUpReason = 'stall' | 'timeout' | 'failed'

export function transcodeRetryDecision(options: {
  reason: TranscodeGiveUpReason
  alreadyRetried: boolean
  newUploadUrl: string | null
  oldUploadId: string
  newUploadId: string
}): { action: 'throw' } | { action: 'reput'; uploadId: string } | { action: 'extra-poll'; uploadId: string } {
  if (options.alreadyRetried || options.reason === 'timeout') {
    return { action: 'throw' }
  }
  if (options.newUploadUrl) {
    return { action: 'reput', uploadId: options.newUploadId }
  }
  return { action: 'extra-poll', uploadId: options.oldUploadId }
}
