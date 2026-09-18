import { execFile } from 'node:child_process'
import { copyFile, mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { ffmpegTimeoutMs } from './ffmpeg-split.ts'

const execFileAsync = promisify(execFile)
const REMUX_AAC_BITRATE = '192k'
const AAC_SAMPLE_RATE = '44100'
const PREVIEW_M4A_COPY_EXTS = new Set(['.m4a', '.aac', '.mp4'])

/** Preview files already in an M4A/AAC container can be copied into the save cache. */
export function canCopyPreviewAsM4a(filename: string): boolean {
  return PREVIEW_M4A_COPY_EXTS.has(path.extname(filename).toLowerCase())
}

/** Match yt-dlp `-x --audio-format m4a` (AAC in an M4A container) without another YouTube hit. */
export function previewToSaveM4aArgs(sourcePath: string, destPath: string): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-y',
    '-i', sourcePath,
    '-c:a', 'aac',
    '-b:a', REMUX_AAC_BITRATE,
    '-ar', AAC_SAMPLE_RATE,
    '-ac', '2',
    destPath,
  ]
}

export async function materializeSaveM4aFromPreview(options: {
  previewPath: string
  destPath: string
}): Promise<{ destPath: string, copied: boolean } | null> {
  const previewStat = await stat(options.previewPath).catch(() => null)
  if (!previewStat || previewStat.size <= 0) return null

  await mkdir(path.dirname(options.destPath), { recursive: true })
  const copied = canCopyPreviewAsM4a(options.previewPath)

  try {
    if (copied) {
      await copyFile(options.previewPath, options.destPath)
    }
    else {
      const { resolveFfmpegBinary } = await import('./system-deps')
      const ffmpeg = await resolveFfmpegBinary()
      if (!ffmpeg) return null
      await execFileAsync(
        ffmpeg,
        previewToSaveM4aArgs(options.previewPath, options.destPath),
        { timeout: ffmpegTimeoutMs() },
      )
    }
    const destStat = await stat(options.destPath)
    if (destStat.size <= 0) {
      await rm(options.destPath, { force: true })
      return null
    }
    return { destPath: options.destPath, copied }
  }
  catch (err) {
    await rm(options.destPath, { force: true }).catch(() => {})
    console.warn(
      '[ffmpeg-m4a] preview remux failed:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
