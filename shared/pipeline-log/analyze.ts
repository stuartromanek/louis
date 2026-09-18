import { PIPELINE_LOG_VERSION, type PipelineLogRecord } from './schema.ts'

export type AnalyzePipelineOptions = {
  videoId?: string
  sinceMs?: number
  nowMs?: number
}

export type PreviewSaveHeadline =
  | 'preview_cache_save_fail'
  | 'preview_ok_save_fail'
  | 'save_ok_preview_fail'
  | 'preview_remux_save_ok'
  | 'both_ok'
  | 'both_fail'
  | 'preview_only'
  | 'save_only'

export type VideoModeStats = {
  cacheHits: number
  liveOk: number
  liveFail: number
  lastAt?: string
  lastErrorClass?: string
  lastFormatId?: string
}

export type PreviewVsSaveRow = {
  videoId: string
  preview: VideoModeStats
  save: VideoModeStats
  headline: PreviewSaveHeadline
}

export type PipelineReport = {
  eventCount: number
  filteredCount: number
  range?: { from: string, to: string }
  previewVsSave: PreviewVsSaveRow[]
  errorClassCounts: Record<string, number>
  playerClientCounts: Record<string, number>
  authCounts: Record<string, number>
  modeCounts: Record<string, number>
  escalateCount: number
  retryCount: number
  recoverCount: number
  attemptOk: number
  attemptFail: number
  botSigninBuckets: Array<{ bucket: string, count: number }>
  hard403Buckets: Array<{ bucket: string, count: number }>
  ytdlpVersions: Array<{
    version: string
    from: string
    attempts: number
    fails: number
  }>
  formatDiffs: Array<{
    videoId: string
    previewFormat?: string
    saveFormat?: string
  }>
  loudnormOk: number
  loudnormFallback: number
  previewRemuxOk: number
  previewRemuxFail: number
  transcodeByResult: Record<string, number>
  saveJobs: { started: number, complete: number, fail: number }
}

const EMPTY_MODE: VideoModeStats = {
  cacheHits: 0,
  liveOk: 0,
  liveFail: 0,
}

export function parsePipelineJsonl(text: string): PipelineLogRecord[] {
  const events: PipelineLogRecord[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed) as PipelineLogRecord
      if (!parsed || typeof parsed !== 'object') continue
      if (parsed.v !== PIPELINE_LOG_VERSION) continue
      if (typeof parsed.event !== 'string' || typeof parsed.ts !== 'string') continue
      events.push(parsed)
    }
    catch {
      // skip malformed lines
    }
  }
  return events
}

export function parseSince(raw: string | undefined, nowMs = Date.now()): number | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim()
  const relative = /^(\d+)\s*(d|h|m|s)$/i.exec(trimmed)
  if (relative) {
    const n = Number(relative[1])
    const unit = relative[2]!.toLowerCase()
    const ms = unit === 'd'
      ? n * 86_400_000
      : unit === 'h'
        ? n * 3_600_000
        : unit === 'm'
          ? n * 60_000
          : n * 1000
    return nowMs - ms
  }
  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function filterPipelineEvents(
  events: PipelineLogRecord[],
  options: AnalyzePipelineOptions = {},
): PipelineLogRecord[] {
  const sinceMs = options.sinceMs
  const videoId = options.videoId?.trim()
  return events.filter((event) => {
    if (videoId && event.videoId !== videoId) return false
    if (sinceMs != null) {
      const ts = Date.parse(event.ts)
      if (!Number.isFinite(ts) || ts < sinceMs) return false
    }
    return true
  })
}

export function analyzePipelineEvents(
  events: PipelineLogRecord[],
  options: AnalyzePipelineOptions = {},
): PipelineReport {
  const filtered = filterPipelineEvents(events, options).slice().sort((a, b) => a.ts.localeCompare(b.ts))
  const byVideo = new Map<string, { preview: VideoModeStats, save: VideoModeStats, remuxOk: number }>()
  const errorClassCounts: Record<string, number> = {}
  const playerClientCounts: Record<string, number> = {}
  const authCounts: Record<string, number> = {}
  const modeCounts: Record<string, number> = {}
  const botSigninBuckets = new Map<string, number>()
  const hard403Buckets = new Map<string, number>()
  const transcodeByResult: Record<string, number> = {}
  const versions: Array<{ version: string, at: string }> = []

  let escalateCount = 0
  let retryCount = 0
  let recoverCount = 0
  let attemptOk = 0
  let attemptFail = 0
  let loudnormOk = 0
  let loudnormFallback = 0
  let previewRemuxOk = 0
  let previewRemuxFail = 0
  let saveStarted = 0
  let saveComplete = 0
  let saveFail = 0

  const bump = (map: Record<string, number>, key: string) => {
    map[key] = (map[key] || 0) + 1
  }

  const videoRow = (videoId: string) => {
    let row = byVideo.get(videoId)
    if (!row) {
      row = { preview: { ...EMPTY_MODE }, save: { ...EMPTY_MODE }, remuxOk: 0 }
      byVideo.set(videoId, row)
    }
    return row
  }

  const modeStats = (videoId: string, mode: string): VideoModeStats | null => {
    if (mode !== 'preview' && mode !== 'save') return null
    return videoRow(videoId)[mode]
  }

  for (const event of filtered) {
    if (event.event === 'runtime.snapshot' && typeof event.ytdlpVersion === 'string') {
      versions.push({ version: event.ytdlpVersion, at: event.ts })
    }

    if (event.event === 'ytdlp.cache_hit' && typeof event.videoId === 'string') {
      const stats = modeStats(event.videoId, String(event.mode || event.surface || ''))
      if (stats) {
        stats.cacheHits += 1
        stats.lastAt = event.ts
      }
    }

    if (event.event === 'ytdlp.run.end' && typeof event.videoId === 'string') {
      const stats = modeStats(event.videoId, String(event.mode || event.surface || ''))
      if (stats) {
        if (event.ok === true) stats.liveOk += 1
        else stats.liveFail += 1
        stats.lastAt = event.ts
        if (typeof event.errorClass === 'string') stats.lastErrorClass = event.errorClass
        if (typeof event.formatId === 'string') stats.lastFormatId = event.formatId
      }
      if (event.recovered === true) recoverCount += 1
    }

    if (event.event === 'ytdlp.attempt') {
      const mode = String(event.mode || event.surface || 'unknown')
      bump(modeCounts, mode)
      const client = event.playerClient == null || event.playerClient === ''
        ? 'default'
        : String(event.playerClient)
      bump(playerClientCounts, client)
      if (typeof event.auth === 'string') bump(authCounts, event.auth)
      if (typeof event.errorClass === 'string') bump(errorClassCounts, event.errorClass)
      if (event.action === 'escalate') escalateCount += 1
      if (event.action === 'retry') retryCount += 1
      if (event.ok === true || event.action === 'ok') attemptOk += 1
      if (event.ok === false || event.action === 'fail') attemptFail += 1
      const bucket = hourBucket(event.ts)
      if (event.errorClass === 'bot_signin' && bucket) {
        botSigninBuckets.set(bucket, (botSigninBuckets.get(bucket) || 0) + 1)
      }
      if (event.hard403 === true && bucket) {
        hard403Buckets.set(bucket, (hard403Buckets.get(bucket) || 0) + 1)
      }
      if (typeof event.videoId === 'string' && event.ok === true && typeof event.formatId === 'string') {
        const stats = modeStats(event.videoId, mode)
        if (stats) stats.lastFormatId = event.formatId
      }
    }

    if (event.event === 'loudnorm.ok') loudnormOk += 1
    if (event.event === 'loudnorm.fallback') loudnormFallback += 1
    if (event.event === 'ytdlp.preview_remux') {
      if (event.ok === true) {
        previewRemuxOk += 1
        if (typeof event.videoId === 'string') videoRow(event.videoId).remuxOk += 1
      }
      else {
        previewRemuxFail += 1
      }
    }
    if (event.event === 'yoto.transcode') bump(transcodeByResult, String(event.result || 'unknown'))
    if (event.event === 'save.job.start') saveStarted += 1
    if (event.event === 'save.job.complete') saveComplete += 1
    if (event.event === 'save.job.fail') saveFail += 1
  }

  const previewVsSave: PreviewVsSaveRow[] = [...byVideo.entries()]
    .map(([videoId, row]) => ({
      videoId,
      preview: row.preview,
      save: row.save,
      headline: headlineFor(row.preview, row.save, row.remuxOk),
    }))
    .filter(row => row.headline !== 'preview_only' || row.preview.liveFail > 0 || row.preview.cacheHits > 0)
    .sort((a, b) => headlineRank(a.headline) - headlineRank(b.headline) || a.videoId.localeCompare(b.videoId))

  const formatDiffs = previewVsSave.flatMap((row) => {
    if (!row.preview.lastFormatId && !row.save.lastFormatId) return []
    if (row.preview.lastFormatId === row.save.lastFormatId) return []
    if (!row.preview.lastFormatId || !row.save.lastFormatId) return []
    return [{
      videoId: row.videoId,
      previewFormat: row.preview.lastFormatId,
      saveFormat: row.save.lastFormatId,
    }]
  })

  const versionWindows = versions.length === 0
    ? []
    : versions.map((entry, index) => {
      const nextAt = versions[index + 1]?.at
      const windowEvents = filtered.filter((event) => {
        if (event.event !== 'ytdlp.attempt') return false
        if (event.ts < entry.at) return false
        if (nextAt && event.ts >= nextAt) return false
        return true
      })
      return {
        version: entry.version,
        from: entry.at,
        attempts: windowEvents.length,
        fails: windowEvents.filter(event => event.ok === false || event.action === 'fail').length,
      }
    })

  return {
    eventCount: events.length,
    filteredCount: filtered.length,
    range: filtered.length > 0
      ? { from: filtered[0]!.ts, to: filtered[filtered.length - 1]!.ts }
      : undefined,
    previewVsSave,
    errorClassCounts,
    playerClientCounts,
    authCounts,
    modeCounts,
    escalateCount,
    retryCount,
    recoverCount,
    attemptOk,
    attemptFail,
    botSigninBuckets: [...botSigninBuckets.entries()]
      .map(([bucket, count]) => ({ bucket, count }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket)),
    hard403Buckets: [...hard403Buckets.entries()]
      .map(([bucket, count]) => ({ bucket, count }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket)),
    ytdlpVersions: versionWindows,
    formatDiffs,
    loudnormOk,
    loudnormFallback,
    previewRemuxOk,
    previewRemuxFail,
    transcodeByResult,
    saveJobs: { started: saveStarted, complete: saveComplete, fail: saveFail },
  }
}

function headlineFor(preview: VideoModeStats, save: VideoModeStats, remuxOk = 0): PreviewSaveHeadline {
  const previewSeen = preview.cacheHits + preview.liveOk + preview.liveFail > 0
  const saveSeen = save.cacheHits + save.liveOk + save.liveFail > 0
  const previewLive = preview.liveOk + preview.liveFail > 0
  const saveFail = save.liveFail > 0
  const saveOk = save.liveOk > 0 || (save.cacheHits > 0 && save.liveFail === 0)
  const previewOk = preview.liveOk > 0 || (preview.cacheHits > 0 && preview.liveFail === 0)

  if (previewSeen && saveFail && !previewLive && preview.cacheHits > 0) return 'preview_cache_save_fail'
  if (previewOk && saveFail) return 'preview_ok_save_fail'
  if (saveOk && preview.liveFail > 0 && !previewOk) return 'save_ok_preview_fail'
  if (preview.liveFail > 0 && saveFail) return 'both_fail'
  if ((previewSeen || remuxOk > 0) && remuxOk > 0 && save.liveFail === 0) return 'preview_remux_save_ok'
  if (previewOk && saveOk) return 'both_ok'
  if (previewSeen && !saveSeen) return 'preview_only'
  if (saveSeen && !previewSeen) return 'save_only'
  return 'both_ok'
}

function headlineRank(headline: PreviewSaveHeadline): number {
  const order: PreviewSaveHeadline[] = [
    'preview_cache_save_fail',
    'preview_ok_save_fail',
    'save_ok_preview_fail',
    'both_fail',
    'preview_remux_save_ok',
    'both_ok',
    'preview_only',
    'save_only',
  ]
  return order.indexOf(headline)
}

function hourBucket(ts: string): string | undefined {
  const ms = Date.parse(ts)
  if (!Number.isFinite(ms)) return undefined
  const d = new Date(ms)
  const iso = d.toISOString()
  return `${iso.slice(0, 13)}:00Z`
}

export function formatPipelineReport(report: PipelineReport): string {
  const lines: string[] = []
  lines.push('Louis pipeline diagnostics')
  lines.push(`events: ${report.filteredCount}/${report.eventCount}`)
  if (report.range) lines.push(`range: ${report.range.from} → ${report.range.to}`)
  lines.push('')

  lines.push('## Preview vs save (same videoId)')
  if (report.previewVsSave.length === 0) {
    lines.push('(none)')
  }
  else {
    for (const row of report.previewVsSave) {
      lines.push(
        `${row.videoId}  ${row.headline}`
        + `  preview[cache=${row.preview.cacheHits} liveOk=${row.preview.liveOk} liveFail=${row.preview.liveFail}`
        + `${row.preview.lastFormatId ? ` fmt=${row.preview.lastFormatId}` : ''}`
        + `${row.preview.lastErrorClass ? ` err=${row.preview.lastErrorClass}` : ''}]`
        + `  save[cache=${row.save.cacheHits} liveOk=${row.save.liveOk} liveFail=${row.save.liveFail}`
        + `${row.save.lastFormatId ? ` fmt=${row.save.lastFormatId}` : ''}`
        + `${row.save.lastErrorClass ? ` err=${row.save.lastErrorClass}` : ''}]`,
      )
    }
  }
  lines.push('')

  lines.push('## yt-dlp attempts')
  lines.push(`ok=${report.attemptOk} fail=${report.attemptFail} retry=${report.retryCount} escalate=${report.escalateCount} recoveredRuns=${report.recoverCount}`)
  lines.push(`errorClass: ${formatCounts(report.errorClassCounts)}`)
  lines.push(`playerClient: ${formatCounts(report.playerClientCounts)}`)
  lines.push(`auth: ${formatCounts(report.authCounts)}`)
  lines.push(`mode: ${formatCounts(report.modeCounts)}`)
  lines.push('')

  lines.push('## Bot / 403 time buckets (UTC hour)')
  if (report.botSigninBuckets.length === 0 && report.hard403Buckets.length === 0) {
    lines.push('(none)')
  }
  else {
    for (const row of report.botSigninBuckets) {
      lines.push(`bot_signin ${row.bucket}  ${row.count}`)
    }
    for (const row of report.hard403Buckets) {
      lines.push(`hard403 ${row.bucket}  ${row.count}`)
    }
  }
  lines.push('')

  lines.push('## yt-dlp versions')
  if (report.ytdlpVersions.length === 0) {
    lines.push('(no runtime.snapshot)')
  }
  else {
    for (const row of report.ytdlpVersions) {
      lines.push(`${row.version} from ${row.from}  attempts=${row.attempts} fails=${row.fails}`)
    }
  }
  lines.push('')

  lines.push('## Format id preview vs save')
  if (report.formatDiffs.length === 0) {
    lines.push('(no differences)')
  }
  else {
    for (const row of report.formatDiffs) {
      lines.push(`${row.videoId}  preview=${row.previewFormat} save=${row.saveFormat}`)
    }
  }
  lines.push('')

  lines.push('## Later pipeline')
  lines.push(`preview remux ok=${report.previewRemuxOk} fail=${report.previewRemuxFail}`)
  lines.push(`loudnorm ok=${report.loudnormOk} fallback=${report.loudnormFallback}`)
  lines.push(`transcode: ${formatCounts(report.transcodeByResult)}`)
  lines.push(`save jobs start=${report.saveJobs.started} complete=${report.saveJobs.complete} fail=${report.saveJobs.fail}`)
  lines.push('')

  return lines.join('\n')
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (entries.length === 0) return '(none)'
  return entries.map(([key, count]) => `${key}=${count}`).join(' ')
}
