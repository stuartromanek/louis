import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ffmpegTimeoutMs } from './ffmpeg-split.ts'

const execFileAsync = promisify(execFile)

const LOUDNORM_I = '-16'
const LOUDNORM_TP = '-1.5'
const LOUDNORM_LRA = '11'
const FIRST_PASS_FILTER = `loudnorm=I=${LOUDNORM_I}:TP=${LOUDNORM_TP}:LRA=${LOUDNORM_LRA}:print_format=json`

export type LoudnormMeasurement = {
  measuredI: string
  measuredTP: string
  measuredLRA: string
  measuredThresh: string
  offset: string
}

let cachedFfmpeg: string | null | undefined

async function ffmpegBinary(): Promise<string | null> {
  if (cachedFfmpeg !== undefined) return cachedFfmpeg
  const { resolveFfmpegBinary } = await import('./system-deps')
  cachedFfmpeg = await resolveFfmpegBinary()
  return cachedFfmpeg
}

function stringifyMeasured(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}

/** Pull the loudnorm JSON blob ffmpeg prints on stderr after the first pass. */
export function parseLoudnormJson(stderr: string): LoudnormMeasurement | null {
  const start = stderr.lastIndexOf('{')
  const end = stderr.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const json = JSON.parse(stderr.slice(start, end + 1)) as Record<string, unknown>
    const measuredI = stringifyMeasured(json.input_i)
    const measuredTP = stringifyMeasured(json.input_tp)
    const measuredLRA = stringifyMeasured(json.input_lra)
    const measuredThresh = stringifyMeasured(json.input_thresh)
    const offset = stringifyMeasured(json.target_offset)
    if (!measuredI || !measuredTP || !measuredLRA || !measuredThresh || !offset) return null
    return { measuredI, measuredTP, measuredLRA, measuredThresh, offset }
  }
  catch {
    return null
  }
}

export function secondPassLoudnormFilter(measured: LoudnormMeasurement): string {
  return [
    `loudnorm=I=${LOUDNORM_I}`,
    `TP=${LOUDNORM_TP}`,
    `LRA=${LOUDNORM_LRA}`,
    `measured_I=${measured.measuredI}`,
    `measured_TP=${measured.measuredTP}`,
    `measured_LRA=${measured.measuredLRA}`,
    `measured_thresh=${measured.measuredThresh}`,
    `offset=${measured.offset}`,
    'linear=true',
  ].join(':')
}

function nullSink(): string {
  return process.platform === 'win32' ? 'NUL' : '-'
}

/**
 * Two-pass EBU R128 loudnorm into `destPath`.
 * Returns destPath on success, or null on any failure (caller should upload the original).
 */
export async function loudnormAudioFile(
  sourcePath: string,
  destPath: string,
  durationSeconds?: number,
): Promise<string | null> {
  const ffmpeg = await ffmpegBinary()
  if (!ffmpeg) {
    console.warn('[loudnorm] ffmpeg not found; uploading original audio')
    return null
  }

  const timeout = ffmpegTimeoutMs(durationSeconds)

  try {
    const first = await execFileAsync(
      ffmpeg,
      [
        '-hide_banner',
        '-nostats',
        '-i', sourcePath,
        '-af', FIRST_PASS_FILTER,
        '-f', 'null',
        nullSink(),
      ],
      { timeout, encoding: 'utf8' },
    ).catch((err: NodeJS.ErrnoException & { stderr?: string }) => {
      // ffmpeg writes stats to stderr and exits 0; some builds still throw with stderr JSON.
      if (typeof err.stderr === 'string' && err.stderr.includes('input_i')) {
        return { stdout: '', stderr: err.stderr }
      }
      throw err
    })

    const measured = parseLoudnormJson(String(first.stderr || ''))
    if (!measured) {
      console.warn('[loudnorm] could not parse first-pass JSON; uploading original audio')
      return null
    }

    await execFileAsync(
      ffmpeg,
      [
        '-hide_banner',
        '-nostats',
        '-y',
        '-i', sourcePath,
        '-af', secondPassLoudnormFilter(measured),
        destPath,
      ],
      { timeout },
    )
    return destPath
  }
  catch (err) {
    console.warn(
      '[loudnorm] failed; uploading original audio:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
