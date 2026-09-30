export type AppUpdateState =
  | 'checking'
  | 'current'
  | 'available'
  | 'unsupported'
  | 'error'

export type AppUpdateStatus = {
  state: AppUpdateState
  currentVersion: string
  latestVersion?: string
  releaseUrl?: string
  installerName?: string
  installerUrl?: string
  message?: string
}

export type AppUpdateSimulationMode =
  | 'available'
  | 'current'
  | 'checking'
  | 'error'
  | 'unsupported'

export const APP_UPDATE_RELEASES_URL = 'https://github.com/stuartromanek/louis/releases'

export function normalizeAppUpdateSimulationMode(
  value: unknown,
): AppUpdateSimulationMode | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (
    raw === 'available'
    || raw === 'current'
    || raw === 'checking'
    || raw === 'error'
    || raw === 'unsupported'
  ) {
    return raw
  }
  return null
}

export function simulatedAppUpdateStatus(
  mode: AppUpdateSimulationMode,
  currentVersion: string,
): AppUpdateStatus {
  const current = currentVersion.trim() || '0.0.0'
  if (mode === 'available') {
    return {
      state: 'available',
      currentVersion: current,
      latestVersion: '99.0.0',
      releaseUrl: APP_UPDATE_RELEASES_URL,
      installerName: 'Louis-99.0.0-arm64.dmg',
      installerUrl: APP_UPDATE_RELEASES_URL,
    }
  }
  if (mode === 'current') {
    return {
      state: 'current',
      currentVersion: current,
      latestVersion: current,
      releaseUrl: APP_UPDATE_RELEASES_URL,
    }
  }
  if (mode === 'checking') {
    return { state: 'checking', currentVersion: current }
  }
  if (mode === 'error') {
    return {
      state: 'error',
      currentVersion: current,
      message: 'Simulated update check failure.',
    }
  }
  return {
    state: 'unsupported',
    currentVersion: current,
    latestVersion: '99.0.0',
    releaseUrl: APP_UPDATE_RELEASES_URL,
    message: 'Simulated unsupported platform.',
  }
}
