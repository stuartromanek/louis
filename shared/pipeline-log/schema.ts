/** Pipeline journal schema. Events are JSONL records with `v: 1`. */

export const PIPELINE_LOG_VERSION = 1 as const

export type PipelineSurface = 'preview' | 'save' | 'discovery'

export const PIPELINE_EVENT_NAMES = [
  'runtime.snapshot',
  'ytdlp.cache_hit',
  'ytdlp.coalesce',
  'ytdlp.preview_remux',
  'ytdlp.run.start',
  'ytdlp.run.end',
  'ytdlp.attempt',
  'ytdlp.preflight',
  'save.job.start',
  'save.job.complete',
  'save.job.fail',
  'save.extract.start',
  'save.extract.end',
  'save.prepare',
  'loudnorm.start',
  'loudnorm.ok',
  'loudnorm.fallback',
  'yoto.transcode',
] as const

export type PipelineEventName = (typeof PIPELINE_EVENT_NAMES)[number]

export type PipelineContextFields = {
  surface?: PipelineSurface
  jobId?: string
  requestId?: string
  videoId?: string
  cardId?: string
  normalizeVolume?: boolean
  cacheKey?: string
  runId?: string
}

/** One JSONL line. Extra fields are event-specific. */
export type PipelineLogRecord = {
  v: typeof PIPELINE_LOG_VERSION
  ts: string
  event: PipelineEventName | string
} & PipelineContextFields & Record<string, unknown>

export type YtdlpAttemptAction = 'ok' | 'retry' | 'escalate' | 'fail'
export type YtdlpAuth = 'anon' | 'cookies'
export type YtdlpCacheMode = 'preview' | 'save'

export const PIPELINE_LOG_DIRNAME = 'logs'
export const PIPELINE_LOG_FILENAME = 'pipeline.jsonl'

export const DEFAULT_PIPELINE_LOG_MAX_FILE_BYTES = 10 * 1024 * 1024
export const DEFAULT_PIPELINE_LOG_MAX_TOTAL_BYTES = 50 * 1024 * 1024
export const DEFAULT_PIPELINE_LOG_MAX_FILES = 5

export const DEFAULT_STDERR_EXCERPT_BYTES = 8 * 1024
export const VERBOSE_STDERR_EXCERPT_BYTES = 64 * 1024

const PIPELINE_EVENT_NAME_SET = new Set<string>(PIPELINE_EVENT_NAMES)

export function isPipelineEventName(event: string): event is PipelineEventName {
  return PIPELINE_EVENT_NAME_SET.has(event)
}

/** `pipeline.jsonl` is 0; `pipeline.jsonl.1` is 1 (oldest rotated files have higher indexes). */
export function rotatedIndex(name: string): number {
  if (name === PIPELINE_LOG_FILENAME) return 0
  const match = name.match(/\.(\d+)$/)
  return match ? Number(match[1]) : 0
}
