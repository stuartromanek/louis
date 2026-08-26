export const YOUTUBE_SAFE_SEARCH_DEFAULT = 'moderate'

/** @typedef {'none' | 'moderate' | 'strict'} YoutubeSafeSearch */

export const YOUTUBE_SAFE_SEARCH_VALUES = /** @type {const} */ ([
  'none',
  'moderate',
  'strict',
])

export const YOUTUBE_SAFE_SEARCH_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'strict', label: 'Strict' },
]

/**
 * @param {unknown} raw
 * @returns {YoutubeSafeSearch}
 */
export function normalizeYoutubeSafeSearch(raw) {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === 'none' || value === 'moderate' || value === 'strict') {
    return value
  }
  return YOUTUBE_SAFE_SEARCH_DEFAULT
}
