import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import {
  classifyYtdlpStderr,
  formatYtdlpError,
  shouldEscalateToCookies,
} from '../../shared/myo-editor/ytdlpErrors.ts'
import { resolveYtdlpBinary } from './ytdlp-binary.ts'
import { resolveYtdlpCookiesArgs } from './ytdlp-cookies.ts'

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

function throwDiscoveryError(stderr: string, killed?: boolean): never {
  if (killed) {
    throw createError({
      statusCode: 504,
      message: 'YouTube lookup timed out. Try again in a moment.',
    })
  }
  const errorClass = classifyYtdlpStderr(stderr)
  if (errorClass === 'bot_signin') {
    throw createError({
      statusCode: 502,
      message: 'YouTube blocked this lookup (bot check). Try again later, or add cookies in Settings.',
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
    message: formatYtdlpError(stderr, 'discovery'),
  })
}

async function execYtdlpJson(
  binaryPath: string,
  args: string[],
): Promise<string> {
  const { stdout } = await execFileAsync(binaryPath, args, {
    timeout: YTDLP_DISCOVERY_TIMEOUT_MS,
    maxBuffer: YTDLP_DISCOVERY_MAX_BUFFER,
  })
  return stdout
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
 * Anonymous first; retries with cookies only on bot-check / hard 403 / age-gate.
 */
export async function runYtdlpJson(options: RunYtdlpJsonOptions): Promise<YtdlpDumpEntry> {
  return withDiscoverySlot(async () => {
    const ytdlp = await resolveYtdlpBinary(options.event)
    const cookiesArgs = await resolveYtdlpCookiesArgs(options.event)
    const baseArgs = [
      '--skip-download',
      '--no-warnings',
      '--ignore-no-formats-error',
      '-J',
      ...options.args,
    ]

    const attempts: Array<{ cookies: boolean }> = [{ cookies: false }]
    if (cookiesArgs.length > 0) attempts.push({ cookies: true })

    let lastStderr = ''
    let lastKilled = false

    for (const attempt of attempts) {
      const args = attempt.cookies
        ? [...cookiesArgs, ...baseArgs]
        : baseArgs
      try {
        const stdout = await execYtdlpJson(ytdlp.path, args)
        return parseDump(stdout)
      }
      catch (err: unknown) {
        const e = err as ExecFileError & { statusCode?: number }
        if (e.statusCode) throw err
        lastStderr = stderrFromError(err)
        lastKilled = Boolean(e.killed)
        const errorClass = classifyYtdlpStderr(lastStderr)
        const canEscalate = !attempt.cookies
          && cookiesArgs.length > 0
          && shouldEscalateToCookies(errorClass, lastStderr)
        if (canEscalate) {
          console.info(`[yt-dlp] discovery escalate reason=${errorClass} key=${options.cacheKey}`)
          continue
        }
        throwDiscoveryError(lastStderr, lastKilled)
      }
    }

    throwDiscoveryError(lastStderr, lastKilled)
  })
}
