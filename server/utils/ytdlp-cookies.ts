import { access, constants } from 'node:fs/promises'
import path from 'node:path'
import type { H3Event } from 'h3'

export interface YtdlpCookiesStatus {
  /** True when NUXT_YTDLP_COOKIES_FILE is non-empty (path not returned). */
  configured: boolean
  /** True when the configured file exists and is readable. */
  readable: boolean
}

let missingFileLogged = false

function runtimeConfig(event?: H3Event) {
  return event ? useRuntimeConfig(event) : useRuntimeConfig()
}

/**
 * yt-dlp `--cookies` args from NUXT_YTDLP_COOKIES_FILE when set and readable.
 * Returns [] (and does not throw) when unset or unreadable.
 */
export async function resolveYtdlpCookiesArgs(event?: H3Event): Promise<string[]> {
  const configured = String(runtimeConfig(event).ytdlpCookiesFile || '').trim()
  if (!configured) return []

  const absolutePath = path.resolve(configured)
  try {
    await access(absolutePath, constants.R_OK)
    return ['--cookies', absolutePath]
  }
  catch {
    if (!missingFileLogged) {
      missingFileLogged = true
      console.warn(
        '[ytdlp-cookies] NUXT_YTDLP_COOKIES_FILE is set but not readable; downloads will run without --cookies',
      )
    }
    return []
  }
}

/** Booleans only — never returns path or file contents. */
export async function getYtdlpCookiesStatus(event?: H3Event): Promise<YtdlpCookiesStatus> {
  const configuredPath = String(runtimeConfig(event).ytdlpCookiesFile || '').trim()
  const configured = configuredPath.length > 0
  if (!configured) {
    return { configured: false, readable: false }
  }

  try {
    await access(path.resolve(configuredPath), constants.R_OK)
    return { configured: true, readable: true }
  }
  catch {
    return { configured: true, readable: false }
  }
}
