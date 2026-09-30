const RELEASE_API_URL = 'https://api.github.com/repos/stuartromanek/louis/releases/latest'
const RELEASES_URL = 'https://github.com/stuartromanek/louis/releases'
const REQUEST_TIMEOUT_MS = 10_000

function parsedVersion(raw) {
  const match = String(raw || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  }
}

export function isVersionNewer(candidate, current) {
  const next = parsedVersion(candidate)
  const installed = parsedVersion(current)
  if (!next || !installed || next.prerelease) return false
  for (const key of ['major', 'minor', 'patch']) {
    if (next[key] !== installed[key]) return next[key] > installed[key]
  }
  return false
}

export function isSafeLouisReleaseUrl(raw) {
  try {
    const url = new URL(String(raw || '').trim())
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && (
        url.pathname === '/stuartromanek/louis/releases'
        || url.pathname.startsWith('/stuartromanek/louis/releases/')
      )
  }
  catch {
    return false
  }
}

export function expectedInstallerName(version, platform, arch) {
  if (platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) {
    return `Louis-${version}-${arch}.dmg`
  }
  if (platform === 'win32' && arch === 'x64') {
    return `Louis-Setup-${version}.exe`
  }
  return null
}

function errorStatus(currentVersion, message) {
  return {
    state: 'error',
    currentVersion,
    message,
  }
}

export async function checkForAppUpdate(options) {
  const currentVersion = String(options.currentVersion || '').trim()
  const platform = String(options.platform || '').trim()
  const arch = String(options.arch || '').trim()
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS

  if (!parsedVersion(currentVersion)) {
    return errorStatus(currentVersion, 'The installed Louis version is invalid.')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetchImpl(RELEASE_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Louis/${currentVersion}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    })
  }
  catch (err) {
    const message = err instanceof Error && err.name === 'AbortError'
      ? 'The update check timed out.'
      : 'Could not reach GitHub to check for updates.'
    return errorStatus(currentVersion, message)
  }
  finally {
    clearTimeout(timer)
  }

  if (!response?.ok) {
    return errorStatus(
      currentVersion,
      `GitHub update check failed (${Number(response?.status) || 'unknown'}).`,
    )
  }

  let release
  try {
    release = await response.json()
  }
  catch {
    return errorStatus(currentVersion, 'GitHub returned an invalid update response.')
  }

  if (!release || typeof release !== 'object' || release.draft || release.prerelease) {
    return errorStatus(currentVersion, 'GitHub did not return a stable Louis release.')
  }

  const latestVersion = String(release.tag_name || '').trim().replace(/^v/, '')
  if (!parsedVersion(latestVersion)) {
    return errorStatus(currentVersion, 'The latest Louis release has an invalid version.')
  }

  const releaseUrl = String(release.html_url || '').trim()
  if (!isSafeLouisReleaseUrl(releaseUrl)) {
    return errorStatus(currentVersion, 'The latest Louis release URL is invalid.')
  }

  if (!isVersionNewer(latestVersion, currentVersion)) {
    return {
      state: 'current',
      currentVersion,
      latestVersion,
      releaseUrl,
    }
  }

  const installerName = expectedInstallerName(latestVersion, platform, arch)
  if (!installerName) {
    return {
      state: 'unsupported',
      currentVersion,
      latestVersion,
      releaseUrl,
      message: `Louis ${latestVersion} is available, but not for ${platform}-${arch}.`,
    }
  }

  const assets = Array.isArray(release.assets) ? release.assets : []
  const asset = assets.find(item => item?.name === installerName)
  const installerUrl = String(asset?.browser_download_url || '').trim()
  if (!isSafeLouisReleaseUrl(installerUrl)) {
    return {
      state: 'unsupported',
      currentVersion,
      latestVersion,
      releaseUrl,
      message: `Louis ${latestVersion} is available, but ${installerName} is missing.`,
    }
  }

  return {
    state: 'available',
    currentVersion,
    latestVersion,
    releaseUrl,
    installerName,
    installerUrl,
  }
}

export function createAppUpdateController(options) {
  const currentVersion = String(options.currentVersion || '').trim()
  let status = options.packaged
    ? { state: 'checking', currentVersion }
    : {
        state: 'unsupported',
        currentVersion,
        message: 'App update checks run only in packaged Louis builds.',
      }
  let checked = !options.packaged
  let inFlight = null

  function publish(next) {
    status = next
    options.onStatus?.(status)
    return status
  }

  async function check(checkOptions = {}) {
    if (!options.packaged) return status
    if (inFlight) return inFlight
    if (checked && !checkOptions.force) return status

    publish({ state: 'checking', currentVersion })
    const pending = checkForAppUpdate(options)
      .then((next) => {
        checked = true
        return publish(next)
      })
      .catch(() => {
        checked = true
        return publish(errorStatus(currentVersion, 'Could not check for Louis updates.'))
      })
      .finally(() => {
        if (inFlight === pending) inFlight = null
      })
    inFlight = pending
    return pending
  }

  return {
    getStatus: () => status,
    check,
  }
}

export function appUpdateOpenUrl(status, target = 'installer') {
  const candidate = target === 'release'
    ? status?.releaseUrl
    : status?.state === 'available'
      ? status.installerUrl
      : status?.releaseUrl
  return isSafeLouisReleaseUrl(candidate) ? candidate : RELEASES_URL
}

export const APP_UPDATE_RELEASES_URL = RELEASES_URL
