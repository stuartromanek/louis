import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { TranscodedAudioResult } from '../../shared/myo-editor/types.ts'

export interface SplitPartTranscodeCacheKey {
  youtubeId: string
  index: number
  count: number
  normalizeVolume: boolean
  startSeconds: number
  durationSeconds: number
}

export interface SplitPartTranscodeCacheRecord {
  youtubeId: string
  index: number
  count: number
  normalizeVolume: boolean
  startSeconds: number
  durationSeconds: number
  sourceSha256?: string
  transcodedSha256: string
  transcodedInfo: TranscodedAudioResult['transcodedInfo']
  cachedAt: number
}

function safeYoutubeId(youtubeId: string): string {
  return youtubeId.replace(/[^A-Za-z0-9_-]/g, '_')
}

function roundedSeconds(value: number): number {
  return Math.round(Math.max(0, value))
}

export function splitPartCachePath(
  audioWorkDir: string,
  key: SplitPartTranscodeCacheKey,
): string {
  const normalize = key.normalizeVolume ? '1' : '0'
  const name = [
    'split-part',
    safeYoutubeId(key.youtubeId),
    `n${normalize}`,
    `p${key.index}`,
    `c${key.count}`,
    `s${roundedSeconds(key.startSeconds)}`,
    `d${roundedSeconds(key.durationSeconds)}`,
  ].join('-') + '.json'
  return path.join(audioWorkDir, 'cache', 'save', name)
}

export function transcodedFromSplitCache(
  record: SplitPartTranscodeCacheRecord | null,
): TranscodedAudioResult | null {
  if (!record?.transcodedSha256) return null
  return {
    transcodedSha256: record.transcodedSha256,
    transcodedInfo: record.transcodedInfo ?? {},
  }
}

export async function readSplitPartTranscodeCache(
  audioWorkDir: string,
  key: SplitPartTranscodeCacheKey,
  expectedSourceSha256?: string,
): Promise<SplitPartTranscodeCacheRecord | null> {
  try {
    const raw = await readFile(splitPartCachePath(audioWorkDir, key), 'utf8')
    const parsed = JSON.parse(raw) as SplitPartTranscodeCacheRecord
    if (typeof parsed?.transcodedSha256 !== 'string' || !parsed.transcodedSha256) {
      return null
    }
    if (
      expectedSourceSha256
      && parsed.sourceSha256
      && parsed.sourceSha256 !== expectedSourceSha256
    ) {
      return null
    }
    return parsed
  }
  catch {
    return null
  }
}

export function shouldSkipSplitSourceDownload(
  hits: Array<TranscodedAudioResult | null>,
): boolean {
  return hits.length > 0 && hits.every(hit => hit !== null)
}

export async function writeSplitPartTranscodeCache(
  audioWorkDir: string,
  key: SplitPartTranscodeCacheKey,
  result: TranscodedAudioResult,
  sourceSha256?: string,
): Promise<void> {
  const filePath = splitPartCachePath(audioWorkDir, key)
  await mkdir(path.dirname(filePath), { recursive: true })
  const record: SplitPartTranscodeCacheRecord = {
    youtubeId: key.youtubeId,
    index: key.index,
    count: key.count,
    normalizeVolume: key.normalizeVolume,
    startSeconds: roundedSeconds(key.startSeconds),
    durationSeconds: roundedSeconds(key.durationSeconds),
    sourceSha256,
    transcodedSha256: result.transcodedSha256,
    transcodedInfo: result.transcodedInfo ?? {},
    cachedAt: Date.now(),
  }
  await writeFile(filePath, `${JSON.stringify(record)}\n`, 'utf8')
}
