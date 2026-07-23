import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { H3Event } from 'h3'
import { YOTO_MYO_MAX_TRACK_BYTES } from '#shared/myo-editor/yotoMyoLimits'
import {
  backoffMsBeforeAttempt,
  classifyYtdlpStderr,
  formatYtdlpError,
  playerClientForAttempt,
  shouldEscalateToCookies,
  shouldRetryYtdlp,
  YTDLP_COOKIE_FOLLOWUP_ATTEMPTS,
  YTDLP_MAX_ATTEMPTS,
} from '#shared/myo-editor/ytdlpErrors'
import {
  cleanupJobTempDir,
  getCacheDir,
  resolveAudioWorkDirConfig,
  runAudioCacheSweep,
  type AudioCacheMode,
} from './audio-work-dir'
import { resolveYtdlpCookiesArgs } from './ytdlp-cookies'
import { checkYoutubeVideoAvailability } from './youtube'

const execFileAsync = promisify(execFile)

const YTDLP_TIMEOUT_MS = 5 * 60 * 1000
/** Align with Yoto MYO per-track size cap so we fail before upload. */
const MAX_FILE_BYTES = YOTO_MYO_MAX_TRACK_BYTES

const YTDLP_FALLBACK_PATHS = [
  '/opt/homebrew/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
]

/** Coalesce concurrent downloads of the same video (preview stampede / parallel saves). */
const inFlightDownloads = new Map<string, Promise<DownloadedAudio>>()

export interface DownloadedAudio {
  filePath: string
  filename: string
  sha256: string
  fromCache: boolean
  /** True when a retryable yt-dlp failure was recovered from before success. */
  recoveredFromRetryableFailure?: boolean
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

function httpError(statusCode: number, message: string) {
  return createError({ statusCode, message })
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
    throw httpError(
      500,
      'yt-dlp not found. Install it (Docker image includes it; native: apt install yt-dlp, pip install yt-dlp, or set NUXT_YTDLP_PATH).',
    )
  }

  cachedYtdlp = best
  return best
}

/** @deprecated Prefer importing from `#shared/myo-editor/ytdlpErrors`. */
export { formatYtdlpError } from '#shared/myo-editor/ytdlpErrors'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function clearJobDirContents(jobDir: string): Promise<void> {
  try {
    const entries = await readdir(jobDir)
    await Promise.all(entries.map(name => rm(path.join(jobDir, name), { force: true, recursive: true })))
  }
  catch {
    // ignore
  }
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

function buildYtdlpArgs(options: {
  outputTemplate: string
  videoUrl: string
  transcode: boolean
  playerClient: string | null
  cookiesArgs?: string[]
}): string[] {
  const args = [
    '-f', 'ba/b',
    '--no-playlist',
    '-o', options.outputTemplate,
  ]
  if (options.transcode) {
    args.splice(2, 0, '-x', '--audio-format', 'm4a')
  }
  // YouTube player JS for nsig / anti-bot; Node is on PATH (app + Docker base image).
  args.push('--js-runtimes', 'node')
  if (options.cookiesArgs?.length) {
    args.push(...options.cookiesArgs)
  }
  if (options.playerClient) {
    args.push('--extractor-args', `youtube:player_client=${options.playerClient}`)
  }
  args.push('--', options.videoUrl)
  return args
}

export async function downloadYoutubeAudio(
  youtubeId: string,
  event?: H3Event,
  options?: { enforceMyoSizeLimit?: boolean },
): Promise<DownloadedAudio> {
  return downloadYoutubeAudioInternal(youtubeId, event, {
    transcode: true,
    enforceMyoSizeLimit: options?.enforceMyoSizeLimit !== false,
  })
}

export async function getYoutubePreviewAudio(
  youtubeId: string,
  event?: H3Event,
): Promise<Pick<DownloadedAudio, 'filePath' | 'filename' | 'fromCache'>> {
  const result = await downloadYoutubeAudioInternal(youtubeId, event, {
    transcode: false,
    enforceMyoSizeLimit: true,
  })
  return {
    filePath: result.filePath,
    filename: result.filename,
    fromCache: result.fromCache,
  }
}

async function downloadYoutubeAudioInternal(
  youtubeId: string,
  event: H3Event | undefined,
  options: { transcode: boolean, enforceMyoSizeLimit: boolean },
): Promise<DownloadedAudio> {
  const { ytdlpPath: configuredPath, audioWorkDir } = resolveAudioWorkDirConfig(event)
  const cacheMode = cacheModeForOptions(options.transcode)
  const cacheDir = getCacheDir(audioWorkDir, cacheMode)
  await mkdir(cacheDir, { recursive: true })

  const requiredExt = options.transcode ? '.m4a' : undefined
  const cached = await findCachedFile(cacheDir, youtubeId, requiredExt)
  if (cached) {
    const fileStat = await stat(cached)
    if (!options.enforceMyoSizeLimit || fileStat.size <= MAX_FILE_BYTES) {
      return {
        filePath: cached,
        filename: path.basename(cached),
        sha256: await hashFile(cached),
        fromCache: true,
      }
    }
    await rm(cached, { force: true })
  }

  const flightKey = `${cacheMode}:${youtubeId}`
  const existing = inFlightDownloads.get(flightKey)
  if (existing) {
    console.info(`[yt-dlp] coalesce videoId=${youtubeId} mode=${cacheMode}`)
    return existing
  }

  const promise = downloadYoutubeAudioUncached(youtubeId, event, options, {
    configuredPath,
    audioWorkDir,
    cacheDir,
    cacheMode,
  }).finally(() => {
    if (inFlightDownloads.get(flightKey) === promise) {
      inFlightDownloads.delete(flightKey)
    }
  })
  inFlightDownloads.set(flightKey, promise)
  return promise
}

async function downloadYoutubeAudioUncached(
  youtubeId: string,
  event: H3Event | undefined,
  options: { transcode: boolean, enforceMyoSizeLimit: boolean },
  ctx: {
    configuredPath: string
    audioWorkDir: string
    cacheDir: string
    cacheMode: AudioCacheMode
  },
): Promise<DownloadedAudio> {
  const { configuredPath, audioWorkDir, cacheDir, cacheMode } = ctx
  const ytdlp = await resolveYtdlpBinary(configuredPath)

  // Re-check cache after winning the singleflight race (coalesced waiters already returned).
  const requiredExt = options.transcode ? '.m4a' : undefined
  const cached = await findCachedFile(cacheDir, youtubeId, requiredExt)
  if (cached) {
    const fileStat = await stat(cached)
    if (!options.enforceMyoSizeLimit || fileStat.size <= MAX_FILE_BYTES) {
      return {
        filePath: cached,
        filename: path.basename(cached),
        sha256: await hashFile(cached),
        fromCache: true,
      }
    }
    await rm(cached, { force: true })
  }

  if (event) {
    const availability = await checkYoutubeVideoAvailability(event, youtubeId)
    if (availability && !availability.ok) {
      throw httpError(404, availability.message)
    }
  }

  const jobDir = path.join(audioWorkDir, 'jobs', crypto.randomUUID())
  await mkdir(jobDir, { recursive: true })
  const outputTemplate = path.join(jobDir, `${youtubeId}.%(ext)s`)
  const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`
  // Anon-first: escalate to --cookies only on bot / hard 403 / age-restricted.
  const cookiesArgs = await resolveYtdlpCookiesArgs(event)
  const hasCookies = cookiesArgs.length > 0
  let useCookies = false
  let escalatedToCookies = false
  const maxAttempts = hasCookies
    ? YTDLP_MAX_ATTEMPTS + YTDLP_COOKIE_FOLLOWUP_ATTEMPTS
    : YTDLP_MAX_ATTEMPTS

  let lastStderr = ''
  let recoveredFromRetryableFailure = false

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const playerClient = playerClientForAttempt(attempt)
      const waitMs = backoffMsBeforeAttempt(attempt)
      if (waitMs > 0) await sleep(waitMs)

      await clearJobDirContents(jobDir)

      const args = buildYtdlpArgs({
        outputTemplate,
        videoUrl,
        transcode: options.transcode,
        playerClient,
        cookiesArgs: useCookies ? cookiesArgs : undefined,
      })

      try {
        await execFileAsync(
          ytdlp.path,
          args,
          { timeout: YTDLP_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
        )
      }
      catch (err: unknown) {
        if (err && typeof err === 'object' && 'statusCode' in err) {
          throw err
        }

        const e = err as { stderr?: string; message?: string; killed?: boolean }
        const stderr = e.stderr ?? e.message ?? ''
        lastStderr = stderr
        const errorClass = classifyYtdlpStderr(stderr)
        const clientLabel = playerClient ?? 'default'
        const authLabel = useCookies ? 'cookies' : 'anon'

        if (!useCookies && hasCookies && shouldEscalateToCookies(errorClass, stderr)) {
          useCookies = true
          escalatedToCookies = true
          if (errorClass === 'retryable') {
            recoveredFromRetryableFailure = true
          }
          // Expected on datacenter IPs (demo/Railway) when cookies are configured — not an outage.
          console.info(
            `[yt-dlp] escalate videoId=${youtubeId} mode=${cacheMode} attempt=${attempt + 1}/${maxAttempts} client=${clientLabel} reason=${errorClass}`,
          )
          continue
        }

        if (shouldRetryYtdlp(errorClass, attempt, { usingCookies: useCookies, maxAttempts })) {
          if (errorClass === 'retryable') {
            recoveredFromRetryableFailure = true
          }
          console.info(
            `[yt-dlp] retry videoId=${youtubeId} mode=${cacheMode} attempt=${attempt + 1}/${maxAttempts} auth=${authLabel} client=${clientLabel} reason=${errorClass}`,
          )
          continue
        }

        console.error(
          `[yt-dlp] fail videoId=${youtubeId} mode=${cacheMode} auth=${authLabel} class=${errorClass} escalated=${escalatedToCookies}`,
        )
        throw httpError(502, formatYtdlpError(stderr, youtubeId))
      }

      const files = await readdir(jobDir)
      const audioFile = files.find(name => name.startsWith(`${youtubeId}.`))
      if (!audioFile) {
        lastStderr = 'ERROR: YouTube download produced no file'
        if (shouldRetryYtdlp('retryable', attempt, { usingCookies: useCookies, maxAttempts })) {
          recoveredFromRetryableFailure = true
          console.info(
            `[yt-dlp] retry videoId=${youtubeId} mode=${cacheMode} attempt=${attempt + 1}/${maxAttempts} auth=${useCookies ? 'cookies' : 'anon'} client=${playerClient ?? 'default'} reason=no_file`,
          )
          continue
        }
        console.error(
          `[yt-dlp] fail videoId=${youtubeId} mode=${cacheMode} auth=${useCookies ? 'cookies' : 'anon'} class=no_file escalated=${escalatedToCookies}`,
        )
        throw httpError(502, `YouTube download produced no file for ${youtubeId}`)
      }

      const filePath = path.join(jobDir, audioFile)
      const fileStat = await stat(filePath)
      if (options.enforceMyoSizeLimit && fileStat.size > MAX_FILE_BYTES) {
        throw httpError(
          413,
          `Downloaded audio for ${youtubeId} exceeds Yoto’s 100 MB per-track limit`,
        )
      }

      const cachePath = path.join(cacheDir, audioFile)
      await readFile(filePath)
      await copyFile(filePath, cachePath)
      await runAudioCacheSweep(event)

      console.info(
        `[yt-dlp] ok videoId=${youtubeId} mode=${cacheMode} auth=${useCookies ? 'cookies' : 'anon'} escalated=${escalatedToCookies} recovered=${Boolean(recoveredFromRetryableFailure)}`,
      )

      return {
        filePath: cachePath,
        filename: audioFile,
        sha256: await hashFile(cachePath),
        fromCache: false,
        recoveredFromRetryableFailure: recoveredFromRetryableFailure || undefined,
      }
    }

    console.error(
      `[yt-dlp] fail videoId=${youtubeId} mode=${cacheMode} auth=${useCookies ? 'cookies' : 'anon'} class=${lastStderr ? classifyYtdlpStderr(lastStderr) : 'exhausted'} escalated=${escalatedToCookies}`,
    )
    throw httpError(502, formatYtdlpError(lastStderr || 'ERROR: retries exhausted', youtubeId))
  }
  finally {
    await cleanupJobTempDir(jobDir)
  }
}
