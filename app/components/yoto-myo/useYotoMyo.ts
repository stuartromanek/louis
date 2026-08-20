import type { YotoAuthStatus, YotoContentMineResponse, YotoMyoCard, YotoMyoStatus, YotoOAuthInterrupt } from './types'

function extractErrorMessage(err: unknown): string {
  const fetchErr = err as {
    statusCode?: number
    statusMessage?: string
    data?: { statusMessage?: string }
    message?: string
  }

  return fetchErr.data?.statusMessage
    ?? fetchErr.statusMessage
    ?? fetchErr.message
    ?? 'Failed to load Yoto content'
}

const EXTERNAL_POLL_MS = 1500
const EXTERNAL_POLL_TIMEOUT_MS = 5 * 60 * 1000

export function useYotoMyo() {
  const cards = ref<YotoMyoCard[]>([])
  const status = ref<YotoMyoStatus>('loading')
  const cardsLoading = ref(false)
  const errorMessage = ref('')
  const configured = ref(false)
  const connected = ref(false)
  const hasWriteScope = ref(false)
  const connectingExternal = ref(false)
  const oauthInterrupt = ref<YotoOAuthInterrupt | null>(null)

  const router = useRouter()
  const route = useRoute()

  function consumeOAuthInterrupt() {
    const flag = route.query.yoto
    if (flag !== 'expired' && flag !== 'denied' && flag !== 'failed') return
    oauthInterrupt.value = flag
    if (!import.meta.client) return
    const nextQuery = { ...route.query }
    delete nextQuery.yoto
    void router.replace({ query: nextQuery })
  }

  consumeOAuthInterrupt()
  watch(() => route.query.yoto, consumeOAuthInterrupt)

  async function fetchCards() {
    cardsLoading.value = true
    errorMessage.value = ''

    try {
      const data = await $fetch<YotoContentMineResponse>('/api/yoto/content/mine')
      cards.value = data.cards
      status.value = 'idle'
    }
    catch (err: unknown) {
      const fetchErr = err as { statusCode?: number }
      errorMessage.value = extractErrorMessage(err)

      if (fetchErr.statusCode === 401) {
        connected.value = false
        status.value = 'disconnected'
        cards.value = []
        return
      }

      status.value = 'error'
      cards.value = []
    }
    finally {
      cardsLoading.value = false
    }
  }

  async function checkStatus(options?: { quiet?: boolean }) {
    const quiet = Boolean(options?.quiet)
    if (!quiet) {
      status.value = 'loading'
      errorMessage.value = ''
    }

    try {
      const data = await $fetch<YotoAuthStatus>('/api/yoto/auth/status')
      configured.value = data.configured
      connected.value = data.connected
      hasWriteScope.value = data.hasWriteScope ?? false

      if (!data.configured) {
        status.value = 'unconfigured'
        cardsLoading.value = false
        if (!quiet) {
          errorMessage.value = 'Yoto API not configured. Set LOUIS_YOTO_CLIENT_ID in .env'
        }
        return
      }

      if (!data.connected) {
        // Keep gate stable while polling the system-browser Connect flow.
        if (!quiet || status.value === 'loading') {
          status.value = 'disconnected'
        }
        cardsLoading.value = false
        if (!quiet) cards.value = []
        return
      }

      status.value = 'idle'
      await fetchCards()
    }
    catch (err: unknown) {
      if (quiet) return
      errorMessage.value = extractErrorMessage(err)
      status.value = 'error'
      cardsLoading.value = false
    }
  }

  async function connectExternalBrowser() {
    const bridge = window.louisDesktop
    if (!bridge?.openExternal) {
      window.location.href = '/api/yoto/auth/login'
      return
    }

    connectingExternal.value = true
    errorMessage.value = ''
    // Stay on disconnected so the auth gate does not remount each poll.
    status.value = 'disconnected'
    try {
      const { authorizeUrl } = await $fetch<{ authorizeUrl: string }>('/api/yoto/auth/login', {
        query: { external: '1' },
      })
      await bridge.openExternal(authorizeUrl)

      const started = Date.now()
      while (Date.now() - started < EXTERNAL_POLL_TIMEOUT_MS) {
        await new Promise(resolve => setTimeout(resolve, EXTERNAL_POLL_MS))
        await checkStatus({ quiet: true })
        if (connected.value) {
          await bridge.focusMainWindow?.()
          await router.replace({ query: { ...route.query, yoto: 'connected' } })
          return
        }
      }
      errorMessage.value = 'Sign-in timed out. Try Connect again, or check Settings if your client ID is wrong.'
      status.value = 'disconnected'
    }
    catch (err: unknown) {
      errorMessage.value = extractErrorMessage(err)
      status.value = 'error'
    }
    finally {
      connectingExternal.value = false
    }
  }

  function connect() {
    oauthInterrupt.value = null
    if (import.meta.client && window.louisDesktop?.openExternal) {
      void connectExternalBrowser()
      return
    }
    window.location.href = '/api/yoto/auth/login'
  }

  async function disconnect() {
    try {
      await $fetch('/api/yoto/auth/logout', { method: 'POST' })
    }
    catch {
      // Best-effort logout
    }

    connected.value = false
    hasWriteScope.value = false
    cards.value = []
    cardsLoading.value = false
    status.value = 'disconnected'
    errorMessage.value = ''
  }

  async function refresh() {
    if (connected.value) {
      await fetchCards()
      return
    }
    await checkStatus()
  }

  onMounted(() => {
    checkStatus()
  })

  return {
    cards,
    status,
    cardsLoading,
    errorMessage,
    configured,
    connected,
    hasWriteScope,
    connectingExternal,
    oauthInterrupt,
    connect,
    disconnect,
    refresh,
    fetchCards,
  }
}
