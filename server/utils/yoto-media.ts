import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { fetchYotoApi } from './yoto'
import type { TranscodedAudioResult } from '#shared/myo-editor/types'
import {
  formatTranscodeGiveUpMessage,
  formatTranscodeLogLine,
  transcodePollBudget,
  transcodePollIntervalMs,
  transcodeProgressKey,
  transcodeRetryDecision,
  transcodeShouldStall,
  type TranscodeGiveUpReason,
} from './yoto-transcode-poll'

interface UploadUrlResponse {
  upload: {
    uploadId: string
    uploadUrl: string | null
  }
}

interface TranscodePollResponse {
  transcode: {
    transcodedSha256?: string
    transcodedInfo?: TranscodedAudioResult['transcodedInfo']
    progress?: {
      phase?: string
      percent?: number
    }
  }
}

export interface TranscodeUploadMeta {
  jobId?: string
  youtubeId?: string
  partLabel?: string
  title?: string
  durationSeconds?: number
}

const TRANSCODE_FAILURE_PHASES = new Set(['failed', 'error', 'cancelled', 'aborted'])

export class TranscodeGiveUpError extends Error {
  readonly statusCode: number
  readonly statusMessage: string

  constructor(
    readonly reason: TranscodeGiveUpReason,
    message: string,
    readonly uploadId: string,
  ) {
    super(message)
    this.name = 'TranscodeGiveUpError'
    this.statusCode = reason === 'failed' ? 502 : 504
    this.statusMessage = message
  }
}

export async function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

export async function getUploadUrl(
  accessToken: string,
  params: { sha256: string; filename: string },
): Promise<UploadUrlResponse['upload']> {
  const data = await fetchYotoApi<UploadUrlResponse>(
    `/media/transcode/audio/uploadUrl?${new URLSearchParams({
      sha256: params.sha256,
      filename: params.filename,
    }).toString()}`,
    accessToken,
  )
  return data.upload
}

export async function putAudioFile(
  uploadUrl: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  const fileStat = await stat(filePath)
  await $fetch(uploadUrl, {
    method: 'PUT',
    body: createReadStream(filePath),
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(fileStat.size),
    },
    timeout: 30 * 60 * 1000,
  })
}

export async function pollTranscoded(
  accessToken: string,
  uploadId: string,
  options?: {
    maxWaitMs?: number
    onPoll?: (info: { attempt: number; phase?: string; percent?: number }) => void
    meta?: TranscodeUploadMeta
    sizeMb?: number
  },
): Promise<TranscodedAudioResult> {
  const maxWaitMs = options?.maxWaitMs ?? transcodePollBudget({ bytes: 0 })
  const startedAt = Date.now()
  let lastChangeAt = startedAt
  let lastKey = ''
  let lastPhase: string | undefined
  let lastPercent: number | undefined
  let attempt = 0

  const logContext = {
    jobId: options?.meta?.jobId,
    youtubeId: options?.meta?.youtubeId,
    partLabel: options?.meta?.partLabel,
    sizeMb: options?.sizeMb ?? 0,
    durationSec: options?.meta?.durationSeconds,
    uploadId,
  }

  while (true) {
    attempt += 1
    const data = await fetchYotoApi<TranscodePollResponse>(
      `/media/upload/${uploadId}/transcoded?loudnorm=false`,
      accessToken,
    )

    const transcode = data.transcode
    const phase = transcode?.progress?.phase
    const percent = transcode?.progress?.percent
    lastPhase = phase
    lastPercent = percent
    options?.onPoll?.({ attempt, phase, percent })

    const key = transcodeProgressKey(phase, percent)
    if (key !== lastKey) {
      lastKey = key
      lastChangeAt = Date.now()
    }

    if (phase === 'complete' || transcode?.transcodedSha256) {
      if (!transcode?.transcodedSha256) {
        throw createError({
          statusCode: 502,
          statusMessage: 'Yoto transcoding completed without a track hash',
        })
      }
      console.info(formatTranscodeLogLine({
        ...logContext,
        result: 'ok',
        attempt,
        lastPhase,
        lastPercent,
        elapsedMs: Date.now() - startedAt,
      }))
      return {
        transcodedSha256: transcode.transcodedSha256,
        transcodedInfo: transcode.transcodedInfo ?? {},
      }
    }

    if (phase && TRANSCODE_FAILURE_PHASES.has(phase)) {
      console.info(formatTranscodeLogLine({
        ...logContext,
        result: 'failed',
        attempt,
        lastPhase,
        lastPercent,
        elapsedMs: Date.now() - startedAt,
      }))
      throw new TranscodeGiveUpError(
        'failed',
        `Yoto audio transcoding failed (${phase})`,
        uploadId,
      )
    }

    const elapsedMs = Date.now() - startedAt
    const unchangedMs = Date.now() - lastChangeAt
    if (transcodeShouldStall({ elapsedMs, unchangedMs })) {
      console.info(formatTranscodeLogLine({
        ...logContext,
        result: 'stall',
        attempt,
        lastPhase,
        lastPercent,
        elapsedMs,
      }))
      throw new TranscodeGiveUpError(
        'stall',
        formatTranscodeGiveUpMessage({
          reason: 'stall',
          title: options?.meta?.title,
          partLabel: options?.meta?.partLabel,
          lastPercent,
          elapsedMs,
        }),
        uploadId,
      )
    }

    if (elapsedMs >= maxWaitMs) {
      console.info(formatTranscodeLogLine({
        ...logContext,
        result: 'timeout',
        attempt,
        lastPhase,
        lastPercent,
        elapsedMs,
      }))
      throw new TranscodeGiveUpError(
        'timeout',
        formatTranscodeGiveUpMessage({
          reason: 'timeout',
          title: options?.meta?.title,
          partLabel: options?.meta?.partLabel,
          lastPercent,
          elapsedMs,
        }),
        uploadId,
      )
    }

    await new Promise(resolve => setTimeout(resolve, transcodePollIntervalMs(elapsedMs)))
  }
}

function guessContentType(filePath: string): string {
  if (filePath.endsWith('.m4a')) return 'audio/mp4'
  if (filePath.endsWith('.mp3')) return 'audio/mpeg'
  if (filePath.endsWith('.opus')) return 'audio/opus'
  if (filePath.endsWith('.webm')) return 'audio/webm'
  return 'application/octet-stream'
}

export interface PutAudioForTranscodeResult {
  uploadId: string
  sha256: string
  filePath: string
  filename: string
  sizeMb: number
  budget: number
}

export interface PutAudioForTranscodeOptions {
  poll?: { maxWaitMs?: number }
  meta?: TranscodeUploadMeta
}

async function putToUploadUrl(
  uploadUrl: string | null,
  filePath: string,
): Promise<void> {
  if (!uploadUrl) return
  await putAudioFile(uploadUrl, filePath, guessContentType(filePath))
}

export async function putAudioForTranscode(
  accessToken: string,
  filePath: string,
  filename: string,
  options?: PutAudioForTranscodeOptions,
): Promise<PutAudioForTranscodeResult> {
  const fileStat = await stat(filePath)
  const sha256 = await hashFileSha256(filePath)
  const sizeMb = fileStat.size / 1_000_000
  const budget = options?.poll?.maxWaitMs ?? transcodePollBudget({
    bytes: fileStat.size,
    durationSeconds: options?.meta?.durationSeconds,
  })

  const upload = await getUploadUrl(accessToken, { sha256, filename })
  await putToUploadUrl(upload.uploadUrl, filePath)

  return {
    uploadId: upload.uploadId,
    sha256,
    filePath,
    filename,
    sizeMb,
    budget,
  }
}

export async function pollPutAudioTranscode(
  accessToken: string,
  put: PutAudioForTranscodeResult,
  options?: {
    onTranscodePoll?: (info: { attempt: number; phase?: string; percent?: number }) => void
    meta?: TranscodeUploadMeta
    /** Serialize stall re-PUT with the caller's single PUT slot. */
    withPutSlot?: <T>(fn: () => Promise<T>) => Promise<T>
  },
): Promise<TranscodedAudioResult> {
  const pollOptions = {
    maxWaitMs: put.budget,
    onPoll: options?.onTranscodePoll,
    meta: options?.meta,
    sizeMb: put.sizeMb,
  }
  const withPutSlot = options?.withPutSlot ?? (async <T>(fn: () => Promise<T>) => fn())

  try {
    return await pollTranscoded(accessToken, put.uploadId, pollOptions)
  }
  catch (err) {
    if (!(err instanceof TranscodeGiveUpError) || err.reason === 'timeout') throw err

    const again = await getUploadUrl(accessToken, { sha256: put.sha256, filename: put.filename })
    const decision = transcodeRetryDecision({
      reason: err.reason,
      alreadyRetried: false,
      newUploadUrl: again.uploadUrl,
      oldUploadId: put.uploadId,
      newUploadId: again.uploadId,
    })
    if (decision.action === 'throw') throw err

    console.info(formatTranscodeLogLine({
      result: 'retry',
      jobId: options?.meta?.jobId,
      youtubeId: options?.meta?.youtubeId,
      partLabel: options?.meta?.partLabel,
      sizeMb: put.sizeMb,
      durationSec: options?.meta?.durationSeconds,
      uploadId: decision.uploadId,
      priorUploadId: put.uploadId,
      attempt: 1,
      elapsedMs: 0,
    }))

    if (decision.action === 'reput' && again.uploadUrl) {
      const retryUrl = again.uploadUrl
      await withPutSlot(() => putToUploadUrl(retryUrl, put.filePath))
      return pollTranscoded(accessToken, decision.uploadId, pollOptions)
    }

    return pollTranscoded(accessToken, decision.uploadId, {
      ...pollOptions,
      maxWaitMs: put.budget,
    })
  }
}

export async function uploadAudioFile(
  accessToken: string,
  filePath: string,
  filename: string,
  options?: {
    poll?: { maxWaitMs?: number }
    onTranscodePoll?: (info: { attempt: number; phase?: string; percent?: number }) => void
    meta?: TranscodeUploadMeta
  },
): Promise<TranscodedAudioResult> {
  const put = await putAudioForTranscode(accessToken, filePath, filename, {
    poll: options?.poll,
    meta: options?.meta,
  })
  return pollPutAudioTranscode(accessToken, put, {
    onTranscodePoll: options?.onTranscodePoll,
    meta: options?.meta,
  })
}
