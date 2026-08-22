import type { PlaylistArtworkSpec } from '#shared/myo-editor/playlistArtwork'
import { dicebearUrl, randomArtworkSpec } from '#shared/myo-editor/playlistArtwork'
import { contentChaptersFromDetail } from '#shared/myo-editor/patchCardIcon'
import { buildProvenance } from '#shared/myo-editor/parseProvenance'
import { YOTO_API_BASE_URL } from './yoto-auth'
import { fetchYotoCardDetail } from './yoto-card-detail'
import { createOrUpdateContent } from './yoto-content'
import { mergeContentMetadata } from './yoto-metadata'
import { mediaUrlFromCoverResponse, type YotoCoverUploadResponse } from './yoto-cover-parse'

export type { YotoCoverUploadResponse } from './yoto-cover-parse'
export { mediaUrlFromCoverResponse } from './yoto-cover-parse'

export interface YotoCoverUploadResult {
  mediaUrl: string
}

export async function fetchDicebearPng(spec: PlaylistArtworkSpec): Promise<Buffer> {
  const url = dicebearUrl(spec, 'png')
  let bytes: ArrayBuffer
  try {
    bytes = await $fetch<ArrayBuffer>(url, {
      responseType: 'arrayBuffer',
      headers: {
        Accept: 'image/png',
        'User-Agent': 'LouisYotoCards/1.0 (+https://github.com)',
      },
    })
  }
  catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to download generated artwork',
    })
  }

  const buffer = Buffer.from(bytes)
  if (buffer.length < 32 || buffer.length > 1_000_000) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Generated artwork size out of range',
    })
  }
  return buffer
}

export async function uploadYotoCover(
  accessToken: string,
  file: Buffer,
  filename = 'cover.png',
): Promise<YotoCoverUploadResult> {
  const query = new URLSearchParams({
    autoconvert: 'true',
    coverType: 'default',
    filename,
  })
  const url = `${YOTO_API_BASE_URL}/media/coverImage/user/me/upload?${query.toString()}`

  let data: YotoCoverUploadResponse
  try {
    data = await $fetch<YotoCoverUploadResponse>(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'image/png',
      },
      body: file,
    })
  }
  catch (err: unknown) {
    const e = err as { statusCode?: number; statusMessage?: string; message?: string }
    if (e.statusCode === 401) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Yoto session expired. Please reconnect.',
      })
    }
    if (e.statusCode === 403) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Yoto API access denied. Check your app scopes.',
      })
    }
    throw createError({
      statusCode: e.statusCode ?? 502,
      statusMessage: e.statusMessage ?? e.message ?? 'Failed to upload cover image',
    })
  }

  const mediaUrl = mediaUrlFromCoverResponse(data)
  if (!mediaUrl) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Cover upload succeeded but no mediaUrl was returned',
    })
  }
  return { mediaUrl }
}

export async function applyPlaylistCoverUrl(
  accessToken: string,
  cardId: string,
  mediaUrl: string,
): Promise<void> {
  const detail = await fetchYotoCardDetail(cardId, accessToken)
  const chapters = contentChaptersFromDetail(detail)

  await createOrUpdateContent(accessToken, {
    cardId,
    title: detail.title,
    content: {
      version: detail.contentVersion ?? undefined,
      chapters,
    },
    metadata: mergeContentMetadata(detail.metadata, {
      title: detail.title,
      note: detail.metadataNote ?? detail.metadata?.note ?? buildProvenance([]).note,
      media: {
        duration: detail.metadata?.media?.duration ?? 0,
        fileSize: detail.metadata?.media?.fileSize ?? 0,
        readableFileSize: detail.metadata?.media?.readableFileSize ?? 0,
      },
      cover: { imageL: mediaUrl },
    }),
  })
}

export async function generateAndUploadPlaylistCover(
  accessToken: string,
  spec: PlaylistArtworkSpec,
): Promise<YotoCoverUploadResult> {
  const png = await fetchDicebearPng(spec)
  return uploadYotoCover(accessToken, png)
}

/** Best-effort cover for new playlists. Never throws. */
export async function tryGeneratePlaylistCover(accessToken: string): Promise<string | null> {
  try {
    const { mediaUrl } = await generateAndUploadPlaylistCover(accessToken, randomArtworkSpec())
    return mediaUrl
  }
  catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    console.warn('[playlist-cover] skipped auto artwork', e.statusMessage ?? e.message ?? err)
    return null
  }
}
