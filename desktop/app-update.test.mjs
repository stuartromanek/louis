import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  APP_UPDATE_RELEASES_URL,
  appUpdateOpenUrl,
  checkForAppUpdate,
  createAppUpdateController,
  expectedInstallerName,
  isSafeLouisReleaseUrl,
  isVersionNewer,
} from './app-update.mjs'
import {
  normalizeAppUpdateSimulationMode,
  simulatedAppUpdateStatus,
} from '../shared/appUpdate.ts'

function release(overrides = {}) {
  return {
    tag_name: 'v1.3.0',
    html_url: 'https://github.com/stuartromanek/louis/releases/tag/v1.3.0',
    draft: false,
    prerelease: false,
    assets: [
      {
        name: 'Louis-1.3.0-arm64.dmg',
        browser_download_url:
          'https://github.com/stuartromanek/louis/releases/download/v1.3.0/Louis-1.3.0-arm64.dmg',
      },
      {
        name: 'Louis-1.3.0-x64.dmg',
        browser_download_url:
          'https://github.com/stuartromanek/louis/releases/download/v1.3.0/Louis-1.3.0-x64.dmg',
      },
      {
        name: 'Louis-Setup-1.3.0.exe',
        browser_download_url:
          'https://github.com/stuartromanek/louis/releases/download/v1.3.0/Louis-Setup-1.3.0.exe',
      },
    ],
    ...overrides,
  }
}

function response(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => body,
  }
}

function checkOptions(overrides = {}) {
  return {
    currentVersion: '1.2.5',
    platform: 'darwin',
    arch: 'arm64',
    fetchImpl: async () => response(release()),
    timeoutMs: 100,
    ...overrides,
  }
}

describe('app update version and asset policy', () => {
  it('compares stable numeric versions', () => {
    assert.equal(isVersionNewer('1.3.0', '1.2.5'), true)
    assert.equal(isVersionNewer('2.0.0', '1.99.99'), true)
    assert.equal(isVersionNewer('1.2.5', '1.2.5'), false)
    assert.equal(isVersionNewer('1.2.4', '1.2.5'), false)
    assert.equal(isVersionNewer('1.3.0-beta.1', '1.2.5'), false)
  })

  it('selects the shipped installer name per platform and architecture', () => {
    assert.equal(expectedInstallerName('1.3.0', 'darwin', 'arm64'), 'Louis-1.3.0-arm64.dmg')
    assert.equal(expectedInstallerName('1.3.0', 'darwin', 'x64'), 'Louis-1.3.0-x64.dmg')
    assert.equal(expectedInstallerName('1.3.0', 'win32', 'x64'), 'Louis-Setup-1.3.0.exe')
    assert.equal(expectedInstallerName('1.3.0', 'linux', 'x64'), null)
    assert.equal(expectedInstallerName('1.3.0', 'win32', 'arm64'), null)
  })

  it('accepts only HTTPS release URLs for the Louis repository', () => {
    assert.equal(isSafeLouisReleaseUrl(APP_UPDATE_RELEASES_URL), true)
    assert.equal(
      isSafeLouisReleaseUrl('https://github.com/stuartromanek/louis/releases/download/v1.3.0/a.dmg'),
      true,
    )
    assert.equal(isSafeLouisReleaseUrl('http://github.com/stuartromanek/louis/releases'), false)
    assert.equal(isSafeLouisReleaseUrl('https://github.com/other/repo/releases'), false)
    assert.equal(isSafeLouisReleaseUrl('https://example.com/file.dmg'), false)
  })
})

describe('checkForAppUpdate', () => {
  it('returns the matching macOS update', async () => {
    const result = await checkForAppUpdate(checkOptions())

    assert.equal(result.state, 'available')
    assert.equal(result.latestVersion, '1.3.0')
    assert.equal(result.installerName, 'Louis-1.3.0-arm64.dmg')
  })

  it('returns current when the installed release is not older', async () => {
    const result = await checkForAppUpdate(checkOptions({ currentVersion: '1.3.0' }))

    assert.equal(result.state, 'current')
    assert.equal(result.latestVersion, '1.3.0')
  })

  it('does not offer drafts, prereleases, malformed releases, or unsafe URLs', async () => {
    const draft = await checkForAppUpdate(checkOptions({
      fetchImpl: async () => response(release({ draft: true })),
    }))
    const prerelease = await checkForAppUpdate(checkOptions({
      fetchImpl: async () => response(release({ prerelease: true })),
    }))
    const malformed = await checkForAppUpdate(checkOptions({
      fetchImpl: async () => response(release({ tag_name: 'tomato' })),
    }))
    const unsafe = await checkForAppUpdate(checkOptions({
      fetchImpl: async () => response(release({ html_url: 'https://example.com/release' })),
    }))

    assert.equal(draft.state, 'error')
    assert.equal(prerelease.state, 'error')
    assert.equal(malformed.state, 'error')
    assert.equal(unsafe.state, 'error')
  })

  it('reports an unsupported update when the matching installer is absent', async () => {
    const result = await checkForAppUpdate(checkOptions({
      fetchImpl: async () => response(release({ assets: [] })),
    }))

    assert.equal(result.state, 'unsupported')
    assert.match(result.message, /missing/)
  })

  it('maps request, response, and JSON failures to safe errors', async () => {
    const requestFailure = await checkForAppUpdate(checkOptions({
      fetchImpl: async () => {
        throw new Error('secret network detail')
      },
    }))
    const responseFailure = await checkForAppUpdate(checkOptions({
      fetchImpl: async () => response(null, { ok: false, status: 503 }),
    }))
    const jsonFailure = await checkForAppUpdate(checkOptions({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('bad json')
        },
      }),
    }))

    assert.equal(requestFailure.state, 'error')
    assert.equal(requestFailure.message, 'Could not reach GitHub to check for updates.')
    assert.match(responseFailure.message, /503/)
    assert.match(jsonFailure.message, /invalid update response/)
  })
})

describe('createAppUpdateController', () => {
  it('shares one in-flight request and caches its result', async () => {
    let resolveFetch
    let calls = 0
    const fetchImpl = () => {
      calls++
      return new Promise((resolve) => {
        resolveFetch = resolve
      })
    }
    const controller = createAppUpdateController({
      ...checkOptions({ fetchImpl }),
      packaged: true,
    })

    const first = controller.check()
    const second = controller.check({ force: true })
    assert.equal(calls, 1)

    resolveFetch(response(release()))
    assert.equal((await first).state, 'available')
    assert.equal((await second).state, 'available')
    assert.equal((await controller.check()).state, 'available')
    assert.equal(calls, 1)
  })

  it('does not check GitHub outside a packaged app', async () => {
    let calls = 0
    const controller = createAppUpdateController({
      ...checkOptions({ fetchImpl: async () => { calls++; return response(release()) } }),
      packaged: false,
    })

    assert.equal((await controller.check({ force: true })).state, 'unsupported')
    assert.equal(calls, 0)
  })

  it('opens only validated status URLs', () => {
    assert.equal(
      appUpdateOpenUrl({
        state: 'available',
        installerUrl:
          'https://github.com/stuartromanek/louis/releases/download/v1.3.0/Louis-1.3.0-arm64.dmg',
      }),
      'https://github.com/stuartromanek/louis/releases/download/v1.3.0/Louis-1.3.0-arm64.dmg',
    )
    assert.equal(
      appUpdateOpenUrl({ state: 'available', installerUrl: 'https://example.com/evil' }),
      APP_UPDATE_RELEASES_URL,
    )
  })
})

describe('app update simulation', () => {
  it('accepts only explicit simulation modes', () => {
    assert.equal(normalizeAppUpdateSimulationMode('available'), 'available')
    assert.equal(normalizeAppUpdateSimulationMode(['error']), 'error')
    assert.equal(normalizeAppUpdateSimulationMode('surprise'), null)
  })

  it('builds deterministic states without installer downloads', () => {
    const available = simulatedAppUpdateStatus('available', '1.2.5')
    const error = simulatedAppUpdateStatus('error', '1.2.5')

    assert.equal(available.latestVersion, '99.0.0')
    assert.equal(available.installerUrl, APP_UPDATE_RELEASES_URL)
    assert.equal(error.message, 'Simulated update check failure.')
  })
})
