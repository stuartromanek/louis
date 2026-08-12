const YOTOICONS_BASE = 'https://yotoicons.com'

export interface YotoiconsSearchItem {
  id: string
  title: string
  tags: string[]
  author: string
  imageUrl: string
  source: 'yotoicons'
}

/**
 * Parse yotoicons.com browse HTML for icon cards:
 * populate_icon_modal('id', 'category', 'tag1', 'tag2', 'author', 'downloads')
 */
export function parseYotoiconsHtml(html: string): YotoiconsSearchItem[] {
  const results: YotoiconsSearchItem[] = []
  const seen = new Set<string>()
  const re
    = /populate_icon_modal\(\s*'(\d+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'(\d+)'\s*\)/g

  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const id = match[1]!
    if (seen.has(id)) continue
    seen.add(id)
    const category = match[2] || ''
    const tag1 = match[3] || ''
    const tag2 = match[4] || ''
    const author = match[5] || ''
    const tags = [category, tag1, tag2, author].filter(Boolean)
    const title = [tag1, tag2].filter(Boolean).join(' · ') || category || `Icon ${id}`
    results.push({
      id,
      title,
      tags,
      author,
      imageUrl: `${YOTOICONS_BASE}/static/uploads/${id}.png`,
      source: 'yotoicons',
    })
  }

  return results
}

export async function searchYotoicons(query: string): Promise<YotoiconsSearchItem[]> {
  const tag = query.trim()
  if (!tag) return []

  const url = `${YOTOICONS_BASE}/icons?tag=${encodeURIComponent(tag)}&type=singles&sort=popular`
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'LouisYotoCards/1.0 (+https://github.com)',
    },
  })
  if (!res.ok) {
    throw new Error(`yotoicons.com returned ${res.status}`)
  }
  const html = await res.text()
  return parseYotoiconsHtml(html)
}
