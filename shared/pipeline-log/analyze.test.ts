import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  analyzePipelineEvents,
  formatPipelineReport,
  parsePipelineJsonl,
  parseSince,
} from './analyze.ts'
import { PIPELINE_LOG_VERSION, type PipelineLogRecord } from './schema.ts'

function event(
  name: string,
  ts: string,
  fields: Record<string, unknown> = {},
): PipelineLogRecord {
  return {
    v: PIPELINE_LOG_VERSION,
    ts,
    event: name,
    ...fields,
  }
}

describe('parsePipelineJsonl', () => {
  it('skips malformed and other-version lines', () => {
    const events = parsePipelineJsonl([
      '{"v":1,"ts":"2026-09-01T00:00:00.000Z","event":"ytdlp.cache_hit","videoId":"aaaaaaaaaaa"}',
      'not-json',
      '{"v":2,"ts":"2026-09-01T00:00:01.000Z","event":"ytdlp.cache_hit"}',
      '',
    ].join('\n'))
    assert.equal(events.length, 1)
    assert.equal(events[0]?.videoId, 'aaaaaaaaaaa')
  })
})

describe('parseSince', () => {
  it('parses relative durations', () => {
    const now = Date.parse('2026-09-12T12:00:00.000Z')
    assert.equal(parseSince('7d', now), now - 7 * 86_400_000)
    assert.equal(parseSince('24h', now), now - 24 * 3_600_000)
  })
})

describe('analyzePipelineEvents', () => {
  it('flags preview cache hit plus save bot_signin', () => {
    const report = analyzePipelineEvents([
      event('ytdlp.cache_hit', '2026-09-12T10:00:00.000Z', {
        videoId: 'aaaaaaaaaaa',
        mode: 'preview',
      }),
      event('ytdlp.run.end', '2026-09-12T10:05:00.000Z', {
        videoId: 'aaaaaaaaaaa',
        mode: 'save',
        ok: false,
        errorClass: 'bot_signin',
      }),
      event('ytdlp.attempt', '2026-09-12T10:05:00.000Z', {
        videoId: 'aaaaaaaaaaa',
        mode: 'save',
        action: 'fail',
        ok: false,
        errorClass: 'bot_signin',
        playerClient: null,
        auth: 'anon',
      }),
    ])
    assert.equal(report.previewVsSave[0]?.headline, 'preview_cache_save_fail')
    assert.equal(report.previewVsSave[0]?.preview.cacheHits, 1)
    assert.equal(report.previewVsSave[0]?.save.liveFail, 1)
    assert.equal(report.errorClassCounts.bot_signin, 1)
  })

  it('flags preview live ok then save remux fail and format diffs', () => {
    const report = analyzePipelineEvents([
      event('ytdlp.run.end', '2026-09-12T11:00:00.000Z', {
        videoId: 'bbbbbbbbbbb',
        mode: 'preview',
        ok: true,
        formatId: '251',
      }),
      event('ytdlp.attempt', '2026-09-12T11:00:00.000Z', {
        videoId: 'bbbbbbbbbbb',
        mode: 'preview',
        action: 'ok',
        ok: true,
        formatId: '251',
        playerClient: 'android',
        auth: 'anon',
      }),
      event('ytdlp.run.end', '2026-09-12T11:01:00.000Z', {
        videoId: 'bbbbbbbbbbb',
        mode: 'save',
        ok: false,
        errorClass: 'retryable',
        formatId: '140',
      }),
      event('ytdlp.attempt', '2026-09-12T11:01:00.000Z', {
        videoId: 'bbbbbbbbbbb',
        mode: 'save',
        action: 'fail',
        ok: false,
        formatId: '140',
        playerClient: 'ios',
        auth: 'cookies',
        errorClass: 'retryable',
      }),
    ])
    assert.equal(report.previewVsSave[0]?.headline, 'preview_ok_save_fail')
    assert.equal(report.formatDiffs[0]?.previewFormat, '251')
    assert.equal(report.formatDiffs[0]?.saveFormat, '140')
  })

  it('counts cookie escalate then recovered ok', () => {
    const report = analyzePipelineEvents([
      event('ytdlp.attempt', '2026-09-12T12:00:00.000Z', {
        videoId: 'ccccccccccc',
        mode: 'save',
        action: 'escalate',
        ok: false,
        errorClass: 'bot_signin',
        auth: 'anon',
        playerClient: null,
      }),
      event('ytdlp.attempt', '2026-09-12T12:00:01.000Z', {
        videoId: 'ccccccccccc',
        mode: 'save',
        action: 'ok',
        ok: true,
        auth: 'cookies',
        playerClient: 'tv',
      }),
      event('ytdlp.run.end', '2026-09-12T12:00:01.000Z', {
        videoId: 'ccccccccccc',
        mode: 'save',
        ok: true,
        recovered: true,
      }),
    ])
    assert.equal(report.escalateCount, 1)
    assert.equal(report.recoverCount, 1)
    assert.equal(report.attemptOk, 1)
    assert.equal(report.previewVsSave[0]?.headline, 'save_only')
  })

  it('filters --video and --since', () => {
    const events = [
      event('ytdlp.run.end', '2026-09-01T00:00:00.000Z', { videoId: 'oldvideo000', mode: 'save', ok: false }),
      event('ytdlp.run.end', '2026-09-12T00:00:00.000Z', { videoId: 'keepme00000', mode: 'save', ok: true }),
      event('ytdlp.run.end', '2026-09-12T00:00:00.000Z', { videoId: 'other000000', mode: 'preview', ok: true }),
    ]
    const report = analyzePipelineEvents(events, {
      videoId: 'keepme00000',
      sinceMs: Date.parse('2026-09-10T00:00:00.000Z'),
    })
    assert.equal(report.filteredCount, 1)
    assert.equal(report.previewVsSave[0]?.videoId, 'keepme00000')
  })

  it('attributes attempt fails to yt-dlp version windows', () => {
    const report = analyzePipelineEvents([
      event('runtime.snapshot', '2026-09-12T08:00:00.000Z', { ytdlpVersion: '2026.09.01' }),
      event('ytdlp.attempt', '2026-09-12T08:10:00.000Z', { action: 'fail', ok: false, mode: 'save' }),
      event('runtime.snapshot', '2026-09-12T09:00:00.000Z', { ytdlpVersion: '2026.09.10' }),
      event('ytdlp.attempt', '2026-09-12T09:10:00.000Z', { action: 'ok', ok: true, mode: 'save' }),
    ])
    assert.equal(report.ytdlpVersions[0]?.version, '2026.09.01')
    assert.equal(report.ytdlpVersions[0]?.fails, 1)
    assert.equal(report.ytdlpVersions[1]?.fails, 0)
  })

  it('counts loudnorm fallback and transcode stall separately from yt-dlp', () => {
    const report = analyzePipelineEvents([
      event('loudnorm.ok', '2026-09-12T10:00:00.000Z'),
      event('loudnorm.fallback', '2026-09-12T10:00:01.000Z', { reason: 'parse' }),
      event('ytdlp.preview_remux', '2026-09-12T10:00:01.500Z', { ok: true, copied: true }),
      event('ytdlp.preview_remux', '2026-09-12T10:00:01.600Z', { ok: false }),
      event('yoto.transcode', '2026-09-12T10:00:02.000Z', { result: 'stall' }),
      event('save.job.start', '2026-09-12T10:00:00.000Z'),
      event('save.job.fail', '2026-09-12T10:05:00.000Z'),
    ])
    assert.equal(report.loudnormOk, 1)
    assert.equal(report.loudnormFallback, 1)
    assert.equal(report.previewRemuxOk, 1)
    assert.equal(report.previewRemuxFail, 1)
    assert.equal(report.transcodeByResult.stall, 1)
    assert.equal(report.saveJobs.fail, 1)
    assert.match(formatPipelineReport(report), /Preview vs save/)
  })

  it('reads the checked-in preview-vs-save fixture', async () => {
    const fixturePath = fileURLToPath(new URL('./fixtures/preview-vs-save.jsonl', import.meta.url))
    const text = await readFile(fixturePath, 'utf8')
    const report = analyzePipelineEvents(parsePipelineJsonl(text))
    const byId = Object.fromEntries(report.previewVsSave.map(row => [row.videoId, row.headline]))
    assert.equal(byId.aaaaaaaaaaa, 'preview_cache_save_fail')
    assert.equal(byId.bbbbbbbbbbb, 'preview_ok_save_fail')
    assert.equal(byId.ccccccccccc, 'save_only')
    assert.equal(byId.ddddddddddd, 'preview_remux_save_ok')
    assert.equal(report.escalateCount, 1)
    assert.equal(report.recoverCount, 1)
    assert.equal(report.previewRemuxOk, 1)
    assert.equal(report.formatDiffs[0]?.previewFormat, '251')
    assert.equal(report.formatDiffs[0]?.saveFormat, '140')
    assert.match(formatPipelineReport(report), /aaaaaaaaaaa {2}preview_cache_save_fail/)
  })

  it('treats download-shaped remux events as remux reuse, not a save cache hit', () => {
    const report = analyzePipelineEvents([
      event('ytdlp.cache_hit', '2026-09-12T14:00:00.000Z', {
        videoId: 'eeeeeeeeeee',
        mode: 'preview',
        fileBytes: 4096,
        filename: 'eeeeeeeeeee.webm',
      }),
      event('ytdlp.preview_remux', '2026-09-12T14:00:01.000Z', {
        videoId: 'eeeeeeeeeee',
        ok: true,
        copied: false,
        source: 'eeeeeeeeeee.webm',
        fileBytes: 5120,
      }),
      event('ytdlp.attempt', '2026-09-12T14:01:00.000Z', {
        videoId: 'fffffffff00',
        mode: 'save',
        action: 'fail',
        ok: false,
        errorClass: 'too_large',
        attempt: 1,
        maxAttempts: 4,
        auth: 'anon',
        playerClient: 'default',
      }),
      event('ytdlp.run.end', '2026-09-12T14:01:00.100Z', {
        videoId: 'fffffffff00',
        mode: 'save',
        ok: false,
        errorClass: 'too_large',
        attempts: 1,
      }),
    ])
    const remux = report.previewVsSave.find(row => row.videoId === 'eeeeeeeeeee')
    assert.equal(remux?.headline, 'preview_remux_save_ok')
    assert.equal(remux?.save.cacheHits, 0)
    assert.equal(remux?.save.liveOk, 0)
    assert.equal(report.previewRemuxOk, 1)
    assert.equal(report.attemptFail, 1)
    const tooLarge = report.previewVsSave.find(row => row.videoId === 'fffffffff00')
    assert.equal(tooLarge?.headline, 'save_only')
    assert.equal(tooLarge?.save.liveFail, 1)
  })
})
