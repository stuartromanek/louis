import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { H3Event } from 'h3'
import {
  cleanupJobTempDir,
  getCacheDir,
  resolveAudioWorkDirConfig,
  runAudioCacheSweep,
  type AudioCacheMode,
} from './audio-work-dir'

const execFileAsync = promisify(execFile)

const YTDLP_TIMEOUT_MS = 5 * 60 * 1000
const MAX_FILE_BYTES = 1024 * 1024 * 1024

const YTDLP_FALLBACK_PATHS = [
  '/opt/homebrew/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
]

export interface DownloadedAudio {
  filePath: string
  filename: string
  sha256: string
  fromCache: boolean
}

interface ResolvedYtdlp {
  path: string
  version: string
}

let cachedYtdlp: ResolvedYtdlp | null = null

function parseYtdlpVersionDate(version: string): number {
  const match = version.match(/^(\d{4})\.(\d{2})\.(\d{2})/)
  if (!match) return 0
  return Number(match[1] + match[2] + match[3])
}

async function readYtdlpVersion(binaryPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(binaryPath, ['--version'], { timeout: 5000 })
    return stdout.trim().split('\n')[0] || null
  }
  catch {
    return null
  }
}

async function resolveYtdlpBinary(configuredPath: string): Promise<ResolvedYtdlp> {
  if (cachedYtdlp) return cachedYtdlp

  const candidates = [...new Set([configuredPath, ...YTDLP_FALLBACK_PATHS, 'yt-dlp'])]
  let best: ResolvedYtdlp | null = null
  let bestDate = 0

  for (const candidate of candidates) {
    const version = await readYtdlpVersion(candidate)
    if (!version) continue
    const date = parseYtdlpVersionDate(version)
    if (date > bestDate) {
      bestDate = date
      best = { path: candidate, version }
    }
  }

  if (!best) {
    throw createError({
      statusCode: 500,
      statusMessage: 'yt-dlp not found. Install it (Docker image includes it; native: apt install yt-dlp, pip install yt-dlp, or set NUXT_YTDLP_PATH).',
    })
  }

  cachedYtdlp = best
  return best
}

export function formatYtdlpError(stderr: string, youtubeId: string): string {
  const lines = stderr.split('\n').map(line => line.trim()).filter(Boolean)
  const errorLine = [...lines].reverse().find(line => line.startsWith('ERROR:'))
  const detail = errorLine?.replace(/^ERROR:\s*\[youtube\]\s*/i, '').replace(/^ERROR:\s*/, '')

  if (
    detail?.includes('Requested format is not available')
    || stderr.includes('nsig extraction failed')
    || stderr.includes('Only images are available')
  ) {
    return `YouTube download failed for ${youtubeId}. yt-dlp is likely outdated — update yt-dlp (Docker: rebuild image; native: pip install -U "yt-dlp[default]" or brew upgrade yt-dlp)`
  }

  if (detail) {
    return `YouTube download failed for ${youtubeId}: ${detail}`
  }

  return `YouTube download failed for ${youtubeId}: ${lines.at(-1) ?? 'unknown error'}`
}

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

async function findCachedFile(
  cacheDir: string,
  youtubeId: string,
  requiredExt?: string,
): Promise<string | null> {
  try {
    const entries = await readdir(cacheDir)
    const match = entries.find((name) => {
      if (!name.startsWith(`${youtubeId}.`)) return false
      if (requiredExt) return name.endsWith(requiredExt)
      return true
    })
    return match ? path.join(cacheDir, match) : null
  }
  catch {
    return null
  }
}

function cacheModeForOptions(transcode: boolean): AudioCacheMode {
  return transcode ? 'save' : 'preview'
}

export async function downloadYoutubeAudio(
  youtubeId: string,
  event?: H3Event,
): Promise<DownloadedAudio> {
  return downloadYoutubeAudioInternal(youtubeId, event, { transcode: true })
}

export async function getYoutubePreviewAudio(
  youtubeId: string,
  event?: H3Event,
): Promise<Pick<DownloadedAudio, 'filePath' | 'filename' | 'fromCache'>> {
  const result = await downloadYoutubeAudioInternal(youtubeId, event, { transcode: false })
  return {
    filePath: result.filePath,
    filename: result.filename,
    fromCache: result.fromCache,
  }
}

async function downloadYoutubeAudioInternal(
  youtubeId: string,
  event: H3Event | undefined,
  options: { transcode: boolean },
): Promise<DownloadedAudio> {
  const { ytdlpPath: configuredPath, audioWorkDir } = resolveAudioWorkDirConfig(event)
  const ytdlp = await resolveYtdlpBinary(configuredPath)

  const cacheMode = cacheModeForOptions(options.transcode)
  const cacheDir = getCacheDir(audioWorkDir, cacheMode)
  await mkdir(cacheDir, { recursive: true })

  const requiredExt = options.transcode ? '.m4a' : undefined
  const cached = await findCachedFile(cacheDir, youtubeId, requiredExt)
  if (cached) {
    const fileStat = await stat(cached)
    if (fileStat.size <= MAX_FILE_BYTES) {
      return {
        filePath: cached,
        filename: path.basename(cached),
        sha256: await hashFile(cached),
        fromCache: true,
      }
    }
    await rm(cached, { force: true })
  }

  const jobDir = path.join(audioWorkDir, 'jobs', crypto.randomUUID())
  await mkdir(jobDir, { recursive: true })
  const outputTemplate = path.join(jobDir, `${youtubeId}.%(ext)s`)
  const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`

  try {
    const args = [
      '-f', 'ba/b',
      '--no-playlist',
      '-o', outputTemplate,
      '--', videoUrl,
    ]
    if (options.transcode) {
      args.splice(2, 0, '-x', '--audio-format', 'm4a')
    }

    await execFileAsync(
      ytdlp.path,
      args,
      { timeout: YTDLP_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
    )

    const files = await readdir(jobDir)
    const audioFile = files.find(name => name.startsWith(`${youtubeId}.`))
    if (!audioFile) {
      throw createError({
        statusCode: 502,
        statusMessage: `YouTube download produced no file for ${youtubeId}`,
      })
    }

    const filePath = path.join(jobDir, audioFile)
    const fileStat = await stat(filePath)
    if (fileStat.size > MAX_FILE_BYTES) {
      throw createError({
        statusCode: 413,
        statusMessage: `Downloaded audio for ${youtubeId} exceeds the 1GB limit`,
      })
    }

    const cachePath = path.join(cacheDir, audioFile)
    await readFile(filePath)
    await copyFile(filePath, cachePath)
    await runAudioCacheSweep(event)

    return {
      filePath: cachePath,
      filename: audioFile,
      sha256: await hashFile(cachePath),
      fromCache: false,
    }
  }
  catch (err: unknown) {
    if (err && typeof err === 'object' && 'statusCode' in err) {
      throw err
    }

    const e = err as { stderr?: string; message?: string }
    throw createError({
      statusCode: 502,
      statusMessage: formatYtdlpError(e.stderr ?? e.message ?? '', youtubeId),
    })
  }
  finally {
    await cleanupJobTempDir(jobDir)
  }
}

export { cleanupJobTempDir } from './audio-work-dir'
