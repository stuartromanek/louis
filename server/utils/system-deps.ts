import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { H3Event } from 'h3'
import { getAudioWorkDirStats, resolveAudioWorkDirConfig } from './audio-work-dir'

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
}

async function commandVersion(binary: string): Promise<{ path: string, version: string } | null> {
  for (const versionFlag of ['--version', '-version']) {
    try {
      const { stdout } = await execFileAsync(binary, [versionFlag], { timeout: 5000 })
      const version = stdout.trim().split('\n')[0] || 'unknown'
      return { path: binary, version }
    }
    catch {
      // ffmpeg uses -version; most other CLIs use --version
    }
  }

  return null
}

async function resolveBinary(candidates: string[]): Promise<BinaryStatus> {
  for (const candidate of candidates) {
    const resolved = await commandVersion(candidate)
    if (resolved) {
      return {
        available: true,
        path: resolved.path,
        version: resolved.version,
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
  const config = event ? useRuntimeConfig(event) : useRuntimeConfig()
  const audioConfig = resolveAudioWorkDirConfig(event)
  const configuredYtdlp = config.ytdlpPath || 'yt-dlp'
  const audioWorkDir = audioConfig.audioWorkDir

  const ytdlpCandidates = [...new Set([
    configuredYtdlp,
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    'yt-dlp',
  ])]

  const ffmpegCandidates = ['ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']

  const [ytdlp, ffmpeg, audioDir, audioCache] = await Promise.all([
    resolveBinary(ytdlpCandidates),
    resolveBinary(ffmpegCandidates),
    checkWritableDir(audioWorkDir),
    getAudioWorkDirStats(audioWorkDir, audioConfig.audioJobMaxAgeMs),
  ])

  return {
    ytdlp,
    ffmpeg,
    audioWorkDir: {
      path: audioWorkDir,
      writable: audioDir.writable,
      error: audioDir.error,
    },
    audioCache,
  }
}

export function isSystemReady(status: SystemDepsStatus): boolean {
  return status.ytdlp.available
    && status.ffmpeg.available
    && status.audioWorkDir.writable
}
