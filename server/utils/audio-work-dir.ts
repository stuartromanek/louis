import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { H3Event } from 'h3'

export const AUDIO_CACHE_MODES = ['preview', 'save'] as const
export type AudioCacheMode = (typeof AUDIO_CACHE_MODES)[number]

export const DEFAULT_AUDIO_JOB_MAX_AGE_MS = 3_600_000
export const DEFAULT_AUDIO_CACHE_MAX_AGE_MS = 1_209_600_000
export const DEFAULT_AUDIO_CACHE_MAX_BYTES = 5_368_709_120

export interface AudioWorkDirConfig {
  audioWorkDir: string
  audioJobMaxAgeMs: number
  audioCacheMaxAgeMs: number
  audioCacheMaxBytes: number
}

export interface AudioWorkDirStats {
  cachePreviewBytes: number
  cacheSaveBytes: number
  cacheFileCount: number
  staleJobDirCount: number
}

export interface AudioCacheSweepResult {
  deletedByAge: number
  deletedByCap: number
  remainingBytes: number
}

interface CacheFileEntry {
  path: string
  size: number
  mtimeMs: number
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.floor(parsed)
}

export function resolveAudioWorkDirConfig(event?: H3Event): AudioWorkDirConfig {
  const config = event ? useRuntimeConfig(event) : useRuntimeConfig()
  return {
    audioWorkDir: config.audioWorkDir || path.join(os.tmpdir(), 'yoto-cards-audio'),
    audioJobMaxAgeMs: parsePositiveInt(config.audioJobMaxAgeMs, DEFAULT_AUDIO_JOB_MAX_AGE_MS),
    audioCacheMaxAgeMs: parsePositiveInt(config.audioCacheMaxAgeMs, DEFAULT_AUDIO_CACHE_MAX_AGE_MS),
    audioCacheMaxBytes: parsePositiveInt(config.audioCacheMaxBytes, DEFAULT_AUDIO_CACHE_MAX_BYTES),
  }
}

export function getCacheDir(audioWorkDir: string, mode: AudioCacheMode): string {
  return path.join(audioWorkDir, 'cache', mode)
}

export function getJobsDir(audioWorkDir: string): string {
  return path.join(audioWorkDir, 'jobs')
}

export async function cleanupJobTempDir(jobDir: string): Promise<void> {
  await rm(jobDir, { recursive: true, force: true }).catch(() => {})
}

export async function migrateFlatCacheLayout(audioWorkDir: string): Promise<number> {
  const cacheRoot = path.join(audioWorkDir, 'cache')
  let migrated = 0

  try {
    await mkdir(cacheRoot, { recursive: true })
    const entries = await readdir(cacheRoot, { withFileTypes: true })
    const previewDir = getCacheDir(audioWorkDir, 'preview')
    await mkdir(previewDir, { recursive: true })

    for (const entry of entries) {
      if (!entry.isFile()) continue

      const src = path.join(cacheRoot, entry.name)
      const dest = path.join(previewDir, entry.name)
      try {
        await rename(src, dest)
        migrated++
      }
      catch {
        // Destination may already exist from a prior partial migration.
      }
    }
  }
  catch {
    // cache root may not exist yet
  }

  return migrated
}

export async function sweepOrphanedJobDirs(
  audioWorkDir: string,
  maxAgeMs: number,
): Promise<number> {
  const jobsDir = getJobsDir(audioWorkDir)
  const now = Date.now()
  let swept = 0

  try {
    const entries = await readdir(jobsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const dirPath = path.join(jobsDir, entry.name)
      const dirStat = await stat(dirPath)
      if (now - dirStat.mtimeMs > maxAgeMs) {
        await cleanupJobTempDir(dirPath)
        swept++
      }
    }
  }
  catch {
    // jobs dir may not exist yet
  }

  return swept
}

async function listCacheFiles(audioWorkDir: string): Promise<CacheFileEntry[]> {
  const files: CacheFileEntry[] = []

  for (const mode of AUDIO_CACHE_MODES) {
    const dir = getCacheDir(audioWorkDir, mode)
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue

        const filePath = path.join(dir, entry.name)
        const fileStat = await stat(filePath)
        files.push({
          path: filePath,
          size: fileStat.size,
          mtimeMs: fileStat.mtimeMs,
        })
      }
    }
    catch {
      // cache subdir may not exist yet
    }
  }

  return files
}

export async function sweepAudioCache(
  audioWorkDir: string,
  config: Pick<AudioWorkDirConfig, 'audioCacheMaxAgeMs' | 'audioCacheMaxBytes'>,
): Promise<AudioCacheSweepResult> {
  const now = Date.now()
  let deletedByAge = 0
  let deletedByCap = 0

  let files = await listCacheFiles(audioWorkDir)

  for (const file of files) {
    if (now - file.mtimeMs > config.audioCacheMaxAgeMs) {
      await rm(file.path, { force: true }).catch(() => {})
      deletedByAge++
    }
  }

  files = (await listCacheFiles(audioWorkDir))
    .sort((a, b) => a.mtimeMs - b.mtimeMs)

  let totalBytes = files.reduce((sum, file) => sum + file.size, 0)

  while (totalBytes > config.audioCacheMaxBytes && files.length > 0) {
    const oldest = files.shift()!
    await rm(oldest.path, { force: true }).catch(() => {})
    totalBytes -= oldest.size
    deletedByCap++
  }

  return {
    deletedByAge,
    deletedByCap,
    remainingBytes: totalBytes,
  }
}

export async function getAudioWorkDirStats(
  audioWorkDir: string,
  jobMaxAgeMs: number,
): Promise<AudioWorkDirStats> {
  const now = Date.now()
  let cachePreviewBytes = 0
  let cacheSaveBytes = 0
  let cacheFileCount = 0
  let staleJobDirCount = 0

  for (const mode of AUDIO_CACHE_MODES) {
    const dir = getCacheDir(audioWorkDir, mode)
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue

        const fileStat = await stat(path.join(dir, entry.name))
        cacheFileCount++
        if (mode === 'preview') cachePreviewBytes += fileStat.size
        else cacheSaveBytes += fileStat.size
      }
    }
    catch {
      // cache subdir may not exist yet
    }
  }

  try {
    const entries = await readdir(getJobsDir(audioWorkDir), { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const dirStat = await stat(path.join(getJobsDir(audioWorkDir), entry.name))
      if (now - dirStat.mtimeMs > jobMaxAgeMs) {
        staleJobDirCount++
      }
    }
  }
  catch {
    // jobs dir may not exist yet
  }

  return {
    cachePreviewBytes,
    cacheSaveBytes,
    cacheFileCount,
    staleJobDirCount,
  }
}

export async function runAudioWorkDirMaintenance(event?: H3Event): Promise<void> {
  const config = resolveAudioWorkDirConfig(event)
  const migrated = await migrateFlatCacheLayout(config.audioWorkDir)
  const sweptJobs = await sweepOrphanedJobDirs(config.audioWorkDir, config.audioJobMaxAgeMs)
  const cacheResult = await sweepAudioCache(config.audioWorkDir, config)

  if (
    migrated > 0
    || sweptJobs > 0
    || cacheResult.deletedByAge > 0
    || cacheResult.deletedByCap > 0
  ) {
    console.info('[audio-work-dir] startup maintenance', {
      migrated,
      sweptJobs,
      ...cacheResult,
    })
  }
}

export async function runAudioCacheSweep(event?: H3Event): Promise<void> {
  const config = resolveAudioWorkDirConfig(event)
  const result = await sweepAudioCache(config.audioWorkDir, config)

  if (result.deletedByAge > 0 || result.deletedByCap > 0) {
    console.info('[audio-work-dir] cache sweep', result)
  }
}
