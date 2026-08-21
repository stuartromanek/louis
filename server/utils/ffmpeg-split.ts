import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const AAC_BITRATE = '128k'
const AAC_SAMPLE_RATE = '44100'

export const FFMPEG_TIMEOUT_FLOOR_MS = 10 * 60 * 1000
export const FFMPEG_TIMEOUT_MS_PER_AUDIO_MINUTE = 90_000
export const FFMPEG_TIMEOUT_CAP_MS = 90 * 60 * 1000

/** Probe stays on the floor; encode/loudnorm scale with duration for slow HA Pis. */
export function ffmpegTimeoutMs(durationSeconds?: number): number {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return FFMPEG_TIMEOUT_FLOOR_MS
  }
  const minutes = Math.ceil(durationSeconds / 60)
  return Math.min(
    FFMPEG_TIMEOUT_CAP_MS,
    Math.max(FFMPEG_TIMEOUT_FLOOR_MS, minutes * FFMPEG_TIMEOUT_MS_PER_AUDIO_MINUTE),
  )
}

let cachedFfmpeg: string | null | undefined

async function ffmpegBinary(): Promise<string | null> {
  if (cachedFfmpeg !== undefined) return cachedFfmpeg
  const { resolveFfmpegBinary } = await import('./system-deps')
  cachedFfmpeg = await resolveFfmpegBinary()
  return cachedFfmpeg
}

/** Parse `Duration: HH:MM:SS.xx` from ffmpeg/ffprobe stderr. */
export function parseFfmpegDuration(stderr: string): number | null {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (![hours, minutes, seconds].every(n => Number.isFinite(n))) return null
  const total = hours * 3600 + minutes * 60 + seconds
  return total > 0 ? total : null
}

export async function probeAudioDurationSeconds(filePath: string): Promise<number | null> {
  const ffmpeg = await ffmpegBinary()
  if (!ffmpeg) return null
  try {
    const result = await execFileAsync(
      ffmpeg,
      ['-hide_banner', '-i', filePath, '-f', 'null', '-'],
      { timeout: FFMPEG_TIMEOUT_FLOOR_MS, encoding: 'utf8' },
    ).catch((err: NodeJS.ErrnoException & { stderr?: string }) => {
      if (typeof err.stderr === 'string' && err.stderr.includes('Duration:')) {
        return { stdout: '', stderr: err.stderr }
      }
      throw err
    })
    return parseFfmpegDuration(String(result.stderr || ''))
  }
  catch (err) {
    console.warn(
      '[ffmpeg-split] duration probe failed:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

export type SplitCodec = 'copy' | 'aac'

function aacSplitArgs(
  sourcePath: string,
  destPath: string,
  start: number,
  duration: number,
): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-y',
    '-ss', String(start),
    '-i', sourcePath,
    '-t', String(duration),
    '-c:a', 'aac',
    '-b:a', AAC_BITRATE,
    '-ar', AAC_SAMPLE_RATE,
    '-ac', '2',
    destPath,
  ]
}

export async function splitAudioFile(options: {
  sourcePath: string
  destPath: string
  startSeconds: number
  durationSeconds: number
  /** Yoto chapters always re-encode. `copy` tries stream copy first. */
  codec?: SplitCodec
}): Promise<SplitCodec | false> {
  const ffmpeg = await ffmpegBinary()
  if (!ffmpeg) return false

  const start = Math.max(0, options.startSeconds)
  const duration = Math.max(0.05, options.durationSeconds)
  const codec = options.codec ?? 'aac'

  if (codec === 'copy') {
    const copyArgs = [
      '-hide_banner',
      '-nostats',
      '-y',
      '-i', options.sourcePath,
      '-ss', String(start),
      '-t', String(duration),
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      options.destPath,
    ]
    try {
      await execFileAsync(ffmpeg, copyArgs, { timeout: ffmpegTimeoutMs(duration) })
      console.info(`[ffmpeg-split] codec=copy start=${start} duration=${duration}`)
      return 'copy'
    }
    catch (copyErr) {
      console.warn(
        '[ffmpeg-split] stream copy failed, re-encoding:',
        copyErr instanceof Error ? copyErr.message : copyErr,
      )
    }
  }

  try {
    await execFileAsync(
      ffmpeg,
      aacSplitArgs(options.sourcePath, options.destPath, start, duration),
      { timeout: ffmpegTimeoutMs(duration) },
    )
    console.info(`[ffmpeg-split] codec=aac start=${start} duration=${duration}`)
    return 'aac'
  }
  catch (err) {
    console.warn(
      '[ffmpeg-split] split failed:',
      err instanceof Error ? err.message : err,
    )
    return false
  }
}
