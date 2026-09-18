#!/usr/bin/env node
/**
 * Read Louis pipeline JSONL journals and print a preview-vs-save diagnostic report.
 *
 *   npm run diagnose:pipeline -- /data/audio
 *   npm run diagnose:pipeline -- --video dQw4w9wgXcQ --since 7d
 */
import { parseArgs } from 'node:util'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  analyzePipelineEvents,
  formatPipelineReport,
  parsePipelineJsonl,
  parseSince,
} from '../shared/pipeline-log/analyze.ts'
import {
  PIPELINE_LOG_DIRNAME,
  PIPELINE_LOG_FILENAME,
  rotatedIndex,
} from '../shared/pipeline-log/schema.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    video: { type: 'string' },
    since: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(`Usage: diagnose:pipeline [path] [--video <id>] [--since 7d]

path  Audio work dir, logs dir, or a pipeline.jsonl file.
      Defaults to LOUIS_AUDIO_WORK_DIR or the current directory.

--video   Only events for this YouTube id
--since   Relative (7d, 24h, 30m) or an ISO timestamp
`)
  process.exit(0)
}

const sinceMs = parseSince(values.since)
if (values.since && sinceMs == null) {
  console.error(`Invalid --since value: ${values.since}`)
  process.exit(1)
}

const input = positionals[0]
  || process.env.LOUIS_AUDIO_WORK_DIR
  || process.env.NUXT_AUDIO_WORK_DIR
  || process.cwd()

const texts = await readJournalTexts(path.resolve(input))
if (texts.length === 0) {
  console.error(`No ${PIPELINE_LOG_FILENAME} found under ${input}`)
  process.exit(1)
}

const events = parsePipelineJsonl(texts.join('\n'))
const report = analyzePipelineEvents(events, {
  videoId: values.video,
  sinceMs,
})
process.stdout.write(formatPipelineReport(report))

async function readJournalTexts(target) {
  const fileStat = await stat(target).catch(() => null)
  if (!fileStat) return []

  if (fileStat.isFile()) {
    return [await readFile(target, 'utf8')]
  }

  const dirs = [
    path.join(target, PIPELINE_LOG_DIRNAME),
    target,
  ]
  for (const dir of dirs) {
    const files = await listJournalFiles(dir)
    if (files.length > 0) {
      return Promise.all(files.map(file => readFile(file, 'utf8')))
    }
  }
  return []
}

async function listJournalFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const names = entries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter((name) => {
      return name === PIPELINE_LOG_FILENAME
        || name.startsWith(`${PIPELINE_LOG_FILENAME}.`)
    })
    .sort((a, b) => rotatedIndex(b) - rotatedIndex(a))
  return names.map(name => path.join(dir, name))
}
