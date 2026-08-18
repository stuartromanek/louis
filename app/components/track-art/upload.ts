import { icon16x16FromMediaId } from '#shared/myo-editor/trackArt'
import type { TrackArtUploadResult } from './types'

export async function uploadTrackArtPng(
  blob: Blob,
  filename = 'icon.png',
  options?: { autoConvert?: boolean },
): Promise<TrackArtUploadResult> {
  const form = new FormData()
  form.append('file', blob, filename)
  form.append('filename', filename)
  form.append('autoConvert', options?.autoConvert === true ? 'true' : 'false')

  const result = await $fetch<TrackArtUploadResult>('/api/yoto/icons/upload', {
    method: 'POST',
    body: form,
  })

  return result
}

export async function uploadTrackArtFromUrl(
  url: string,
  filename = 'yotoicons.png',
): Promise<TrackArtUploadResult> {
  return await $fetch<TrackArtUploadResult>('/api/yoto/icons/from-url', {
    method: 'POST',
    body: { url, filename },
  })
}

export function toIcon16x16(mediaId: string): string {
  return icon16x16FromMediaId(mediaId)
}

export function trackArtFetchError(err: unknown, fallback: string): string {
  const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
  const text = e.data?.statusMessage ?? e.statusMessage ?? e.message ?? fallback
  return text.trim() || fallback
}
