import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { createError } from 'h3'
import type { H3Event } from 'h3'
import { resolveAudioWorkDirConfig } from './audio-work-dir'
import {
  isYtdlpVersionNewer,
  ytdlpManagedBinaryPath,
  ytdlpVersionStamp,
} from './ytdlp-tools'

const execFileAsync = promisify(execFile)

const YTDLP_FALLBACK_PATHS = [
  '/opt/homebrew/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
]

export interface ResolvedYtdlp {
  path: string
  version: string
  managed: boolean
}

let cachedYtdlp: ResolvedYtdlp | null = null

export async function readYtdlpVersion(binaryPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(binaryPath, ['--version'], { timeout: 20_000 })
    return stdout.trim().split('\n')[0] || null
  }
  catch {
    return null
  }
}

export function invalidateYtdlpBinaryCache() {
  cachedYtdlp = null
}

function configuredYtdlpPath(event?: H3Event): string {
  const config = event ? useRuntimeConfig(event) : useRuntimeConfig()
  return String(config.ytdlpPath || 'yt-dlp')
}

export async function findYtdlpBinary(event?: H3Event): Promise<ResolvedYtdlp | null> {
  if (cachedYtdlp) return cachedYtdlp

  const audioWorkDir = resolveAudioWorkDirConfig(event).audioWorkDir
  const configuredPath = configuredYtdlpPath(event)
  const managedPath = ytdlpManagedBinaryPath(audioWorkDir)

  const managedVersion = await readYtdlpVersion(managedPath)
  const managed = managedVersion
    ? { path: managedPath, version: managedVersion, managed: true as const }
    : null

  let configured: ResolvedYtdlp | null = null
  if (configuredPath && path.isAbsolute(configuredPath) && configuredPath !== managedPath) {
    const version = await readYtdlpVersion(configuredPath)
    if (version) configured = { path: configuredPath, version, managed: false }
  }

  if (managed && configured) {
    cachedYtdlp = isYtdlpVersionNewer(configured.version, managed.version) ? configured : managed
    return cachedYtdlp
  }
  if (managed) {
    cachedYtdlp = managed
    return cachedYtdlp
  }
  if (configured) {
    cachedYtdlp = configured
    return cachedYtdlp
  }

  const candidates = [...new Set([configuredPath, ...YTDLP_FALLBACK_PATHS, 'yt-dlp'])]
  let best: ResolvedYtdlp | null = null
  let bestStamp = 0
  for (const candidate of candidates) {
    if (candidate === managedPath) continue
    const version = await readYtdlpVersion(candidate)
    if (!version) continue
    const stamp = ytdlpVersionStamp(version)
    if (stamp >= bestStamp) {
      bestStamp = stamp
      best = { path: candidate, version, managed: false }
    }
  }

  cachedYtdlp = best
  return cachedYtdlp
}

export async function resolveYtdlpBinary(event?: H3Event): Promise<ResolvedYtdlp> {
  const found = await findYtdlpBinary(event)
  if (!found) {
    throw createError({
      statusCode: 500,
      message:
        'yt-dlp not found. Install it (Docker image includes it; native: apt install yt-dlp, pip install yt-dlp, or set LOUIS_YTDLP_PATH).',
    })
  }
  return found
}
