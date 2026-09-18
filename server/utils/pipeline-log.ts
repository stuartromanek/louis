import { AsyncLocalStorage } from 'node:async_hooks'
import { appendFile, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import type { H3Event } from 'h3'
import { pickLouisEnv } from './louis-env.ts'
import { resolveAudioWorkDirConfig } from './audio-work-dir.ts'
import {
  DEFAULT_PIPELINE_LOG_MAX_FILE_BYTES,
  DEFAULT_PIPELINE_LOG_MAX_FILES,
  DEFAULT_PIPELINE_LOG_MAX_TOTAL_BYTES,
  PIPELINE_LOG_DIRNAME,
  PIPELINE_LOG_FILENAME,
  PIPELINE_LOG_VERSION,
  isPipelineEventName,
  rotatedIndex,
  type PipelineContextFields,
  type PipelineEventName,
  type PipelineLogRecord,
} from '../../shared/pipeline-log/schema.ts'

export type PipelineLogInitOptions = {
  audioWorkDir: string
  enabled?: boolean
  verbose?: boolean
  maxFileBytes?: number
  maxTotalBytes?: number
  maxFiles?: number
}

type SinkState = {
  audioWorkDir: string
  enabled: boolean
  verbose: boolean
  maxFileBytes: number
  maxTotalBytes: number
  maxFiles: number
  writeTail: Promise<void>
}

const context = new AsyncLocalStorage<PipelineContextFields>()
let sink: SinkState | null = null
const warnedUnknownEvents = new Set<string>()

function envEnabled(): boolean {
  const raw = pickLouisEnv('LOUIS_PIPELINE_LOG', 'NUXT_PIPELINE_LOG').toLowerCase()
  if (!raw) return true
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no'
}

function envVerbose(): boolean {
  const raw = pickLouisEnv('LOUIS_PIPELINE_LOG_VERBOSE', 'NUXT_PIPELINE_LOG_VERBOSE').toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes'
}

export function getPipelineLogDir(audioWorkDir: string): string {
  return path.join(audioWorkDir, PIPELINE_LOG_DIRNAME)
}

export function getPipelineLogPath(audioWorkDir: string): string {
  return path.join(getPipelineLogDir(audioWorkDir), PIPELINE_LOG_FILENAME)
}

export function initPipelineLog(options: PipelineLogInitOptions): void {
  sink = {
    audioWorkDir: options.audioWorkDir,
    enabled: options.enabled ?? envEnabled(),
    verbose: options.verbose ?? envVerbose(),
    maxFileBytes: options.maxFileBytes ?? DEFAULT_PIPELINE_LOG_MAX_FILE_BYTES,
    maxTotalBytes: options.maxTotalBytes ?? DEFAULT_PIPELINE_LOG_MAX_TOTAL_BYTES,
    maxFiles: Math.max(1, options.maxFiles ?? DEFAULT_PIPELINE_LOG_MAX_FILES),
    writeTail: Promise.resolve(),
  }
}

export function resetPipelineLogForTests(): void {
  sink = null
  warnedUnknownEvents.clear()
}

export function isPipelineLogEnabled(): boolean {
  if (sink) return sink.enabled
  return envEnabled()
}

export function isPipelineLogVerbose(): boolean {
  if (sink) return sink.verbose
  return envVerbose()
}

export function getPipelineContext(): PipelineContextFields {
  return { ...(context.getStore() ?? {}) }
}

export function withPipelineContext<T>(patch: PipelineContextFields, fn: () => T): T {
  const parent = context.getStore() ?? {}
  const next: PipelineContextFields = { ...parent }
  for (const key of Object.keys(patch) as Array<keyof PipelineContextFields>) {
    const value = patch[key]
    if (value !== undefined) next[key] = value as never
  }
  return context.run(next, fn)
}

export function emitPipelineEvent(
  event: PipelineEventName | string,
  fields?: Record<string, unknown>,
): void {
  if (!isPipelineEventName(event) && !warnedUnknownEvents.has(event)) {
    warnedUnknownEvents.add(event)
    console.warn(`[pipeline-log] unknown event name: ${event}`)
  }
  if (!isPipelineLogEnabled()) return
  const state = sink
  if (!state) return

  const record: PipelineLogRecord = {
    v: PIPELINE_LOG_VERSION,
    ts: new Date().toISOString(),
    event,
    ...getPipelineContext(),
    ...omitUndefined(fields),
  }

  enqueueWrite(state, () => appendPipelineRecord(state, record))
}

export function flushPipelineLog(): Promise<void> {
  return sink?.writeTail ?? Promise.resolve()
}

export async function getPipelineLogStatus(event?: H3Event): Promise<{
  enabled: boolean
  bytes: number
  fileCount: number
}> {
  const enabled = isPipelineLogEnabled()
  const audioWorkDir = sink?.audioWorkDir ?? resolveAudioWorkDirConfig(event).audioWorkDir
  const dir = getPipelineLogDir(audioWorkDir)
  try {
    const files = await listLogFiles(dir)
    let bytes = 0
    for (const file of files) {
      bytes += file.size
    }
    return { enabled, bytes, fileCount: files.length }
  }
  catch {
    return { enabled, bytes: 0, fileCount: 0 }
  }
}

function omitUndefined(fields?: Record<string, unknown>): Record<string, unknown> {
  if (!fields) return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

function enqueueWrite(state: SinkState, work: () => Promise<void>): void {
  state.writeTail = state.writeTail.then(work, work).catch((err) => {
    console.warn('[pipeline-log] write failed:', err instanceof Error ? err.message : err)
  })
}

async function appendPipelineRecord(state: SinkState, record: PipelineLogRecord): Promise<void> {
  const dir = getPipelineLogDir(state.audioWorkDir)
  await mkdir(dir, { recursive: true })
  await rotateIfNeeded(state, dir)
  await appendFile(getPipelineLogPath(state.audioWorkDir), `${JSON.stringify(record)}\n`, 'utf8')
}

async function rotateIfNeeded(state: SinkState, dir: string): Promise<void> {
  const active = getPipelineLogPath(state.audioWorkDir)
  let activeSize = 0
  try {
    activeSize = (await stat(active)).size
  }
  catch {
    return
  }
  if (activeSize < state.maxFileBytes) {
    await enforceTotalCap(state, dir)
    return
  }

  const maxIndex = state.maxFiles - 1
  const oldest = path.join(dir, `${PIPELINE_LOG_FILENAME}.${maxIndex}`)
  await unlink(oldest).catch(() => {})
  for (let i = maxIndex - 1; i >= 1; i--) {
    const from = path.join(dir, `${PIPELINE_LOG_FILENAME}.${i}`)
    const to = path.join(dir, `${PIPELINE_LOG_FILENAME}.${i + 1}`)
    await rename(from, to).catch(() => {})
  }
  await rename(active, path.join(dir, `${PIPELINE_LOG_FILENAME}.1`)).catch(() => {})
  await enforceTotalCap(state, dir)
}

async function enforceTotalCap(state: SinkState, dir: string): Promise<void> {
  const files = await listLogFiles(dir)
  let total = files.reduce((sum, file) => sum + file.size, 0)
  let remaining = files.length
  const removable = files
    .filter(file => file.name !== PIPELINE_LOG_FILENAME)
    .sort((a, b) => rotatedIndex(b.name) - rotatedIndex(a.name))

  for (const file of removable) {
    if (total <= state.maxTotalBytes && remaining <= state.maxFiles) break
    await unlink(file.path).catch(() => {})
    total -= file.size
    remaining -= 1
  }
}

async function listLogFiles(dir: string): Promise<Array<{ name: string, path: string, size: number }>> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: Array<{ name: string, path: string, size: number }> = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (entry.name !== PIPELINE_LOG_FILENAME && !entry.name.startsWith(`${PIPELINE_LOG_FILENAME}.`)) continue
    const filePath = path.join(dir, entry.name)
    const fileStat = await stat(filePath)
    files.push({ name: entry.name, path: filePath, size: fileStat.size })
  }
  return files
}
