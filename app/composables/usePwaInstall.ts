import { computed, onMounted, ref, shallowRef } from 'vue'

export type PwaInstallPlatform = 'ios' | 'android' | 'other'
export type PwaInstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>
}

const deferredPrompt = shallowRef<BeforeInstallPromptEvent | null>(null)
const standalone = ref(false)
let listenersBound = false

function readStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  if (nav.standalone === true) return true
  if (document.referrer.startsWith('android-app://')) return true
  return window.matchMedia(
    '(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)',
  ).matches
}

export function detectPwaInstallPlatform(): PwaInstallPlatform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  // iPadOS 13+ reports as Macintosh.
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

/** Bind once from the client plugin so `beforeinstallprompt` is not missed. */
export function bindPwaInstallListeners() {
  if (listenersBound || typeof window === 'undefined') return
  listenersBound = true
  standalone.value = readStandalone()

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt.value = event as BeforeInstallPromptEvent
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null
    standalone.value = true
  })

  const displayMq = window.matchMedia(
    '(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)',
  )
  displayMq.addEventListener('change', () => {
    standalone.value = readStandalone()
  })
}

export function usePwaInstall() {
  const { isDesktop } = useDesktopHost()
  const ready = ref(false)

  if (import.meta.client) {
    bindPwaInstallListeners()
  }

  onMounted(() => {
    standalone.value = readStandalone()
    ready.value = true
  })

  const platform = computed<PwaInstallPlatform>(() => {
    if (!import.meta.client) return 'other'
    return detectPwaInstallPlatform()
  })

  const canPrompt = computed(() => Boolean(deferredPrompt.value))

  const showInstallItem = computed(() => {
    if (!ready.value) return false
    if (isDesktop.value) return false
    if (standalone.value) return false
    return true
  })

  async function promptInstall(): Promise<PwaInstallOutcome> {
    const event = deferredPrompt.value
    if (!event) return 'unavailable'
    deferredPrompt.value = null
    try {
      await event.prompt()
      const { outcome } = await event.userChoice
      if (outcome === 'accepted') standalone.value = true
      return outcome
    }
    catch {
      return 'unavailable'
    }
  }

  return {
    showInstallItem,
    canPrompt,
    platform,
    promptInstall,
  }
}
