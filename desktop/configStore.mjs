/**
 * Desktop credentials stored under Electron userData (not the git checkout .env).
 * @typedef {object} LouisDesktopConfig
 * @property {string} [yotoClientId]
 * @property {string} [yotoClientSecret]
 * @property {string} [youtubeApiKey]
 * @property {string} [ytdlpCookiesFile]
 */

export const DESKTOP_REDIRECT_URI = 'http://127.0.0.1:4010/api/yoto/auth/callback'
export const CONFIG_FILE_NAME = 'config.json'

/**
 * @param {unknown} raw
 * @returns {LouisDesktopConfig}
 */
export function normalizeDesktopConfig(raw) {
  const src = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {}
  return {
    yotoClientId: typeof src.yotoClientId === 'string' ? src.yotoClientId.trim() : '',
    yotoClientSecret: typeof src.yotoClientSecret === 'string' ? src.yotoClientSecret.trim() : '',
    youtubeApiKey: typeof src.youtubeApiKey === 'string' ? src.youtubeApiKey.trim() : '',
    ytdlpCookiesFile: typeof src.ytdlpCookiesFile === 'string' ? src.ytdlpCookiesFile.trim() : '',
  }
}

/**
 * @param {LouisDesktopConfig} config
 */
export function desktopConfigNeedsSetup(config) {
  return !config.yotoClientId || !config.youtubeApiKey
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
  env.NUXT_PUBLIC_DESKTOP = '1'
  env.NUXT_YOTO_REDIRECT_URI = DESKTOP_REDIRECT_URI

  if (config.yotoClientId) env.NUXT_YOTO_CLIENT_ID = config.yotoClientId
  if (config.yotoClientSecret) env.NUXT_YOTO_CLIENT_SECRET = config.yotoClientSecret
  if (config.youtubeApiKey) env.NUXT_YOUTUBE_API_KEY = config.youtubeApiKey
  if (config.ytdlpCookiesFile) env.NUXT_YTDLP_COOKIES_FILE = config.ytdlpCookiesFile
}
