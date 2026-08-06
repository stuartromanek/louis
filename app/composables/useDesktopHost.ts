export type LouisDesktopConfig = {
  yotoClientId: string
  yotoClientSecret: string
  youtubeApiKey: string
  ytdlpCookiesFile: string
}

type LouisDesktopBridge = {
  isDesktop: true
  getConfig: () => Promise<LouisDesktopConfig>
  setConfig: (config: Partial<LouisDesktopConfig>) => Promise<LouisDesktopConfig>
  pickCookiesFile: () => Promise<string | null>
  getRedirectUri: () => Promise<string>
}

declare global {
  interface Window {
    louisDesktop?: LouisDesktopBridge
  }
}

function emptyConfig(): LouisDesktopConfig {
  return {
    yotoClientId: '',
    yotoClientSecret: '',
    youtubeApiKey: '',
    ytdlpCookiesFile: '',
  }
}

/**
 * Electron host bridge (preload). Empty / no-op outside desktop.
 */
export function useDesktopHost() {
  const runtimeConfig = useRuntimeConfig()
  const isDesktop = computed(() => {
    if (import.meta.server) return Boolean(runtimeConfig.public.desktop)
    return Boolean(window.louisDesktop?.isDesktop || runtimeConfig.public.desktop)
  })

  async function getConfig(): Promise<LouisDesktopConfig> {
    if (!import.meta.client || !window.louisDesktop) return emptyConfig()
    const raw = await window.louisDesktop.getConfig()
    return {
      yotoClientId: String(raw?.yotoClientId || ''),
      yotoClientSecret: String(raw?.yotoClientSecret || ''),
      youtubeApiKey: String(raw?.youtubeApiKey || ''),
      ytdlpCookiesFile: String(raw?.ytdlpCookiesFile || ''),
    }
  }

  async function setConfig(config: Partial<LouisDesktopConfig>): Promise<LouisDesktopConfig> {
    if (!import.meta.client || !window.louisDesktop) {
      throw new Error('Desktop config is only available in the Louis app')
    }
    const raw = await window.louisDesktop.setConfig(config)
    return {
      yotoClientId: String(raw?.yotoClientId || ''),
      yotoClientSecret: String(raw?.yotoClientSecret || ''),
      youtubeApiKey: String(raw?.youtubeApiKey || ''),
      ytdlpCookiesFile: String(raw?.ytdlpCookiesFile || ''),
    }
  }

  async function pickCookiesFile(): Promise<string | null> {
    if (!import.meta.client || !window.louisDesktop) return null
    return window.louisDesktop.pickCookiesFile()
  }

  async function getRedirectUri(): Promise<string> {
    if (!import.meta.client || !window.louisDesktop) {
      return 'http://127.0.0.1:4010/api/yoto/auth/callback'
    }
    return window.louisDesktop.getRedirectUri()
  }

  return {
    isDesktop,
    getConfig,
    setConfig,
    pickCookiesFile,
    getRedirectUri,
  }
}
