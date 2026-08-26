import { pickLouisEnv, setLouisAndNuxtEnv } from '../shared/louis-env.mjs'
import { normalizeYoutubeSafeSearch } from '../shared/youtubeSafeSearch.mjs'

/**
 * Desktop credentials stored under Electron userData (not the git checkout .env).
 * @typedef {object} LouisDesktopConfig
 * @property {string} [yotoClientId]
 * @property {string} [yotoClientSecret]
 * @property {string} [youtubeApiKey]
 * @property {string} [youtubeSafeSearch]
 * @property {string} [ytdlpCookiesFile]
 */

export const DESKTOP_REDIRECT_URI = 'http://127.0.0.1:4010/api/yoto/auth/callback'
export const CONFIG_FILE_NAME = 'config.json'

/**
 * @param {unknown} raw
 * @returns {Required<LouisDesktopConfig>}
 */
export function normalizeDesktopConfig(raw) {
  const src = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {}
  return {
    yotoClientId: typeof src.yotoClientId === 'string' ? src.yotoClientId.trim() : '',
    yotoClientSecret: typeof src.yotoClientSecret === 'string' ? src.yotoClientSecret.trim() : '',
    youtubeApiKey: typeof src.youtubeApiKey === 'string' ? src.youtubeApiKey.trim() : '',
    youtubeSafeSearch: typeof src.youtubeSafeSearch === 'string' && src.youtubeSafeSearch.trim() !== ''
      ? normalizeYoutubeSafeSearch(src.youtubeSafeSearch)
      : '',
    ytdlpCookiesFile: typeof src.ytdlpCookiesFile === 'string' ? src.ytdlpCookiesFile.trim() : '',
  }
}

/**
 * Merge a partial patch onto current config without dropping omitted keys
 * (e.g. UI saves that do not send yotoClientSecret).
 * @param {LouisDesktopConfig} current
 * @param {Partial<LouisDesktopConfig> | null | undefined} patch
 */
export function mergeDesktopConfig(current, patch) {
  return normalizeDesktopConfig({ ...normalizeDesktopConfig(current), ...(patch || {}) })
}

/**
 * Stored config.json values, with process env filling blank fields (spike / legacy).
 * @param {LouisDesktopConfig} stored
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function effectiveDesktopConfig(stored, env = process.env) {
  const base = normalizeDesktopConfig(stored)
  return normalizeDesktopConfig({
    yotoClientId: base.yotoClientId || pickLouisEnv('LOUIS_YOTO_CLIENT_ID', 'NUXT_YOTO_CLIENT_ID', env),
    yotoClientSecret: base.yotoClientSecret || pickLouisEnv('LOUIS_YOTO_CLIENT_SECRET', 'NUXT_YOTO_CLIENT_SECRET', env),
    youtubeApiKey: base.youtubeApiKey || pickLouisEnv('LOUIS_YOUTUBE_API_KEY', 'NUXT_YOUTUBE_API_KEY', env),
    youtubeSafeSearch: normalizeYoutubeSafeSearch(
      base.youtubeSafeSearch || pickLouisEnv('LOUIS_YOUTUBE_SAFE_SEARCH', 'NUXT_YOUTUBE_SAFE_SEARCH', env),
    ),
    ytdlpCookiesFile: base.ytdlpCookiesFile || pickLouisEnv('LOUIS_YTDLP_COOKIES_FILE', 'NUXT_YTDLP_COOKIES_FILE', env),
  })
}

/**
 * @param {LouisDesktopConfig} config
 */
export function desktopConfigNeedsSetup(config) {
  const normalized = normalizeDesktopConfig(config)
  return !normalized.yotoClientId
}

/**
 * @param {import('node:fs')} fs
 * @param {import('node:path')} path
 * @param {string} userDataPath
 */
export function createConfigStore(fs, path, userDataPath) {
  const configPath = path.join(userDataPath, CONFIG_FILE_NAME)

  function read() {
    try {
      if (!fs.existsSync(configPath)) return normalizeDesktopConfig({})
      const text = fs.readFileSync(configPath, 'utf8')
      return normalizeDesktopConfig(JSON.parse(text))
    }
    catch (err) {
      console.error('[louis-desktop] failed to read config.json', err)
      return normalizeDesktopConfig({})
    }
  }

  /**
   * @param {LouisDesktopConfig} next
   */
  function write(next) {
    const normalized = normalizeDesktopConfig(next)
    fs.mkdirSync(userDataPath, { recursive: true })
    fs.writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
    return normalized
  }

  return { configPath, read, write }
}

/**
 * Apply userData into Nitro spawn env.
 * Non-empty userData fields override process.env (including spike .env).
 * Redirect URI is always forced for the desktop host.
 * @param {Record<string, string | undefined>} env
 * @param {LouisDesktopConfig} config
 */
export function applyDesktopConfigToEnv(env, config) {
  // Dual-write LOUIS_* + legacy NUXT_* for one release (belt-and-suspenders).
  setLouisAndNuxtEnv(env, 'LOUIS_PUBLIC_DESKTOP', 'NUXT_PUBLIC_DESKTOP', '1')
  setLouisAndNuxtEnv(env, 'LOUIS_YOTO_REDIRECT_URI', 'NUXT_YOTO_REDIRECT_URI', DESKTOP_REDIRECT_URI)

  if (config.yotoClientId) {
    setLouisAndNuxtEnv(env, 'LOUIS_YOTO_CLIENT_ID', 'NUXT_YOTO_CLIENT_ID', config.yotoClientId)
  }
  if (config.yotoClientSecret) {
    setLouisAndNuxtEnv(env, 'LOUIS_YOTO_CLIENT_SECRET', 'NUXT_YOTO_CLIENT_SECRET', config.yotoClientSecret)
  }
  if (config.youtubeApiKey) {
    setLouisAndNuxtEnv(env, 'LOUIS_YOUTUBE_API_KEY', 'NUXT_YOUTUBE_API_KEY', config.youtubeApiKey)
  }
  setLouisAndNuxtEnv(
    env,
    'LOUIS_YOUTUBE_SAFE_SEARCH',
    'NUXT_YOUTUBE_SAFE_SEARCH',
    normalizeYoutubeSafeSearch(config.youtubeSafeSearch),
  )
  if (config.ytdlpCookiesFile) {
    setLouisAndNuxtEnv(env, 'LOUIS_YTDLP_COOKIES_FILE', 'NUXT_YTDLP_COOKIES_FILE', config.ytdlpCookiesFile)
  }
}
