import { parseYoutubePlaylistUrl } from './youtubePlaylistImport.ts'

const YOUTUBE_ID_PATTERN = /^[\w-]{11}$/
const YOUTUBE_CHANNEL_ID = /^UC[\w-]{21,24}$/
const YOUTUBE_HANDLE = /^[\w.-]{3,30}$/
const YOUTUBE_USER_OR_CUSTOM = /^[\w.-]{1,100}$/

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
])

export type YoutubeSearchIntent =
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'video'; videoId: string }
  | {
    kind: 'channel'
    channelId?: string
    handle?: string
    username?: string
    custom?: string
  }
  | { kind: 'text'; q: string }

export interface YoutubeChannelSummary {
  id: string
  title: string
  videoCount?: number
}

function youtubeHost(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase()
}

function isYoutubeHost(hostname: string): boolean {
  return YOUTUBE_HOSTS.has(youtubeHost(hostname))
}

function firstPathSegment(pathname: string, index: number): string | undefined {
  return pathname.split('/').filter(Boolean)[index]
}

export function extractYoutubeIdFromUrl(trackUrl: string): string | null {
  const url = trackUrl.trim()
  if (!url) return null

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    const host = youtubeHost(parsed.hostname)

    if (host === 'youtu.be') {
      const id = firstPathSegment(parsed.pathname, 0)
      return id && YOUTUBE_ID_PATTERN.test(id) ? id : null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (parsed.pathname === '/watch' || parsed.pathname === '/watch/') {
        const id = parsed.searchParams.get('v')
        return id && YOUTUBE_ID_PATTERN.test(id) ? id : null
      }

      const shortsMatch = parsed.pathname.match(/^\/shorts\/([\w-]{11})(?:\/|$)/)
      if (shortsMatch?.[1]) return shortsMatch[1]

      const embedMatch = parsed.pathname.match(/^\/embed\/([\w-]{11})(?:\/|$)/)
      if (embedMatch?.[1]) return embedMatch[1]

      const liveMatch = parsed.pathname.match(/^\/live\/([\w-]{11})(?:\/|$)/)
      if (liveMatch?.[1]) return liveMatch[1]

      const vMatch = parsed.pathname.match(/^\/v\/([\w-]{11})(?:\/|$)/)
      if (vMatch?.[1]) return vMatch[1]
    }
  }
  catch {
    return null
  }

  return null
}

export function parseYoutubeChannelUrl(value: string): Extract<YoutubeSearchIntent, { kind: 'channel' }> | null {
  let url: URL
  try {
    url = new URL(value.trim())
  }
  catch {
    return null
  }

  if (url.protocol !== 'https:' || !isYoutubeHost(url.hostname)) return null
  if (youtubeHost(url.hostname) === 'youtu.be') return null

  const segments = url.pathname.split('/').filter(Boolean)
  const root = segments[0]
  if (!root) return null

  if (root === 'channel') {
    const channelId = segments[1]?.trim() ?? ''
    return YOUTUBE_CHANNEL_ID.test(channelId) ? { kind: 'channel', channelId } : null
  }

  if (root.startsWith('@')) {
    const handle = root.slice(1)
    return YOUTUBE_HANDLE.test(handle) ? { kind: 'channel', handle } : null
  }

  if (root === 'user') {
    const username = segments[1]?.trim() ?? ''
    return YOUTUBE_USER_OR_CUSTOM.test(username) ? { kind: 'channel', username } : null
  }

  if (root === 'c') {
    const custom = segments[1]?.trim() ?? ''
    return YOUTUBE_USER_OR_CUSTOM.test(custom) ? { kind: 'channel', custom } : null
  }

  return null
}

export function classifyYoutubeSearchInput(value: string): YoutubeSearchIntent {
  const q = value.trim()
  if (!q) return { kind: 'text', q: '' }

  const playlistId = parseYoutubePlaylistUrl(q)
  if (playlistId) return { kind: 'playlist', playlistId }

  const videoId = extractYoutubeIdFromUrl(q)
  if (videoId) return { kind: 'video', videoId }

  const channel = parseYoutubeChannelUrl(q)
  if (channel) return channel

  return { kind: 'text', q }
}
