/** Local Nitro origin loaded in the Electron window. */
export const LOUIS_DESKTOP_ORIGIN = 'http://127.0.0.1:4010'

export function parseHttpUrl(raw) {
  try {
    const url = new URL(String(raw || '').trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url
  }
  catch {
    return null
  }
}

export function isLouisAppUrl(raw, appOrigin = LOUIS_DESKTOP_ORIGIN) {
  const url = parseHttpUrl(raw)
  if (!url) return false
  try {
    return url.origin === new URL(appOrigin).origin
  }
  catch {
    return false
  }
}

/** file:// loading splash, about:blank, and the local Nitro app stay in Louis. */
export function isAllowedInAppNavigation(raw, appOrigin = LOUIS_DESKTOP_ORIGIN) {
  const value = String(raw || '')
  if (value.startsWith('file:')) return true
  if (value === 'about:blank') return true
  return isLouisAppUrl(value, appOrigin)
}

export function shouldOpenInSystemBrowser(raw, appOrigin = LOUIS_DESKTOP_ORIGIN) {
  return Boolean(parseHttpUrl(raw)) && !isLouisAppUrl(raw, appOrigin)
}

/**
 * Keep the BrowserWindow on Louis. http(s) that is not the local app opens
 * in the system browser (`target=_blank` and in-window navigations).
 */
export function attachExternalLinkHandlers(webContents, options) {
  const appOrigin = options.appOrigin
  const openExternal = options.openExternal

  webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenInSystemBrowser(url, appOrigin)) {
      void openExternal(url)
    }
    return { action: 'deny' }
  })

  const divert = (event, url) => {
    if (isAllowedInAppNavigation(url, appOrigin)) return
    event.preventDefault()
    if (shouldOpenInSystemBrowser(url, appOrigin)) {
      void openExternal(url)
    }
  }

  webContents.on('will-navigate', divert)
  webContents.on('will-redirect', divert)
}
