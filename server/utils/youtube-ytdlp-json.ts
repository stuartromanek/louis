import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import {
  classifyYtdlpStderr,
  formatYtdlpError,
  isHard403,
  shouldEscalateToCookies,
} from '../../shared/myo-editor/ytdlpErrors.ts'
import {
  excerptYtdlpOutput,
  redactYtdlpArgs,
} from '../../shared/pipeline-log/redact.ts'
import { resolveYtdlpBinary } from './ytdlp-binary.ts'
import { resolveYtdlpCookiesArgs } from './ytdlp-cookies.ts'
import { ytdlpJsRuntimeArgs } from './ytdlp-js-runtime.ts'
import {
  emitPipelineEvent,
  isPipelineLogVerbose,
  withPipelineContext,
} from './pipeline-log.ts'

const execFileAsync = promisify(execFile)

const YTDLP_DISCOVERY_TIMEOUT_MS = 30_000
const YTDLP_DISCOVERY_MAX_BUFFER = 12 * 1024 * 1024
const YTDLP_DISCOVERY_CONCURRENCY = 2

let activeDiscovery = 0
const discoveryWaiters: Array<() => void> = []

async function withDiscoverySlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeDiscovery >= YTDLP_DISCOVERY_CONCURRENCY) {
    await new Promise<void>(resolve => discoveryWaiters.push(resolve))
  }
  activeDiscovery += 1
  try {
    return await fn()
  }
  finally {
    activeDiscovery -= 1
    discoveryWaiters.shift()?.()
  }
}

interface YtdlpDumpEntry {
  id?: string
  title?: string
  description?: string
  channel?: string
  uploader?: string
  channel_id?: string
  thumbnail?: string
  thumbnails?: Array<{ url?: string }>
  duration?: number | null
  upload_date?: string
  live_status?: string
  availability?: string
  playlist_count?: number
  n_entries?: number
  entries?: Array<YtdlpDumpEntry | null>
  webpage_url?: string
  original_url?: string
  _type?: string
}

export interface RunYtdlpJsonOptions {
  event?: H3Event
  args: string[]
  cacheKey: string
}

type ExecFileError = {
  stderr?: string
  stdout?: string
  message?: string
  killed?: boolean
}

function stderrFromError(err: unknown): string {
  const e = err as ExecFileError
  return String(e.stderr || e.message || '')
}

function throwDiscoveryError(
  stderr: string,
  options?: { killed?: boolean, cookiesTried?: boolean },
): never {
  if (options?.killed) {
    throw createError({
      statusCode: 504,
      message: 'YouTube lookup timed out. Try again in a moment.',
    })
  }
  const errorClass = classifyYtdlpStderr(stderr)
  const formatOptions = { cookiesTried: options?.cookiesTried, kind: 'lookup' as const }
  if (errorClass === 'bot_signin') {
    throw createError({
      statusCode: 502,
      message: formatYtdlpError(stderr, 'discovery', formatOptions),
    })
  }
  if (errorClass === 'private') {
    throw createError({
      statusCode: 404,
      message: 'This YouTube playlist or video is private.',
    })
  }
  if (errorClass === 'unavailable') {
    throw createError({
      statusCode: 404,
      message: 'YouTube content was not found or is not public.',
    })
  }
  throw createError({
    statusCode: 502,
    message: formatYtdlpError(stderr, 'discovery', formatOptions),
  })
}

type DiscoveryAttemptLog = {
  action: 'ok' | 'retry' | 'escalate' | 'fail'
  runId: string
  cacheKey: string
  attempt: number
  maxAttempts: number
  playerClient: string
  auth: string
  durationMs: number
  ok: boolean
  exitCode?: number | string
  killed?: boolean
  timedOut?: boolean
  errorClass?: string
  hard403?: boolean
  argv: string[]
  stderrExcerpt?: string
}

function emitDiscoveryAttempt(fields: DiscoveryAttemptLog): void {
  const { action, cacheKey, errorClass, playerClient } = fields
  if (action === 'retry') {
    console.info(`[yt-dlp] discovery retry client=${playerClient} reason=${errorClass} key=${cacheKey}`)
  }
  else if (action === 'escalate') {
    console.info(`[yt-dlp] discovery escalate reason=${errorClass} key=${cacheKey}`)
  }
  emitPipelineEvent('ytdlp.attempt', { mode: 'discovery', ...fields })
}

async function execYtdlpJson(
  binaryPath: string,
  args: string[],
): Promise<{ stdout: string, stderr: string, durationMs: number }> {
  const started = Date.now()
  const { stdout, stderr } = await execFileAsync(binaryPath, args, {
    timeout: YTDLP_DISCOVERY_TIMEOUT_MS,
    maxBuffer: YTDLP_DISCOVERY_MAX_BUFFER,
    encoding: 'utf8',
  })
  return {
    stdout: String(stdout ?? ''),
    stderr: String(stderr ?? ''),
    durationMs: Date.now() - started,
  }
}

function parseDump(stdout: string): YtdlpDumpEntry {
  const trimmed = stdout.trim()
  if (!trimmed) {
    throw createError({
      statusCode: 502,
      message: 'YouTube lookup returned no data.',
    })
  }
  try {
    return JSON.parse(trimmed) as YtdlpDumpEntry
  }
  catch {
    const entries: YtdlpDumpEntry[] = []
    for (const line of trimmed.split('\n')) {
      const piece = line.trim()
      if (!piece) continue
      try {
        entries.push(JSON.parse(piece) as YtdlpDumpEntry)
      }
      catch {
        throw createError({
          statusCode: 502,
          message: 'YouTube lookup returned invalid data.',
        })
      }
    }
    if (entries.length === 1) return entries[0]!
    if (entries.length > 1) return { entries }
    throw createError({
      statusCode: 502,
      message: 'YouTube lookup returned invalid data.',
    })
  }
}

/**
 * Run yt-dlp `-J` for discovery (search / playlist / channel / video metadata).
 * Anonymous first; one android client retry on bot-check, then cookies on bot / hard 403 / age-gate.
 */
export async function runYtdlpJson(options: RunYtdlpJsonOptions): Promise<YtdlpDumpEntry> {
  return withDiscoverySlot(async () => {
    return withPipelineContext({ surface: 'discovery', cacheKey: options.cacheKey }, async () => {
      const ytdlp = await resolveYtdlpBinary(options.event)
      const cookiesArgs = await resolveYtdlpCookiesArgs(options.event)
      const jsRuntimeArgs = ytdlpJsRuntimeArgs(options.event)
      const verbose = isPipelineLogVerbose()
      const runId = crypto.randomUUID()
      const runStartedAt = Date.now()
      const baseArgs = [
        ...jsRuntimeArgs,
        '--skip-download',
        '--no-warnings',
        '--ignore-no-formats-error',
        '-J',
        ...(verbose ? ['-v'] : []),
        ...options.args,
      ]

      type DiscoveryAttempt = { cookies: boolean, playerClient: string | null }
      const attempts: DiscoveryAttempt[] = [{ cookies: false, playerClient: null }]
      if (cookiesArgs.length > 0) attempts.push({ cookies: true, playerClient: null })

      let lastStderr = ''
      let lastKilled = false
      let cookiesTried = false
      let insertedAndroid = false
      let lastErrorClass: string | undefined

      emitPipelineEvent('ytdlp.run.start', {
        runId,
        mode: 'discovery',
        cookiesConfigured: cookiesArgs.length > 0,
        ytdlpVersion: ytdlp.version,
        ytdlpManaged: ytdlp.managed,
        verbose,
        cacheKey: options.cacheKey,
      })

      for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i]!
        if (attempt.cookies) cookiesTried = true
        const clientArgs = attempt.playerClient
          ? ['--extractor-args', `youtube:player_client=${attempt.playerClient}`]
          : []
        const args = attempt.cookies
          ? [...cookiesArgs, ...clientArgs, ...baseArgs]
          : [...clientArgs, ...baseArgs]
        const clientLabel = attempt.playerClient ?? 'default'
        const authLabel = attempt.cookies ? 'cookies' : 'anon'
        const started = Date.now()
        try {
          const captured = await execYtdlpJson(ytdlp.path, args)
          emitDiscoveryAttempt({
            runId,
            cacheKey: options.cacheKey,
            attempt: i + 1,
            maxAttempts: attempts.length,
            playerClient: clientLabel,
            auth: authLabel,
            durationMs: captured.durationMs,
            ok: true,
            action: 'ok',
            argv: redactYtdlpArgs(args),
            stderrExcerpt: excerptYtdlpOutput(captured.stderr, { verbose }) || undefined,
          })
          emitPipelineEvent('ytdlp.run.end', {
            runId,
            mode: 'discovery',
            ok: true,
            attempts: i + 1,
            durationMs: Date.now() - runStartedAt,
            cacheKey: options.cacheKey,
          })
          return parseDump(captured.stdout)
        }
        catch (err: unknown) {
          const e = err as ExecFileError & { statusCode?: number, code?: number | string }
          if (e.statusCode) throw err
          lastStderr = stderrFromError(err)
          lastKilled = Boolean(e.killed)
          const errorClass = classifyYtdlpStderr(lastStderr)
          lastErrorClass = errorClass
          const durationMs = Date.now() - started
          const attemptFields = {
            runId,
            cacheKey: options.cacheKey,
            attempt: i + 1,
            maxAttempts: attempts.length,
            playerClient: clientLabel,
            auth: authLabel,
            durationMs,
            ok: false as const,
            exitCode: e.code,
            killed: lastKilled || undefined,
            timedOut: lastKilled || undefined,
            errorClass,
            hard403: isHard403(lastStderr) || undefined,
            argv: redactYtdlpArgs(args),
            stderrExcerpt: excerptYtdlpOutput(lastStderr, { verbose }) || undefined,
          }

          if (
            errorClass === 'bot_signin'
            && !attempt.cookies
            && !attempt.playerClient
            && !insertedAndroid
          ) {
            insertedAndroid = true
            attempts.splice(i + 1, 0, { cookies: false, playerClient: 'android' })
            emitDiscoveryAttempt({ ...attemptFields, action: 'retry' })
            continue
          }

          const canEscalate = !attempt.cookies
            && cookiesArgs.length > 0
            && shouldEscalateToCookies(errorClass, lastStderr)
          if (canEscalate) {
            emitDiscoveryAttempt({ ...attemptFields, action: 'escalate' })
            continue
          }
          emitDiscoveryAttempt({ ...attemptFields, action: 'fail' })
          emitPipelineEvent('ytdlp.run.end', {
            runId,
            mode: 'discovery',
            ok: false,
            attempts: i + 1,
            errorClass,
            durationMs: Date.now() - runStartedAt,
            cacheKey: options.cacheKey,
          })
          throwDiscoveryError(lastStderr, { killed: lastKilled, cookiesTried })
        }
      }

      emitDiscoveryAttempt({
        runId,
        cacheKey: options.cacheKey,
        attempt: attempts.length,
        maxAttempts: attempts.length,
        playerClient: 'default',
        auth: cookiesTried ? 'cookies' : 'anon',
        durationMs: Date.now() - runStartedAt,
        ok: false,
        action: 'fail',
        errorClass: lastErrorClass,
        argv: redactYtdlpArgs(baseArgs),
        stderrExcerpt: excerptYtdlpOutput(lastStderr, { verbose }) || undefined,
      })
      emitPipelineEvent('ytdlp.run.end', {
        runId,
        mode: 'discovery',
        ok: false,
        attempts: attempts.length,
        errorClass: lastErrorClass,
        durationMs: Date.now() - runStartedAt,
        cacheKey: options.cacheKey,
      })
      throwDiscoveryError(lastStderr, { killed: lastKilled, cookiesTried })
    })
  })
}
