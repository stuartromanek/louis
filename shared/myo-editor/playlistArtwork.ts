export const DICEBEAR_API_ORIGIN = 'https://api.dicebear.com'
export const DICEBEAR_API_VERSION = '10.x'
export const DICEBEAR_PNG_SIZE = 256
export const PLAYLIST_ARTWORK_HISTORY_CAP = 24

export const PLAYLIST_ARTWORK_STYLES = [
  'lorelei',
  'lorelei-neutral',
  'adventurer',
  'adventurer-neutral',
  'dylan',
  'fun-emoji',
  'croodles',
  'bottts',
  'personas',
  'blobs',
  'patchwork',
  'shape-grid',
  'shapes',
  'weave',
  'waves',
  'clay',
  'moods',
  'pixel-art',
  'pixelbot',
  'voxel-art',
  'voxel-bot',
] as const

export const PLAYLIST_ARTWORK_BACKGROUNDS = [
  '0068FF',
  'FFC800',
  'FF9400',
  '00BF3A',
  '05CF9C',
  'FA97FF',
  'FF8080',
] as const

export type PlaylistArtworkStyle = (typeof PLAYLIST_ARTWORK_STYLES)[number]
export type PlaylistArtworkBackground = (typeof PLAYLIST_ARTWORK_BACKGROUNDS)[number]
export type DicebearFormat = 'svg' | 'png'

export interface PlaylistArtworkSpec {
  style: PlaylistArtworkStyle
  seed: string
  backgroundColor: PlaylistArtworkBackground
}

export type PlaylistArtworkHistoryItem =
  | { kind: 'existing'; url: string }
  | { kind: 'generated'; spec: PlaylistArtworkSpec }
  | { kind: 'uploaded'; url: string; blob: Blob }

const STYLE_SET = new Set<string>(PLAYLIST_ARTWORK_STYLES)
const BACKGROUND_BY_HEX = new Map(
  PLAYLIST_ARTWORK_BACKGROUNDS.map(hex => [hex.toUpperCase(), hex] as const),
)

export function isPlaylistArtworkStyle(value: string): value is PlaylistArtworkStyle {
  return STYLE_SET.has(value)
}

const ARTWORK_STYLE_LABELS: Partial<Record<PlaylistArtworkStyle, string>> = {
  pixelbot: 'Pixel Bots',
  'voxel-bot': 'Voxel Bots',
}

export function artworkStyleLabel(style: PlaylistArtworkStyle): string {
  const override = ARTWORK_STYLE_LABELS[style]
  if (override) return override
  return style
    .split('-')
    .map(part => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

export const ARTWORK_STYLE_PREVIEW_SEED = 'louis-artwork-style'

export function artworkStylePreviewUrl(style: PlaylistArtworkStyle): string {
  const params = new URLSearchParams({ seed: ARTWORK_STYLE_PREVIEW_SEED })
  return `${DICEBEAR_API_ORIGIN}/${DICEBEAR_API_VERSION}/${style}/svg?${params.toString()}`
}

export function isPlaylistArtworkBackground(value: string): value is PlaylistArtworkBackground {
  return BACKGROUND_BY_HEX.has(value.replace(/^#/, '').toUpperCase())
}

function pick<T>(list: readonly T[], random: () => number): T {
  const index = Math.floor(random() * list.length)
  return list[Math.min(Math.max(index, 0), list.length - 1)]!
}

export interface RandomArtworkPool {
  styles?: readonly PlaylistArtworkStyle[]
  backgrounds?: readonly PlaylistArtworkBackground[]
}

/** All-on click isolates; after that, clicks toggle. Last remaining item stays on. */
export function nextArtworkPoolExclusion<T>(
  all: readonly T[],
  excluded: ReadonlySet<T>,
  item: T,
): Set<T> | null {
  if (excluded.has(item)) {
    const next = new Set(excluded)
    next.delete(item)
    return next
  }
  if (all.length - excluded.size <= 1) return null
  if (excluded.size === 0) {
    return new Set(all.filter(entry => entry !== item))
  }
  const next = new Set(excluded)
  next.add(item)
  return next
}

export function randomArtworkSeed(): string {
  return crypto.randomUUID()
}

export function randomArtworkSpec(
  random: () => number = Math.random,
  pool?: RandomArtworkPool,
): PlaylistArtworkSpec {
  const styles = pool?.styles?.length ? pool.styles : PLAYLIST_ARTWORK_STYLES
  const backgrounds = pool?.backgrounds?.length ? pool.backgrounds : PLAYLIST_ARTWORK_BACKGROUNDS
  return {
    style: pick(styles, random),
    seed: randomArtworkSeed(),
    backgroundColor: pick(backgrounds, random),
  }
}

export function parsePlaylistArtworkSpec(input: unknown): PlaylistArtworkSpec | null {
  if (!input || typeof input !== 'object') return null
  const rec = input as Record<string, unknown>
  const style = typeof rec.style === 'string' ? rec.style.trim() : ''
  const seed = typeof rec.seed === 'string' ? rec.seed.trim() : ''
  const rawBg = typeof rec.backgroundColor === 'string' ? rec.backgroundColor.trim() : ''
  if (!isPlaylistArtworkStyle(style)) return null
  if (!seed || seed.length > 128) return null
  const backgroundColor = BACKGROUND_BY_HEX.get(rawBg.replace(/^#/, '').toUpperCase())
  if (!backgroundColor) return null
  return { style, seed, backgroundColor }
}

export function artworkSpecsEqual(a: PlaylistArtworkSpec, b: PlaylistArtworkSpec): boolean {
  return a.style === b.style
    && a.seed === b.seed
    && a.backgroundColor === b.backgroundColor
}

export function dicebearUrl(spec: PlaylistArtworkSpec, format: DicebearFormat): string {
  const params = new URLSearchParams({
    seed: spec.seed,
    backgroundColor: spec.backgroundColor,
  })
  if (format === 'png') params.set('size', String(DICEBEAR_PNG_SIZE))
  return `${DICEBEAR_API_ORIGIN}/${DICEBEAR_API_VERSION}/${spec.style}/${format}?${params.toString()}`
}

export function artworkPreviewUrl(item: PlaylistArtworkHistoryItem): string {
  if (item.kind === 'generated') return dicebearUrl(item.spec, 'svg')
  return item.url
}

export function appendArtworkHistory(
  items: readonly PlaylistArtworkHistoryItem[],
  index: number,
  next: PlaylistArtworkHistoryItem,
  cap = PLAYLIST_ARTWORK_HISTORY_CAP,
): { items: PlaylistArtworkHistoryItem[]; index: number } {
  const cursor = Number.isFinite(index) ? Math.max(-1, Math.floor(index)) : -1
  const kept = cursor < 0 ? [] : items.slice(0, cursor + 1)
  const stacked = [...kept, next]
  const trimmed = stacked.length > cap ? stacked.slice(stacked.length - cap) : stacked
  return { items: trimmed, index: trimmed.length - 1 }
}
