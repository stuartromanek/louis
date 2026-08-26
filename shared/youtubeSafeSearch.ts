export type YoutubeSafeSearch = 'none' | 'moderate' | 'strict'

export const YOUTUBE_SAFE_SEARCH_DEFAULT: YoutubeSafeSearch = 'moderate'

export const YOUTUBE_SAFE_SEARCH_VALUES: readonly YoutubeSafeSearch[] = [
  'none',
  'moderate',
  'strict',
] as const

export const YOUTUBE_SAFE_SEARCH_OPTIONS: ReadonlyArray<{
  value: YoutubeSafeSearch
  label: string
}> = [
  { value: 'none', label: 'None' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'strict', label: 'Strict' },
]

export function normalizeYoutubeSafeSearch(raw: unknown): YoutubeSafeSearch {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === 'none' || value === 'moderate' || value === 'strict') {
    return value
  }
  return YOUTUBE_SAFE_SEARCH_DEFAULT
}
