/**
 * Prefer LOUIS_*; fall back to legacy NUXT_* / NUXT_PUBLIC_*.
 * Mirror of shared/louis-env.mjs for Nitro (keeps server imports inside server/).
 */

export function pickEnvFrom(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined,
  ...keys: string[]
): string {
  const source = env || process.env
  for (const k of keys) {
    const v = source[k]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

export function pickEnv(...keys: string[]): string {
  return pickEnvFrom(process.env, ...keys)
}

export function pickLouisEnv(
  louis: string,
  nuxt: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  return pickEnvFrom(env, louis, nuxt)
}

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
] as const

function coerce(raw: string, kind: 'string' | 'boolean' | 'number') {
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

/** Copy LOUIS_* onto matching NUXT_* (LOUIS wins). Run before Nitro freezes config. */
export function aliasLouisEnvToNuxtProcessEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
) {
  for (const { louis, nuxt } of LOUIS_ENV_BINDINGS) {
    const raw = env[louis]
    if (raw == null || String(raw).trim() === '') continue
    env[nuxt] = String(raw).trim()
  }
}

function canAssign(obj: Record<string, any> | undefined, key: string) {
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
 */
export function applyLouisEnvToRuntimeConfig(config: Record<string, any>) {
  if (!config || typeof config !== 'object') return config

  const set = (path: string, value: string) => {
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

export function setLouisAndNuxtEnv(
  env: Record<string, string | undefined>,
  louisKey: string,
  nuxtKey: string,
  value: string,
) {
  if (!value) return
  env[louisKey] = value
  env[nuxtKey] = value
}
