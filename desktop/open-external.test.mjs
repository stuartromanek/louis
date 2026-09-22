import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  attachExternalLinkHandlers,
  isAllowedInAppNavigation,
  isLouisAppUrl,
  shouldOpenInSystemBrowser,
} from './open-external.mjs'

const ORIGIN = 'http://127.0.0.1:4010'

describe('isLouisAppUrl', () => {
  it('allows the local Nitro origin including OAuth callback', () => {
    assert.equal(isLouisAppUrl(`${ORIGIN}/`, ORIGIN), true)
    assert.equal(isLouisAppUrl(`${ORIGIN}/?desktopSetup=1`, ORIGIN), true)
    assert.equal(isLouisAppUrl(`${ORIGIN}/api/yoto/auth/callback?code=1`, ORIGIN), true)
  })

  it('rejects other http(s) hosts', () => {
    assert.equal(isLouisAppUrl('https://docs.google.com/forms/d/e/abc', ORIGIN), false)
    assert.equal(isLouisAppUrl('https://console.cloud.google.com/', ORIGIN), false)
    assert.equal(isLouisAppUrl('https://my.yotoplay.com/', ORIGIN), false)
    assert.equal(isLouisAppUrl('http://localhost:4010/', ORIGIN), false)
  })
})

describe('isAllowedInAppNavigation / shouldOpenInSystemBrowser', () => {
  it('keeps file:// loading and about:blank in-app', () => {
    assert.equal(isAllowedInAppNavigation('file:///tmp/loading.html', ORIGIN), true)
    assert.equal(isAllowedInAppNavigation('about:blank', ORIGIN), true)
    assert.equal(shouldOpenInSystemBrowser('file:///tmp/loading.html', ORIGIN), false)
  })

  it('opens Report Issues / Settings / How To links in the system browser', () => {
    assert.equal(shouldOpenInSystemBrowser('https://docs.google.com/forms/d/e/abc', ORIGIN), true)
    assert.equal(shouldOpenInSystemBrowser('https://whatsmybrowser.org/', ORIGIN), true)
    assert.equal(isAllowedInAppNavigation('https://docs.google.com/forms/d/e/abc', ORIGIN), false)
  })
})

describe('attachExternalLinkHandlers', () => {
  it('denies window.open and sends https to openExternal', () => {
    const opened = []
    const listeners = {}
    let windowOpenHandler
    const webContents = {
      setWindowOpenHandler(fn) {
        windowOpenHandler = fn
      },
      on(event, fn) {
        listeners[event] = fn
      },
    }

    attachExternalLinkHandlers(webContents, {
      appOrigin: ORIGIN,
      openExternal: async (url) => {
        opened.push(url)
      },
    })

    const result = windowOpenHandler({ url: 'https://docs.google.com/forms/d/e/abc' })
    assert.deepEqual(result, { action: 'deny' })
    assert.deepEqual(opened, ['https://docs.google.com/forms/d/e/abc'])

    const event = { prevented: false, preventDefault() { this.prevented = true } }
    listeners['will-navigate'](event, 'https://console.cloud.google.com/')
    assert.equal(event.prevented, true)
    assert.equal(opened.at(-1), 'https://console.cloud.google.com/')

    const local = { prevented: false, preventDefault() { this.prevented = true } }
    listeners['will-redirect'](local, `${ORIGIN}/api/yoto/auth/callback`)
    assert.equal(local.prevented, false)
  })
})
