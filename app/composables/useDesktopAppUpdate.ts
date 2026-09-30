import {
  APP_UPDATE_RELEASES_URL,
  normalizeAppUpdateSimulationMode,
  simulatedAppUpdateStatus,
  type AppUpdateStatus,
} from '#shared/appUpdate'

let bridgeUnsubscribe: (() => void) | null = null
let initialStatusPromise: Promise<void> | null = null

function isAppUpdateStatus(value: unknown): value is AppUpdateStatus {
  if (!value || typeof value !== 'object') return false
  const status = value as Partial<AppUpdateStatus>
  return typeof status.currentVersion === 'string'
    && (
      status.state === 'checking'
      || status.state === 'current'
      || status.state === 'available'
      || status.state === 'unsupported'
      || status.state === 'error'
    )
}

export function useDesktopAppUpdate() {
  const runtimeConfig = useRuntimeConfig()
  const route = useRoute()
  const { desktopPrefsDebug, hasElectronBridge } = useDesktopHost()
  const bridgeStatus = useState<AppUpdateStatus | null>('desktop-app-update-status', () => null)

  const simulationMode = computed(() => {
    if (hasElectronBridge.value || !desktopPrefsDebug.value) return null
    return normalizeAppUpdateSimulationMode(route.query.appUpdate)
  })

  const simulatedStatus = computed(() => {
    const mode = simulationMode.value
    if (!mode) return null
    return simulatedAppUpdateStatus(
      mode,
      String(runtimeConfig.public.appVersion || '0.0.0'),
    )
  })

  const status = computed(() => simulatedStatus.value ?? bridgeStatus.value)
  const showUpdateControls = computed(() => Boolean(
    simulatedStatus.value
    || (
      hasElectronBridge.value
      && bridgeStatus.value
      && bridgeStatus.value.state !== 'unsupported'
    ),
  ))
  const updateAvailable = computed(() =>
    showUpdateControls.value && status.value?.state === 'available',
  )

  function acceptStatus(next: unknown) {
    if (isAppUpdateStatus(next)) bridgeStatus.value = next
  }

  onMounted(() => {
    const bridge = window.louisDesktop
    if (!bridge || simulationMode.value) return

    if (!bridgeUnsubscribe) {
      bridgeUnsubscribe = bridge.onAppUpdateStatus(acceptStatus)
    }
    if (!initialStatusPromise) {
      initialStatusPromise = bridge.getAppUpdateStatus()
        .then(acceptStatus)
        .catch(() => {})
        .finally(() => {
          initialStatusPromise = null
        })
    }
  })

  async function openUpdate(target: 'installer' | 'release' = 'installer') {
    if (simulatedStatus.value) {
      window.open(APP_UPDATE_RELEASES_URL, '_blank', 'noopener,noreferrer')
      return
    }
    await window.louisDesktop?.openAppUpdate(target)
  }

  return {
    status,
    showUpdateControls,
    updateAvailable,
    openUpdate,
  }
}
