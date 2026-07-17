export type YtdlpErrorClass =
  | 'retryable'
  | 'outdated'
  | 'bot_signin'
  | 'private'
  | 'age_restricted'
  | 'region_locked'
  | 'unavailable'
  | 'other'

export const YTDLP_MAX_ATTEMPTS = 4

/** Backoff between attempts 1→2, 2→3, 3→4. */
export const YTDLP_RETRY_BACKOFF_MS = [1000, 3000, 8000] as const

/**
 * Player clients to try across attempts.
 * `null` = yt-dlp default (omit extractor-args).
 */
export const YTDLP_PLAYER_CLIENT_SCHEDULE: ReadonlyArray<string | null> = [
  null,
  'android',
  'ios',
  'tv',
]

export function playerClientForAttempt(attemptIndex: number): string | null {
  return YTDLP_PLAYER_CLIENT_SCHEDULE[attemptIndex] ?? null
}

export function backoffMsBeforeAttempt(attemptIndex: number): number {
  if (attemptIndex <= 0) return 0
  return YTDLP_RETRY_BACKOFF_MS[attemptIndex - 1] ?? YTDLP_RETRY_BACKOFF_MS.at(-1)!
}

export function extractYtdlpErrorDetail(stderr: string): string | undefined {
  const lines = stderr.split('\n').map(line => line.trim()).filter(Boolean)
  const errorLine = [...lines].reverse().find(line => line.startsWith('ERROR:'))
  return errorLine
    ?.replace(/^ERROR:\s*\[youtube\]\s*/i, '')
    .replace(/^ERROR:\s*/, '')
}

export function isOutdatedYtdlpSignal(stderr: string, detail?: string): boolean {
  return Boolean(
    detail?.includes('Requested format is not available')
    || stderr.includes('nsig extraction failed')
    || stderr.includes('Only images are available'),
  )
}

export function classifyYtdlpStderr(stderr: string): YtdlpErrorClass {
  const detail = extractYtdlpErrorDetail(stderr)
  const text = `${detail ?? ''}\n${stderr}`

  if (/sign in to confirm (you('|’)re|you are) not a bot/i.test(text)) {
    return 'bot_signin'
  }

  if (/\bprivate\b/i.test(text) && /video/i.test(text)) {
    return 'private'
  }

  if (
    /age.?restricted/i.test(text)
    || /sign in to confirm your age/i.test(text)
    || /confirm your age/i.test(text)
  ) {
    return 'age_restricted'
  }

  if (
    /not available in your country/i.test(text)
    || /available in your country/i.test(text)
    || /blocked.*(country|region)/i.test(text)
    || /region.?lock/i.test(text)
    || /geo.?block/i.test(text)
  ) {
    return 'region_locked'
  }

  if (
    /video unavailable/i.test(text)
    || /no longer available/i.test(text)
    || /has been removed/i.test(text)
    || /this video is not available/i.test(text)
  ) {
    return 'unavailable'
  }

  if (isOutdatedYtdlpSignal(stderr, detail)) {
    return 'outdated'
  }

  if (
    /HTTP Error 403/i.test(text)
    || /HTTP Error 429/i.test(text)
    || /Too Many Requests/i.test(text)
    || /timed?\s*out/i.test(text)
    || /Timeout/i.test(text)
    || /Connection reset/i.test(text)
    || /ECONNRESET/i.test(text)
    || /ECONNREFUSED/i.test(text)
    || /ENOTFOUND/i.test(text)
    || /Temporary failure/i.test(text)
    || /unable to download video data/i.test(text)
  ) {
    return 'retryable'
  }

  return 'other'
}

/**
 * Whether another yt-dlp attempt is warranted.
 * Outdated extractors get one alternate client only (2 attempts total).
 */
export function shouldRetryYtdlp(
  errorClass: YtdlpErrorClass,
  attemptIndex: number,
): boolean {
  const nextAttempt = attemptIndex + 1
  if (nextAttempt >= YTDLP_MAX_ATTEMPTS) return false

  if (errorClass === 'retryable') return true
  if (errorClass === 'outdated') return attemptIndex === 0
  return false
}

export function formatYtdlpError(stderr: string, youtubeId: string): string {
  const lines = stderr.split('\n').map(line => line.trim()).filter(Boolean)
  const detail = extractYtdlpErrorDetail(stderr)
  const errorClass = classifyYtdlpStderr(stderr)

  if (errorClass === 'outdated') {
    return `YouTube download failed for ${youtubeId}. yt-dlp is likely outdated — update yt-dlp (Docker: rebuild image; native: pip install -U "yt-dlp[default]" or brew upgrade yt-dlp)`
  }

  if (errorClass === 'bot_signin') {
    return `YouTube blocked the download for ${youtubeId} (bot check). Try again later.`
  }

  if (errorClass === 'private') {
    return `YouTube video ${youtubeId} is private and cannot be downloaded.`
  }

  if (errorClass === 'age_restricted') {
    return `YouTube video ${youtubeId} is age-restricted and cannot be downloaded without login.`
  }

  if (errorClass === 'region_locked') {
    return `YouTube video ${youtubeId} is not available in this region.`
  }

  if (errorClass === 'unavailable') {
    return `YouTube video ${youtubeId} is unavailable.`
  }

  if (detail?.includes('HTTP Error 403') || stderr.includes('HTTP Error 403')) {
    return `YouTube blocked the download for ${youtubeId} (HTTP 403). Try again shortly, or update yt-dlp.`
  }

  if (detail) {
    return `YouTube download failed for ${youtubeId}: ${detail}`
  }

  return `YouTube download failed for ${youtubeId}: ${lines.at(-1) ?? 'unknown error'}`
}
