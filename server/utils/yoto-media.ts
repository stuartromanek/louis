import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { fetchYotoApi } from './yoto'
import type { TranscodedAudioResult } from '#shared/myo-editor/types'

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

const TRANSCODE_FAILURE_PHASES = new Set(['failed', 'error', 'cancelled', 'aborted'])

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
    maxAttempts?: number
    intervalMs?: number
    onPoll?: (info: { attempt: number; phase?: string; percent?: number }) => void
  },
): Promise<TranscodedAudioResult> {
  const maxAttempts = options?.maxAttempts ?? 120
  const intervalMs = options?.intervalMs ?? 1000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const data = await fetchYotoApi<TranscodePollResponse>(
      `/media/upload/${uploadId}/transcoded?loudnorm=false`,
      accessToken,
    )

    const transcode = data.transcode
    const phase = transcode?.progress?.phase
    const percent = transcode?.progress?.percent

    options?.onPoll?.({ attempt: attempt + 1, phase, percent })

    if (phase === 'complete' || transcode?.transcodedSha256) {
      if (!transcode?.transcodedSha256) {
        throw createError({
          statusCode: 502,
          statusMessage: 'Yoto transcoding completed without a track hash',
        })
      }
      return {
        transcodedSha256: transcode.transcodedSha256,
        transcodedInfo: transcode.transcodedInfo ?? {},
      }
    }

    if (phase && TRANSCODE_FAILURE_PHASES.has(phase)) {
      throw createError({
        statusCode: 502,
        statusMessage: `Yoto audio transcoding failed (${phase})`,
      })
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  throw createError({
    statusCode: 504,
    statusMessage: 'Yoto audio transcoding timed out',
  })
}

function guessContentType(filePath: string): string {
  if (filePath.endsWith('.m4a')) return 'audio/mp4'
  if (filePath.endsWith('.mp3')) return 'audio/mpeg'
  if (filePath.endsWith('.opus')) return 'audio/opus'
  if (filePath.endsWith('.webm')) return 'audio/webm'
  return 'application/octet-stream'
}

export async function uploadAudioFile(
  accessToken: string,
  filePath: string,
  filename: string,
  options?: {
    poll?: { maxAttempts?: number; intervalMs?: number }
    onTranscodePoll?: (info: { attempt: number; phase?: string; percent?: number }) => void
  },
): Promise<TranscodedAudioResult> {
  const fileStat = await stat(filePath)
  const sha256 = await hashFileSha256(filePath)
  const upload = await getUploadUrl(accessToken, { sha256, filename })

  if (upload.uploadUrl) {
    await putAudioFile(upload.uploadUrl, filePath, guessContentType(filePath))
  }

  const pollDefaults = fileStat.size > 50_000_000
    ? { maxAttempts: 180, intervalMs: 2000 }
    : undefined

  return pollTranscoded(accessToken, upload.uploadId, {
    ...(options?.poll ?? pollDefaults),
    onPoll: options?.onTranscodePoll,
  })
}
