const YOUTUBE_ID_PATTERN = /^[\w-]{11}$/

export function extractYoutubeIdFromUrl(trackUrl: string): string | null {
  const url = trackUrl.trim()
  if (!url) return null

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0]
      return YOUTUBE_ID_PATTERN.test(id) ? id : null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (parsed.pathname === '/watch') {
        const id = parsed.searchParams.get('v')
        return id && YOUTUBE_ID_PATTERN.test(id) ? id : null
      }

      const shortsMatch = parsed.pathname.match(/^\/shorts\/([\w-]{11})/)
      if (shortsMatch?.[1]) return shortsMatch[1]

      const embedMatch = parsed.pathname.match(/^\/embed\/([\w-]{11})/)
      if (embedMatch?.[1]) return embedMatch[1]
    }
  }
  catch {
    return null
  }

  return null
}
