/**
 * Defaults for Yoto track fields built from transcoded YouTube audio.
 * The physical Player can skip tracks labeled mp3 when the payload is Opus.
 */

export function normalizeYotoAudioFormat(format: string | undefined): string {
  if (!format) return 'opus'
  const normalized = format.trim().toLowerCase()
  if (normalized === 'ogg' || normalized === 'opus') return 'opus'
  return normalized
}

export function mapYotoChannels(
  channels: number | string | undefined,
): 'stereo' | 'mono' | undefined {
  if (channels === 'stereo' || channels === 2 || channels === '2') return 'stereo'
  if (channels === 'mono' || channels === 1 || channels === '1') return 'mono'
  return undefined
}

/** Prefer explicit channel count; YouTube extracts are almost always stereo. */
export function yotoChannelsOrStereo(
  channels: number | string | undefined,
): 'stereo' | 'mono' {
  return mapYotoChannels(channels) ?? 'stereo'
}
