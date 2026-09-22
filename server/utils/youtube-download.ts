import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { H3Event } from 'h3'
import {
  HOST_DISK_FULL_MESSAGE,
  isHostDiskFullError,
} from '#shared/hostDiskFull'
import { YOTO_MYO_MAX_TRACK_BYTES } from '#shared/myo-editor/yotoMyoLimits'
import {
  backoffMsBeforeAttempt,
  classifyYtdlpStderr,
  formatYtdlpError,
  isHard403,
  playerClientForAttempt,
  shouldEscalateToCookies,
  shouldRetryYtdlp,
  YTDLP_COOKIE_FOLLOWUP_ATTEMPTS,
  YTDLP_MAX_ATTEMPTS,
  type YtdlpErrorClass,
} from '#shared/myo-editor/ytdlpErrors'
import {
  excerptYtdlpOutput,
  parseYtdlpFormatInfo,
  redactYtdlpArgs,
  YTDLP_FORMAT_PRINT_TEMPLATE,
} from '#shared/pipeline-log/redact'
import {
  cleanupJobTempDir,
  getCacheDir,
  resolveAudioWorkDirConfig,
  runAudioCacheSweep,
  type AudioCacheMode,
} from './audio-work-dir'
import { resolveYtdlpCookiesArgs } from './ytdlp-cookies'
import { ytdlpJsRuntimeArgs } from './ytdlp-js-runtime'
import { checkYoutubeVideoAvailability } from './youtube'
import { resolveYtdlpBinary } from './ytdlp-binary'
import { materializeSaveM4aFromPreview } from './ffmpeg-m4a.ts'
import {
  emitPipelineEvent,
  getPipelineContext,
  isPipelineLogVerbose,
  withPipelineContext,
} from './pipeline-log'

const execFileAsync = promisify(execFile)

const YTDLP_TIMEOUT_MS = 5 * 60 * 1000
/** Align with Yoto MYO per-track size cap so we fail before upload. */
const MAX_FILE_BYTES = YOTO_MYO_MAX_TRACK_BYTES

/** Coalesce concurrent downloads of the same video (preview stampede / parallel saves). */
const inFlightDownloads = new Map<string, Promise<DownloadedAudio>>()

export function hasInFlightYtdlpDownloads(): boolean {
  return inFlightDownloads.size > 0
}

export interface DownloadedAudio {
  filePath: string
  filename: string
  sha256: string
  fromCache: boolean
  /** True when a retryable yt-dlp failure was recovered from before success. */
  recoveredFromRetryableFailure?: boolean
}

function withDownloadContext<T>(surface: AudioCacheMode, videoId: string, fn: () => T): T {
  const ctx = getPipelineContext()
  return withPipelineContext({
    surface: ctx.surface ?? surface,
    videoId,
  }, fn)
}

type YtdlpAttemptLog = {
  action: 'ok' | 'retry' | 'escalate' | 'fail'
  videoId: string
  mode: AudioCacheMode
  transcode: boolean
  attempt: number
  maxAttempts: number
  playerClient: string
  auth: string
  durationMs?: number
  ok: boolean
  exitCode?: number | string
  killed?: boolean
  timedOut?: boolean
  errorClass?: string
  hard403?: boolean
  formatId?: string
  ext?: string
  acodec?: string
  abr?: string | number
  fileBytes?: number
  argv?: string[]
  stderrExcerpt?: string
  escalated?: boolean
  recovered?: boolean
}

function emitYtdlpAttempt(fields: YtdlpAttemptLog): void {
  const {
    action,
    videoId,
    mode,
    attempt,
    maxAttempts,
    playerClient,
    auth,
    errorClass,
    escalated,
    recovered,
    ...rest
  } = fields
  if (action === 'escalate') {
    console.info(
      `[yt-dlp] escalate videoId=${videoId} mode=${mode} attempt=${attempt}/${maxAttempts} client=${playerClient} reason=${errorClass}`,
    )
  }
  else if (action === 'retry') {
    console.info(
      `[yt-dlp] retry videoId=${videoId} mode=${mode} attempt=${attempt}/${maxAttempts} auth=${auth} client=${playerClient} reason=${errorClass}`,
    )
  }
  else if (action === 'fail') {
    console.error(
      `[yt-dlp] fail videoId=${videoId} mode=${mode} auth=${auth} class=${errorClass} escalated=${Boolean(escalated)}`,
    )
  }
  else {
    console.info(
      `[yt-dlp] ok videoId=${videoId} mode=${mode} auth=${auth} escalated=${Boolean(escalated)} recovered=${Boolean(recovered)}`,
    )
  }
  emitPipelineEvent('ytdlp.attempt', {
    videoId,
    mode,
    attempt,
    maxAttempts,
    playerClient,
    auth,
    action,
    errorClass,
    ...rest,
  })
}

function httpError(statusCode: number, message: string) {
  return createError({ statusCode, message })
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
  jsRuntimeArgs?: string[]
  verbose?: boolean
}): string[] {
  const args = [
    '-f', 'ba/b',
    '--no-playlist',
    '-o', options.outputTemplate,
  ]
  if (options.transcode) {
    args.splice(2, 0, '-x', '--audio-format', 'm4a')
  }
  // YouTube EJS challenges — desktop passes `node:<Electron shim>` (GUI PATH has no node).
  args.push(...(options.jsRuntimeArgs?.length ? options.jsRuntimeArgs : ['--js-runtimes', 'node']))
  args.push('--print', YTDLP_FORMAT_PRINT_TEMPLATE)
  if (options.verbose) args.push('-v')
  if (options.cookiesArgs?.length) {
    args.push(...options.cookiesArgs)
  }
  if (options.playerClient) {
    args.push('--extractor-args', `youtube:player_client=${options.playerClient}`)
  }
  args.push('--', options.videoUrl)
  return args
}

type YtdlpExecCapture = {
  ok: boolean
  stdout: string
  stderr: string
  durationMs: number
  exitCode?: number | string
  killed?: boolean
  timedOut?: boolean
}

async function execYtdlpCapture(
  binary: string,
  args: string[],
  timeoutMs: number,
): Promise<YtdlpExecCapture> {
  const started = Date.now()
  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8',
    })
    return {
      ok: true,
      stdout: String(stdout ?? ''),
      stderr: String(stderr ?? ''),
      durationMs: Date.now() - started,
    }
  }
  catch (err: unknown) {
    if (err && typeof err === 'object' && 'statusCode' in err) throw err
    const e = err as {
      stdout?: string
      stderr?: string
      message?: string
      killed?: boolean
      code?: number | string
    }
    return {
      ok: false,
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? e.message ?? ''),
      durationMs: Date.now() - started,
      exitCode: e.code,
      killed: Boolean(e.killed),
      timedOut: Boolean(e.killed),
    }
  }
}

export async function downloadYoutubeAudio(
  youtubeId: string,
  event?: H3Event,
  options?: { enforceMyoSizeLimit?: boolean },
): Promise<DownloadedAudio> {
  return withDownloadContext('save', youtubeId, () =>
    downloadYoutubeAudioInternal(youtubeId, event, {
      transcode: true,
      enforceMyoSizeLimit: options?.enforceMyoSizeLimit !== false,
    }),
  )
}

export async function getYoutubePreviewAudio(
  youtubeId: string,
  event?: H3Event,
): Promise<Pick<DownloadedAudio, 'filePath' | 'filename' | 'fromCache'>> {
  const result = await withDownloadContext('preview', youtubeId, () =>
    downloadYoutubeAudioInternal(youtubeId, event, {
      transcode: false,
      // Preview is the full YouTube file (split parts share it). The 100 MB
      // cap is a Yoto upload limit, not a local waveform/play limit.
      enforceMyoSizeLimit: false,
    }),
  )
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
  const audioConfig = resolveAudioWorkDirConfig(event)
  const runtime = event ? useRuntimeConfig(event) : useRuntimeConfig()
  const configuredPath = String(runtime.ytdlpPath || 'yt-dlp')
  const audioWorkDir = audioConfig.audioWorkDir
  const cacheMode = cacheModeForOptions(options.transcode)
  const cacheDir = getCacheDir(audioWorkDir, cacheMode)
  await mkdir(cacheDir, { recursive: true })

  const requiredExt = options.transcode ? '.m4a' : undefined
  const cached = await findCachedFile(cacheDir, youtubeId, requiredExt)
  if (cached) {
    const fileStat = await stat(cached)
    if (!options.enforceMyoSizeLimit || fileStat.size <= MAX_FILE_BYTES) {
      emitPipelineEvent('ytdlp.cache_hit', {
        videoId: youtubeId,
        mode: cacheMode,
        fileBytes: fileStat.size,
        filename: path.basename(cached),
      })
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
    emitPipelineEvent('ytdlp.coalesce', { videoId: youtubeId, mode: cacheMode })
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

async function waitForInFlightPreview(youtubeId: string): Promise<DownloadedAudio | null> {
  const previewFlight = inFlightDownloads.get(`preview:${youtubeId}`)
  if (!previewFlight) return null
  emitPipelineEvent('ytdlp.coalesce', { videoId: youtubeId, mode: 'save', waitingFor: 'preview' })
  try {
    return await previewFlight
  }
  catch {
    return null
  }
}

async function tryReusePreviewForSave(
  youtubeId: string,
  audioWorkDir: string,
  saveCacheDir: string,
  enforceMyoSizeLimit: boolean,
  event?: H3Event,
): Promise<DownloadedAudio | null> {
  const startedAt = Date.now()
  const inflight = await waitForInFlightPreview(youtubeId)
  const previewPath = inflight?.filePath
    ?? await findCachedFile(getCacheDir(audioWorkDir, 'preview'), youtubeId)
  if (!previewPath) return null

  const destPath = path.join(saveCacheDir, `${youtubeId}.m4a`)
  const result = await materializeSaveM4aFromPreview({ previewPath, destPath })
  if (!result) {
    emitPipelineEvent('ytdlp.preview_remux', {
      videoId: youtubeId,
      ok: false,
      source: path.basename(previewPath),
      durationMs: Date.now() - startedAt,
    })
    return null
  }

  const fileStat = await stat(result.destPath)
  if (enforceMyoSizeLimit && fileStat.size > MAX_FILE_BYTES) {
    await rm(result.destPath, { force: true })
    emitPipelineEvent('ytdlp.preview_remux', {
      videoId: youtubeId,
      ok: false,
      reason: 'too_large',
      fileBytes: fileStat.size,
      durationMs: Date.now() - startedAt,
    })
    throw httpError(
      413,
      `Downloaded audio for ${youtubeId} exceeds Yoto’s 100 MB per-track limit`,
    )
  }

  await runAudioCacheSweep(event)
  console.info(
    `[yt-dlp] remux videoId=${youtubeId} mode=save from=preview copied=${result.copied}`,
  )
  emitPipelineEvent('ytdlp.preview_remux', {
    videoId: youtubeId,
    ok: true,
    copied: result.copied,
    source: path.basename(previewPath),
    fileBytes: fileStat.size,
    durationMs: Date.now() - startedAt,
  })
  return {
    filePath: result.destPath,
    filename: path.basename(result.destPath),
    sha256: await hashFile(result.destPath),
    fromCache: true,
  }
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
  const { audioWorkDir, cacheDir, cacheMode } = ctx
  const ytdlp = await resolveYtdlpBinary(event)

  // Re-check cache after winning the singleflight race (coalesced waiters already returned).
  const requiredExt = options.transcode ? '.m4a' : undefined
  const cached = await findCachedFile(cacheDir, youtubeId, requiredExt)
  if (cached) {
    const fileStat = await stat(cached)
    if (!options.enforceMyoSizeLimit || fileStat.size <= MAX_FILE_BYTES) {
      emitPipelineEvent('ytdlp.cache_hit', {
        videoId: youtubeId,
        mode: cacheMode,
        fileBytes: fileStat.size,
        filename: path.basename(cached),
        afterCoalesce: true,
      })
      return {
        filePath: cached,
        filename: path.basename(cached),
        sha256: await hashFile(cached),
        fromCache: true,
      }
    }
    await rm(cached, { force: true })
  }

  if (options.transcode) {
    const reused = await tryReusePreviewForSave(
      youtubeId,
      audioWorkDir,
      cacheDir,
      options.enforceMyoSizeLimit,
      event,
    )
    if (reused) return reused
  }

  if (event) {
    const availability = await checkYoutubeVideoAvailability(event, youtubeId)
    if (availability && !availability.ok) {
      throw httpError(404, availability.message)
    }
  }

  const runId = crypto.randomUUID()
  const verbose = isPipelineLogVerbose()
  const jobDir = path.join(audioWorkDir, 'jobs', crypto.randomUUID())
  await mkdir(jobDir, { recursive: true })
  const outputTemplate = path.join(jobDir, `${youtubeId}.%(ext)s`)
  const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`
  // Anon-first: escalate to --cookies only on bot / hard 403 / age-restricted.
  const cookiesArgs = await resolveYtdlpCookiesArgs(event)
  const jsRuntimeArgs = ytdlpJsRuntimeArgs(event)
  const hasCookies = cookiesArgs.length > 0
  let useCookies = false
  let escalatedToCookies = false
  const maxAttempts = hasCookies
    ? YTDLP_MAX_ATTEMPTS + YTDLP_COOKIE_FOLLOWUP_ATTEMPTS
    : YTDLP_MAX_ATTEMPTS

  let lastStderr = ''
  let lastErrorClass: YtdlpErrorClass | 'no_file' | 'exhausted' | undefined
  let lastFormatId: string | undefined
  let lastAttemptFields: Omit<YtdlpAttemptLog, 'action' | 'ok' | 'escalated' | 'recovered'> | undefined
  let recoveredFromRetryableFailure = false
  let previousErrorClass: YtdlpErrorClass | undefined
  const runStartedAt = Date.now()

  return withPipelineContext({ runId, videoId: youtubeId, surface: cacheMode }, async () => {
    emitPipelineEvent('ytdlp.run.start', {
      videoId: youtubeId,
      mode: cacheMode,
      transcode: options.transcode,
      cookiesConfigured: hasCookies,
      maxAttempts,
      ytdlpVersion: ytdlp.version,
      ytdlpManaged: ytdlp.managed,
      verbose,
    })

    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const playerClient = playerClientForAttempt(attempt)
        const waitMs = backoffMsBeforeAttempt(attempt, previousErrorClass)
        if (waitMs > 0) await sleep(waitMs)

        await clearJobDirContents(jobDir)

        const args = buildYtdlpArgs({
          outputTemplate,
          videoUrl,
          transcode: options.transcode,
          playerClient,
          cookiesArgs: useCookies ? cookiesArgs : undefined,
          jsRuntimeArgs,
          verbose,
        })
        const authLabel = useCookies ? 'cookies' : 'anon'
        const clientLabel = playerClient ?? 'default'
        const cookiesTried = useCookies || escalatedToCookies

        const captured = await execYtdlpCapture(ytdlp.path, args, YTDLP_TIMEOUT_MS)
        const format = parseYtdlpFormatInfo(captured.stdout, captured.stderr)
        if (format.formatId) lastFormatId = format.formatId
        const attemptBase = {
          videoId: youtubeId,
          mode: cacheMode,
          transcode: options.transcode,
          attempt: attempt + 1,
          maxAttempts,
          playerClient: clientLabel,
          auth: authLabel,
          durationMs: captured.durationMs,
          exitCode: captured.exitCode,
          killed: captured.killed || undefined,
          timedOut: captured.timedOut || undefined,
          formatId: format.formatId,
          ext: format.ext,
          acodec: format.acodec,
          abr: format.abr,
          argv: redactYtdlpArgs(args),
        }
        lastAttemptFields = attemptBase

        if (!captured.ok) {
          lastStderr = captured.stderr
          const errorClass = classifyYtdlpStderr(captured.stderr)
          lastErrorClass = errorClass
          previousErrorClass = errorClass
          const failFields = {
            ...attemptBase,
            errorClass,
            hard403: isHard403(captured.stderr) || undefined,
            stderrExcerpt: excerptYtdlpOutput(captured.stderr, { verbose }) || undefined,
          }
          lastAttemptFields = failFields

          if (!useCookies && hasCookies && shouldEscalateToCookies(errorClass, captured.stderr)) {
            useCookies = true
            escalatedToCookies = true
            if (errorClass === 'retryable') {
              recoveredFromRetryableFailure = true
            }
            // Expected on datacenter IPs (e.g. Railway) when cookies are configured — not an outage.
            emitYtdlpAttempt({ ...failFields, action: 'escalate', ok: false })
            continue
          }

          if (shouldRetryYtdlp(errorClass, attempt, { usingCookies: useCookies, maxAttempts })) {
            if (errorClass === 'retryable') {
              recoveredFromRetryableFailure = true
            }
            emitYtdlpAttempt({ ...failFields, action: 'retry', ok: false })
            continue
          }

          emitYtdlpAttempt({
            ...failFields,
            action: 'fail',
            ok: false,
            escalated: escalatedToCookies,
          })
          emitPipelineEvent('ytdlp.run.end', {
            videoId: youtubeId,
            mode: cacheMode,
            ok: false,
            recovered: recoveredFromRetryableFailure,
            escalated: escalatedToCookies,
            attempts: attempt + 1,
            errorClass,
            durationMs: Date.now() - runStartedAt,
            formatId: lastFormatId,
          })
          throw httpError(502, formatYtdlpError(captured.stderr, youtubeId, { cookiesTried }))
        }

        const files = await readdir(jobDir)
        const audioFile = files.find(name => name.startsWith(`${youtubeId}.`))
        if (!audioFile) {
          lastStderr = 'ERROR: YouTube download produced no file'
          lastErrorClass = 'no_file'
          const noFileFields = {
            ...attemptBase,
            errorClass: 'no_file',
            stderrExcerpt: excerptYtdlpOutput(captured.stderr || lastStderr, { verbose }) || undefined,
          }
          lastAttemptFields = noFileFields
          if (shouldRetryYtdlp('retryable', attempt, { usingCookies: useCookies, maxAttempts })) {
            recoveredFromRetryableFailure = true
            emitYtdlpAttempt({ ...noFileFields, action: 'retry', ok: false })
            continue
          }
          emitYtdlpAttempt({
            ...noFileFields,
            action: 'fail',
            ok: false,
            escalated: escalatedToCookies,
          })
          emitPipelineEvent('ytdlp.run.end', {
            videoId: youtubeId,
            mode: cacheMode,
            ok: false,
            recovered: recoveredFromRetryableFailure,
            escalated: escalatedToCookies,
            attempts: attempt + 1,
            errorClass: 'no_file',
            durationMs: Date.now() - runStartedAt,
          })
          throw httpError(502, `YouTube download produced no file for ${youtubeId}`)
        }

        const filePath = path.join(jobDir, audioFile)
        const fileStat = await stat(filePath)
        if (options.enforceMyoSizeLimit && fileStat.size > MAX_FILE_BYTES) {
          emitYtdlpAttempt({
            ...attemptBase,
            action: 'fail',
            ok: false,
            errorClass: 'too_large',
            fileBytes: fileStat.size,
            stderrExcerpt: excerptYtdlpOutput(captured.stderr, { verbose }) || undefined,
            escalated: escalatedToCookies,
          })
          emitPipelineEvent('ytdlp.run.end', {
            videoId: youtubeId,
            mode: cacheMode,
            ok: false,
            recovered: recoveredFromRetryableFailure,
            escalated: escalatedToCookies,
            attempts: attempt + 1,
            errorClass: 'too_large',
            durationMs: Date.now() - runStartedAt,
            fileBytes: fileStat.size,
          })
          throw httpError(
            413,
            `Downloaded audio for ${youtubeId} exceeds Yoto’s 100 MB per-track limit`,
          )
        }

        const cachePath = path.join(cacheDir, audioFile)
        await readFile(filePath)
        try {
          await copyFile(filePath, cachePath)
        }
        catch (err) {
          if (isHostDiskFullError(err)) {
            throw httpError(507, HOST_DISK_FULL_MESSAGE)
          }
          throw err
        }
        await runAudioCacheSweep(event)

        emitYtdlpAttempt({
          ...attemptBase,
          action: 'ok',
          ok: true,
          ext: format.ext || path.extname(audioFile).slice(1) || undefined,
          fileBytes: fileStat.size,
          stderrExcerpt: excerptYtdlpOutput(captured.stderr, { verbose }) || undefined,
          escalated: escalatedToCookies,
          recovered: recoveredFromRetryableFailure,
        })
        emitPipelineEvent('ytdlp.run.end', {
          videoId: youtubeId,
          mode: cacheMode,
          ok: true,
          recovered: recoveredFromRetryableFailure,
          escalated: escalatedToCookies,
          attempts: attempt + 1,
          durationMs: Date.now() - runStartedAt,
          fileBytes: fileStat.size,
          formatId: format.formatId || lastFormatId,
        })

        return {
          filePath: cachePath,
          filename: audioFile,
          sha256: await hashFile(cachePath),
          fromCache: false,
          recoveredFromRetryableFailure: recoveredFromRetryableFailure || undefined,
        }
      }

      const exhaustedClass = lastStderr ? classifyYtdlpStderr(lastStderr) : 'exhausted'
      lastErrorClass = exhaustedClass
      emitYtdlpAttempt({
        ...(lastAttemptFields ?? {
          videoId: youtubeId,
          mode: cacheMode,
          transcode: options.transcode,
          attempt: maxAttempts,
          maxAttempts,
          playerClient: 'default',
          auth: useCookies ? 'cookies' : 'anon',
        }),
        action: 'fail',
        ok: false,
        errorClass: lastErrorClass,
        formatId: lastFormatId,
        escalated: escalatedToCookies,
      })
      emitPipelineEvent('ytdlp.run.end', {
        videoId: youtubeId,
        mode: cacheMode,
        ok: false,
        recovered: recoveredFromRetryableFailure,
        escalated: escalatedToCookies,
        attempts: maxAttempts,
        errorClass: lastErrorClass,
        durationMs: Date.now() - runStartedAt,
        formatId: lastFormatId,
      })
      throw httpError(502, formatYtdlpError(lastStderr || 'ERROR: retries exhausted', youtubeId, {
        cookiesTried: useCookies || escalatedToCookies,
      }))
    }
    finally {
      await cleanupJobTempDir(jobDir)
    }
  })
}
