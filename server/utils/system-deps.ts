import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { H3Event } from 'h3'
import { getAudioWorkDirStats, resolveAudioWorkDirConfig } from './audio-work-dir'
import {
  getYtdlpCookiesStatus,
  type YtdlpCookiesStatus,
} from './ytdlp-cookies'
import { findYtdlpBinary } from './ytdlp-binary'

const execFileAsync = promisify(execFile)

export interface BinaryStatus {
  available: boolean
  path?: string
  version?: string
  error?: string
}

export interface SystemDepsStatus {
  ytdlp: BinaryStatus
  ffmpeg: BinaryStatus
  audioWorkDir: {
    path: string
    writable: boolean
    error?: string
  }
  audioCache: {
    cachePreviewBytes: number
    cacheSaveBytes: number
    cacheFileCount: number
    staleJobDirCount: number
  }
  /** Booleans only — never includes the cookies file path. */
  ytdlpCookies: YtdlpCookiesStatus
}

async function commandVersion(binary: string): Promise<{ path: string, version: string } | null> {
  // Desktop onedir yt-dlp can cold-start slowly; keep timeout generous.
  const timeout = 20_000
  for (const versionFlag of ['--version', '-version']) {
    try {
      const { stdout } = await execFileAsync(binary, [versionFlag], { timeout })
      const version = stdout.trim().split('\n')[0] || 'unknown'
      return { path: binary, version }
    }
    catch {
      // ffmpeg uses -version; most other CLIs use --version
    }
  }

  return null
}

/** Expand a bare command name to absolute PATH candidates (desktop prepends bundled bin). */
function expandBinaryCandidates(candidate: string): string[] {
  if (candidate.includes('/') || candidate.includes('\\')) {
    return [candidate]
  }
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  const names = process.platform === 'win32' && !candidate.endsWith('.exe')
    ? [`${candidate}.exe`, candidate]
    : [candidate]
  const out: string[] = []
  for (const dir of dirs) {
    for (const name of names) {
      out.push(path.join(dir, name))
    }
  }
  // Fall back to bare name (execFile PATH lookup) if PATH was empty.
  out.push(candidate)
  return out
}

async function resolveBinary(candidates: string[]): Promise<BinaryStatus> {
  const tried: string[] = []
  for (const candidate of candidates) {
    for (const absolute of expandBinaryCandidates(candidate)) {
      if (tried.includes(absolute)) continue
      tried.push(absolute)
      const resolved = await commandVersion(absolute)
      if (resolved) {
        return {
          available: true,
          path: resolved.path,
          version: resolved.version,
        }
      }
    }
  }

  return {
    available: false,
    error: `Not found on PATH (tried: ${candidates.join(', ')})`,
  }
}

async function checkWritableDir(dir: string): Promise<{ writable: boolean, error?: string }> {
  try {
    await access(dir, constants.W_OK)
    return { writable: true }
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'not writable'
    return { writable: false, error: message }
  }
}

export async function getSystemDepsStatus(event?: H3Event): Promise<SystemDepsStatus> {
  const audioConfig = resolveAudioWorkDirConfig(event)
  const audioWorkDir = audioConfig.audioWorkDir

  // Prefer bare `ffmpeg` so a desktop-prepended PATH bin dir wins over fixed system paths.
  const ffmpegCandidates = ['ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']

  const [foundYtdlp, ffmpeg, audioDir, audioCache, ytdlpCookies] = await Promise.all([
    findYtdlpBinary(event),
    resolveBinary(ffmpegCandidates),
    checkWritableDir(audioWorkDir),
    getAudioWorkDirStats(audioWorkDir, audioConfig.audioJobMaxAgeMs),
    getYtdlpCookiesStatus(event),
  ])

  const ytdlp: BinaryStatus = foundYtdlp
    ? { available: true, path: foundYtdlp.path, version: foundYtdlp.version }
    : { available: false, error: 'yt-dlp not found' }

  return {
    ytdlp,
    ffmpeg,
    audioWorkDir: {
      path: audioWorkDir,
      writable: audioDir.writable,
      error: audioDir.error,
    },
    audioCache,
    ytdlpCookies,
  }
}

export function isSystemReady(status: SystemDepsStatus): boolean {
  return status.ytdlp.available
    && status.ffmpeg.available
    && status.audioWorkDir.writable
}
