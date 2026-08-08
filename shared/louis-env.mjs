/**
 * Prefer LOUIS_*; fall back to legacy NUXT_* / NUXT_PUBLIC_*.
 * Shared by Nitro boot plugin, nuxt.config defaults, and Electron host.
 */

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {...string} keys
 * @returns {string}
 */
export function pickEnvFrom(env, ...keys) {
  const source = env || process.env
  for (const k of keys) {
    const v = source[k]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

/**
 * @param {...string} keys
 * @returns {string}
 */
export function pickEnv(...keys) {
  return pickEnvFrom(process.env, ...keys)
}

/**
 * @param {string} louis
 * @param {string} nuxt
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function pickLouisEnv(louis, nuxt, env = process.env) {
  return pickEnvFrom(env, louis, nuxt)
}

/** @typedef {{ louis: string, nuxt: string, path: string }} LouisEnvBinding */

/** @type {LouisEnvBinding[]} */
export const LOUIS_ENV_BINDINGS = [
  { path: 'youtubeApiKey', louis: 'LOUIS_YOUTUBE_API_KEY', nuxt: 'NUXT_YOUTUBE_API_KEY' },
  { path: 'yotoClientId', louis: 'LOUIS_YOTO_CLIENT_ID', nuxt: 'NUXT_YOTO_CLIENT_ID' },
  { path: 'yotoClientSecret', louis: 'LOUIS_YOTO_CLIENT_SECRET', nuxt: 'NUXT_YOTO_CLIENT_SECRET' },
  { path: 'yotoRedirectUri', louis: 'LOUIS_YOTO_REDIRECT_URI', nuxt: 'NUXT_YOTO_REDIRECT_URI' },
  { path: 'ytdlpPath', louis: 'LOUIS_YTDLP_PATH', nuxt: 'NUXT_YTDLP_PATH' },
  { path: 'ytdlpCookiesFile', louis: 'LOUIS_YTDLP_COOKIES_FILE', nuxt: 'NUXT_YTDLP_COOKIES_FILE' },
  { path: 'audioWorkDir', louis: 'LOUIS_AUDIO_WORK_DIR', nuxt: 'NUXT_AUDIO_WORK_DIR' },
  { path: 'audioJobMaxAgeMs', louis: 'LOUIS_AUDIO_JOB_MAX_AGE_MS', nuxt: 'NUXT_AUDIO_JOB_MAX_AGE_MS' },
  { path: 'audioCacheMaxAgeMs', louis: 'LOUIS_AUDIO_CACHE_MAX_AGE_MS', nuxt: 'NUXT_AUDIO_CACHE_MAX_AGE_MS' },
  { path: 'audioCacheMaxBytes', louis: 'LOUIS_AUDIO_CACHE_MAX_BYTES', nuxt: 'NUXT_AUDIO_CACHE_MAX_BYTES' },
  { path: 'enableDebugRoutes', louis: 'LOUIS_ENABLE_DEBUG_ROUTES', nuxt: 'NUXT_ENABLE_DEBUG_ROUTES' },
  { path: 'public.desktop', louis: 'LOUIS_PUBLIC_DESKTOP', nuxt: 'NUXT_PUBLIC_DESKTOP' },
]

/**
 * @param {string} raw
 * @param {'string' | 'boolean' | 'number'} kind
 */
function coerce(raw, kind) {
  if (kind === 'boolean') {
    const v = raw.toLowerCase()
    return v === '1' || v === 'true' || v === 'yes' || v === 'on'
  }
  if (kind === 'number') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : undefined
  }
  return raw
}

/**
 * Copy LOUIS_* onto matching NUXT_* in process.env (LOUIS wins when set).
 * Must run before Nitro freezes runtimeConfig (see nuxt.config esbuild banner).
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function aliasLouisEnvToNuxtProcessEnv(env = process.env) {
  for (const { louis, nuxt } of LOUIS_ENV_BINDINGS) {
    const raw = env[louis]
    if (raw == null || String(raw).trim() === '') continue
    env[nuxt] = String(raw).trim()
  }
}

/**
 * @param {Record<string, any>} obj
 * @param {string} key
 */
function canAssign(obj, key) {
  if (!obj || typeof obj !== 'object') return false
  if (Object.isFrozen(obj)) return false
  const desc = Object.getOwnPropertyDescriptor(obj, key)
  if (!desc) return true
  return Boolean(desc.writable || desc.set)
}

/**
 * Apply LOUIS_* (then NUXT_*) onto a Nuxt/Nitro runtimeConfig object.
 * Production Nitro deep-freezes shared runtimeConfig after applying NUXT_* —
 * assignments are skipped when frozen (rely on aliasLouisEnvToNuxtProcessEnv).
 * @param {Record<string, any>} config
 */
export function applyLouisEnvToRuntimeConfig(config) {
  if (!config || typeof config !== 'object') return config

  const set = (path, value) => {
    if (value === '' || value === undefined) return
    if (path === 'public.desktop') {
      if (!config.public) {
        if (!canAssign(config, 'public')) return
        config.public = {}
      }
      if (!canAssign(config.public, 'desktop')) return
      config.public.desktop = coerce(String(value), 'boolean')
      return
    }
    if (!canAssign(config, path)) return
    if (path === 'enableDebugRoutes') {
      config.enableDebugRoutes = coerce(String(value), 'boolean')
      return
    }
    if (
      path === 'audioJobMaxAgeMs'
      || path === 'audioCacheMaxAgeMs'
      || path === 'audioCacheMaxBytes'
    ) {
      const n = coerce(String(value), 'number')
      if (n !== undefined) config[path] = n
      return
    }
    config[path] = value
  }

  for (const { path, louis, nuxt } of LOUIS_ENV_BINDINGS) {
    const raw = pickLouisEnv(louis, nuxt)
    if (raw) set(path, raw)
  }

  return config
}

/**
 * Build runtimeConfig field defaults for nuxt.config (dev + build bake-in).
 */
export function louisRuntimeConfigDefaults() {
  const truthy = (raw) => {
    if (!raw) return false
    const v = raw.toLowerCase()
    return v === '1' || v === 'true' || v === 'yes' || v === 'on'
  }

  return {
    youtubeApiKey: pickLouisEnv('LOUIS_YOUTUBE_API_KEY', 'NUXT_YOUTUBE_API_KEY'),
    yotoClientId: pickLouisEnv('LOUIS_YOTO_CLIENT_ID', 'NUXT_YOTO_CLIENT_ID'),
    yotoClientSecret: pickLouisEnv('LOUIS_YOTO_CLIENT_SECRET', 'NUXT_YOTO_CLIENT_SECRET'),
    yotoRedirectUri:
      pickLouisEnv('LOUIS_YOTO_REDIRECT_URI', 'NUXT_YOTO_REDIRECT_URI')
      || 'http://localhost:4000/api/yoto/auth/callback',
    ytdlpPath: pickLouisEnv('LOUIS_YTDLP_PATH', 'NUXT_YTDLP_PATH') || 'yt-dlp',
    ytdlpCookiesFile: pickLouisEnv('LOUIS_YTDLP_COOKIES_FILE', 'NUXT_YTDLP_COOKIES_FILE'),
    audioWorkDir: pickLouisEnv('LOUIS_AUDIO_WORK_DIR', 'NUXT_AUDIO_WORK_DIR'),
    audioJobMaxAgeMs: Number(
      pickLouisEnv('LOUIS_AUDIO_JOB_MAX_AGE_MS', 'NUXT_AUDIO_JOB_MAX_AGE_MS') || 3_600_000,
    ),
    audioCacheMaxAgeMs: Number(
      pickLouisEnv('LOUIS_AUDIO_CACHE_MAX_AGE_MS', 'NUXT_AUDIO_CACHE_MAX_AGE_MS') || 1_209_600_000,
    ),
    audioCacheMaxBytes: Number(
      pickLouisEnv('LOUIS_AUDIO_CACHE_MAX_BYTES', 'NUXT_AUDIO_CACHE_MAX_BYTES') || 5_368_709_120,
    ),
    enableDebugRoutes: truthy(pickLouisEnv('LOUIS_ENABLE_DEBUG_ROUTES', 'NUXT_ENABLE_DEBUG_ROUTES')),
    publicDesktop: truthy(pickLouisEnv('LOUIS_PUBLIC_DESKTOP', 'NUXT_PUBLIC_DESKTOP')),
  }
}

/**
 * Set both LOUIS_* and legacy NUXT_* on a spawn env object (Electron dual-write).
 * @param {Record<string, string | undefined>} env
 * @param {string} louisKey
 * @param {string} nuxtKey
 * @param {string} value
 */
export function setLouisAndNuxtEnv(env, louisKey, nuxtKey, value) {
  if (!value) return
  env[louisKey] = value
  env[nuxtKey] = value
}
