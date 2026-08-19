import { BUNDLED_YOTO_CLIENT_ID } from '#shared/bundledYotoClientId.mjs'

export type LouisDesktopConfig = {
  yotoClientId: string
  yotoClientSecret: string
  youtubeApiKey: string
  ytdlpCookiesFile: string
  /** Louis public PKCE client ID for “Use default client” (not persisted). */
  bundledYotoClientId: string
}

type LouisDesktopBridge = {
  isDesktop: true
  getConfig: () => Promise<Partial<LouisDesktopConfig>>
  setConfig: (config: Partial<LouisDesktopConfig>) => Promise<Partial<LouisDesktopConfig>>
  pickCookiesFile: () => Promise<string | null>
  getRedirectUri: () => Promise<string>
  openExternal: (url: string) => Promise<void>
  focusMainWindow: () => Promise<boolean>
  restartNitro?: () => Promise<void>
}

declare global {
  interface Window {
    louisDesktop?: LouisDesktopBridge
  }
}

const DESKTOP_PREFS_DEBUG_KEY = 'louis:desktop-prefs-debug'
const DESKTOP_PREFS_MOCK_CONFIG_KEY = 'louis:desktop-prefs-mock-config'

function emptyConfig(): LouisDesktopConfig {
  return {
    yotoClientId: '',
    yotoClientSecret: '',
    youtubeApiKey: '',
    ytdlpCookiesFile: '',
    bundledYotoClientId: BUNDLED_YOTO_CLIENT_ID,
  }
}

function normalizeConfig(raw: Partial<LouisDesktopConfig> | null | undefined): LouisDesktopConfig {
  return {
    yotoClientId: String(raw?.yotoClientId || '').trim(),
    yotoClientSecret: String(raw?.yotoClientSecret || '').trim(),
    youtubeApiKey: String(raw?.youtubeApiKey || '').trim(),
    ytdlpCookiesFile: String(raw?.ytdlpCookiesFile || '').trim(),
    bundledYotoClientId:
      String(raw?.bundledYotoClientId || '').trim() || BUNDLED_YOTO_CLIENT_ID,
  }
}

/** Persist only user credentials in the prefs mock (not bundled metadata). */
function mockPersistShape(config: LouisDesktopConfig) {
  return {
    yotoClientId: config.yotoClientId,
    yotoClientSecret: config.yotoClientSecret,
    youtubeApiKey: config.youtubeApiKey,
    ytdlpCookiesFile: config.ytdlpCookiesFile,
  }
}

function readMockConfig(): LouisDesktopConfig {
  if (typeof sessionStorage === 'undefined') return emptyConfig()
  try {
    const raw = sessionStorage.getItem(DESKTOP_PREFS_MOCK_CONFIG_KEY)
    if (!raw) return emptyConfig()
    return normalizeConfig(JSON.parse(raw) as Partial<LouisDesktopConfig>)
  }
  catch {
    return emptyConfig()
  }
}

function writeMockConfig(next: LouisDesktopConfig): LouisDesktopConfig {
  const normalized = normalizeConfig(next)
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(DESKTOP_PREFS_MOCK_CONFIG_KEY, JSON.stringify(mockPersistShape(normalized)))
  }
  return normalized
}

function mergeMockConfig(
  current: LouisDesktopConfig,
  patch: Partial<LouisDesktopConfig>,
): LouisDesktopConfig {
  return normalizeConfig({ ...current, ...patch })
}

function queryEnablesDesktopPrefs(value: unknown): boolean | null {
  if (value === undefined || value === null) return null
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === '1' || raw === 'true') return true
  if (raw === '0' || raw === 'false') return false
  // bare `?desktopPrefs` → on
  if (raw === '' || raw === true) return true
  return null
}

/**
 * Electron host bridge (preload). Empty / no-op outside desktop.
 * Browser HMR: `?desktopPrefs=1` (persists in sessionStorage) shows Desktop API keys
 * and mocks get/set against sessionStorage — no Nitro restart.
 */
export function useDesktopHost() {
  const runtimeConfig = useRuntimeConfig()
  const route = useRoute()

  const desktopPrefsDebug = computed(() => {
    if (import.meta.server) return false
    const fromQuery = queryEnablesDesktopPrefs(route.query.desktopPrefs)
    if (fromQuery !== null) return fromQuery
    return sessionStorage.getItem(DESKTOP_PREFS_DEBUG_KEY) === '1'
  })

  if (import.meta.client) {
    watch(
      () => route.query.desktopPrefs,
      (value) => {
        const fromQuery = queryEnablesDesktopPrefs(value)
        if (fromQuery === true) sessionStorage.setItem(DESKTOP_PREFS_DEBUG_KEY, '1')
        else if (fromQuery === false) sessionStorage.removeItem(DESKTOP_PREFS_DEBUG_KEY)
      },
      { immediate: true },
    )
  }

  const isDesktop = computed(() => {
    if (import.meta.server) {
      return Boolean(runtimeConfig.public.desktop)
    }
    return Boolean(
      window.louisDesktop?.isDesktop
      || runtimeConfig.public.desktop
      || desktopPrefsDebug.value,
    )
  })

  const hasElectronBridge = computed(() => {
    return import.meta.client && Boolean(window.louisDesktop)
  })

  async function getConfig(): Promise<LouisDesktopConfig> {
    if (!import.meta.client) return emptyConfig()
    if (window.louisDesktop) {
      const raw = await window.louisDesktop.getConfig()
      return normalizeConfig(raw)
    }
    if (desktopPrefsDebug.value) return readMockConfig()
    return emptyConfig()
  }

  async function setConfig(config: Partial<LouisDesktopConfig>): Promise<LouisDesktopConfig> {
    if (!import.meta.client) {
      throw new Error('Desktop config is only available in the browser')
    }
    if (window.louisDesktop) {
      const raw = await window.louisDesktop.setConfig(config)
      return normalizeConfig({ ...raw, bundledYotoClientId: BUNDLED_YOTO_CLIENT_ID })
    }
    if (desktopPrefsDebug.value) {
      const current = readMockConfig()
      return writeMockConfig(mergeMockConfig(current, config))
    }
    throw new Error('Desktop config is only available in the Louis app')
  }

  async function pickCookiesFile(): Promise<string | null> {
    if (!import.meta.client) return null
    if (window.louisDesktop) return window.louisDesktop.pickCookiesFile()
    if (desktopPrefsDebug.value) {
      const next = window.prompt('Cookies.txt path (dev mock)', readMockConfig().ytdlpCookiesFile || '')
      return next === null ? null : next.trim()
    }
    return null
  }

  async function getRedirectUri(): Promise<string> {
    if (!import.meta.client || !window.louisDesktop) {
      return 'http://127.0.0.1:4010/api/yoto/auth/callback'
    }
    return window.louisDesktop.getRedirectUri()
  }

  return {
    isDesktop,
    /** True when `?desktopPrefs=1` mock is active (not real Electron). */
    desktopPrefsDebug,
    hasElectronBridge,
    getConfig,
    setConfig,
    pickCookiesFile,
    getRedirectUri,
  }
}
