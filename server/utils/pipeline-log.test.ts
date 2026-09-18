import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  emitPipelineEvent,
  flushPipelineLog,
  getPipelineContext,
  getPipelineLogPath,
  getPipelineLogStatus,
  initPipelineLog,
  resetPipelineLogForTests,
  withPipelineContext,
} from './pipeline-log.ts'
import { rotatedIndex } from '../../shared/pipeline-log/schema.ts'

async function tempWorkDir(label: string): Promise<string> {
  return path.join(os.tmpdir(), `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
}

afterEach(() => {
  resetPipelineLogForTests()
})

describe('pipeline-log sink', () => {
  it('merges ALS context into JSONL records', async () => {
    const audioWorkDir = await tempWorkDir('louis-pipeline-log')
    initPipelineLog({ audioWorkDir, enabled: true })

    withPipelineContext({ surface: 'save', jobId: 'job-1', videoId: 'aaaaaaaaaaa' }, () => {
      emitPipelineEvent('ytdlp.cache_hit', { mode: 'save', fileBytes: 12 })
    })
    await flushPipelineLog()

    const raw = await readFile(getPipelineLogPath(audioWorkDir), 'utf8')
    const record = JSON.parse(raw.trim()) as Record<string, unknown>
    assert.equal(record.v, 1)
    assert.equal(record.event, 'ytdlp.cache_hit')
    assert.equal(record.surface, 'save')
    assert.equal(record.jobId, 'job-1')
    assert.equal(record.videoId, 'aaaaaaaaaaa')
    assert.equal(record.mode, 'save')
    assert.equal(record.fileBytes, 12)
  })

  it('rotates when the active file exceeds the cap', async () => {
    const audioWorkDir = await tempWorkDir('louis-pipeline-rotate')
    initPipelineLog({
      audioWorkDir,
      enabled: true,
      maxFileBytes: 200,
      maxTotalBytes: 10_000,
      maxFiles: 3,
    })

    for (let i = 0; i < 40; i++) {
      emitPipelineEvent('ytdlp.coalesce', { videoId: 'bbbbbbbbbbb', i })
    }
    await flushPipelineLog()

    const status = await getPipelineLogStatus()
    assert.ok(status.fileCount >= 2)
    assert.equal(status.enabled, true)
    const active = await readFile(getPipelineLogPath(audioWorkDir), 'utf8')
    assert.ok(active.includes('ytdlp.coalesce'))
  })

  it('does not write when disabled', async () => {
    const audioWorkDir = await tempWorkDir('louis-pipeline-off')
    initPipelineLog({ audioWorkDir, enabled: false })
    emitPipelineEvent('ytdlp.coalesce', { videoId: 'ccccccccccc' })
    await flushPipelineLog()
    await assert.rejects(readFile(getPipelineLogPath(audioWorkDir), 'utf8'))
  })

  it('does not sweep non-log files in the logs dir', async () => {
    const audioWorkDir = await tempWorkDir('louis-pipeline-keep')
    const logsDir = path.join(audioWorkDir, 'logs')
    await mkdir(logsDir, { recursive: true })
    const sidecar = path.join(logsDir, 'notes.txt')
    await writeFile(sidecar, 'keep me')
    initPipelineLog({ audioWorkDir, enabled: true, maxFileBytes: 50, maxFiles: 2 })
    for (let i = 0; i < 20; i++) emitPipelineEvent('loudnorm.ok', { i })
    await flushPipelineLog()
    assert.equal(await readFile(sidecar, 'utf8'), 'keep me')
  })
})

describe('withPipelineContext', () => {
  it('nests and preserves parent fields', () => {
    withPipelineContext({ surface: 'save', jobId: 'job-2' }, () => {
      withPipelineContext({ videoId: 'ddddddddddd', runId: 'run-1' }, () => {
        const store = getPipelineContext()
        assert.equal(store.surface, 'save')
        assert.equal(store.jobId, 'job-2')
        assert.equal(store.videoId, 'ddddddddddd')
        assert.equal(store.runId, 'run-1')
      })
    })
  })
})

describe('rotatedIndex', () => {
  it('orders the active file before rotated suffixes', () => {
    assert.equal(rotatedIndex('pipeline.jsonl'), 0)
    assert.equal(rotatedIndex('pipeline.jsonl.1'), 1)
    assert.equal(rotatedIndex('pipeline.jsonl.4'), 4)
  })
})

describe('emitPipelineEvent', () => {
  it('warns once for an unknown event name', async () => {
    const audioWorkDir = await tempWorkDir('louis-pipeline-unknown')
    initPipelineLog({ audioWorkDir, enabled: true })
    const warnings: string[] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '))
    }
    try {
      emitPipelineEvent('ytdlp.not_a_real_event', { videoId: 'aaaaaaaaaaa' })
      emitPipelineEvent('ytdlp.not_a_real_event', { videoId: 'aaaaaaaaaaa' })
      await flushPipelineLog()
    }
    finally {
      console.warn = original
    }
    assert.equal(warnings.filter(line => line.includes('unknown event name')).length, 1)
  })
})
