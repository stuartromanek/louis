export interface YotoCoverUploadResponse {
  coverImage?: {
    mediaUrl?: string
    url?: string
    imageL?: string
  }
  mediaUrl?: string
  url?: string
}

export function mediaUrlFromCoverResponse(data: YotoCoverUploadResponse | null | undefined): string | null {
  if (!data || typeof data !== 'object') return null
  const candidates = [
    data.coverImage?.mediaUrl,
    data.coverImage?.url,
    data.coverImage?.imageL,
    data.mediaUrl,
    data.url,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}
