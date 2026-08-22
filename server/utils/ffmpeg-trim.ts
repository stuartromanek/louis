import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ffmpegTimeoutMs } from './ffmpeg-split.ts'
import { isFullFileTrim } from '../../shared/myo-editor/trackTrim.ts'

const execFileAsync = promisify(execFile)
const AAC_BITRATE = '192k'
const AAC_SAMPLE_RATE = '44100'

export { isFullFileTrim }

let cachedFfmpeg: string | null | undefined

async function ffmpegBinary(): Promise<string | null> {
  if (cachedFfmpeg !== undefined) return cachedFfmpeg
  const { resolveFfmpegBinary } = await import('./system-deps')
  cachedFfmpeg = await resolveFfmpegBinary()
  return cachedFfmpeg
}

export function trimAacArgs(
  sourcePath: string,
  destPath: string,
  startSeconds: number,
  endSeconds: number,
): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-y',
    '-i', sourcePath,
    '-ss', String(startSeconds),
    '-to', String(endSeconds),
    '-c:a', 'aac',
    '-b:a', AAC_BITRATE,
    '-ar', AAC_SAMPLE_RATE,
    '-ac', '2',
    destPath,
  ]
}

/** Decode-accurate front/back cut. Returns destPath on success. */
export async function trimAudioFile(options: {
  sourcePath: string
  destPath: string
  startSeconds: number
  endSeconds: number
  sourceDurationSeconds?: number
}): Promise<string | null> {
  const ffmpeg = await ffmpegBinary()
  if (!ffmpeg) return null

  const start = Math.max(0, options.startSeconds)
  const end = Math.max(start + 0.05, options.endSeconds)
  if (
    typeof options.sourceDurationSeconds === 'number'
    && isFullFileTrim(start, end, options.sourceDurationSeconds)
  ) {
    return null
  }

  try {
    await execFileAsync(
      ffmpeg,
      trimAacArgs(options.sourcePath, options.destPath, start, end),
      { timeout: ffmpegTimeoutMs(end - start) },
    )
    return options.destPath
  }
  catch (err) {
    console.warn(
      '[ffmpeg-trim] trim failed:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
