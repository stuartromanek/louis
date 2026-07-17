const MAX_TITLE_LENGTH = 100

/** Common SEO / quality tags YouTube titles often append. */
const NOISE_PATTERNS = [
  /\s*\(official\s*(music\s*)?video\)/i,
  /\s*\(official\s*audio\)/i,
  /\s*\(official\s*lyric\s*video\)/i,
  /\s*\(lyrics?\)/i,
  /\s*\(visuali[sz]er\)/i,
  /\s*\(audio\)/i,
  /\s*\(live\)/i,
  /\s*\[official\s*(music\s*)?video\]/i,
  /\s*\[official\s*audio\]/i,
  /\s*\[official\s*lyric\s*video\]/i,
  /\s*\[lyrics?\]/i,
  /\s*\[visuali[sz]er\]/i,
  /\s*\[audio\]/i,
  /\s*\[HD\]/i,
  /\s*\[HQ\]/i,
  /\s*\[4K\]/i,
  /\s*\[CC\]/i,
  /\s*\|\s*topic$/i,
  /\s*-\s*topic$/i,
]

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g
const HTML_TAGS = /<[^>]*>/g

/** Clean YouTube SEO noise for MYO track titles (Player-friendly). */
export function sanitizeYoutubeTitle(raw: string): string {
  let title = raw.trim()

  title = title.replace(HTML_TAGS, '')
  title = title.replace(CONTROL_CHARS, '')

  for (const pattern of NOISE_PATTERNS) {
    title = title.replace(pattern, '')
  }

  title = title.replace(/\s{2,}/g, ' ').trim()

  if (title.length > MAX_TITLE_LENGTH) {
    title = title.slice(0, MAX_TITLE_LENGTH).trimEnd()
  }

  return title
}
