'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/**
 * @typedef {object} LouisDesktopConfig
 * @property {string} [yotoClientId]
 * @property {string} [yotoClientSecret]
 * @property {string} [youtubeApiKey]
 * @property {string} [youtubeSafeSearch]
 * @property {string} [ytdlpCookiesFile]
 */

contextBridge.exposeInMainWorld('louisDesktop', {
  isDesktop: true,
  runtimeInfo: {
    electronVersion: process.versions.electron || '',
    platform: process.platform,
    arch: process.arch,
  },
  getConfig: () => ipcRenderer.invoke('louis:get-config'),
  setConfig: (/** @type {LouisDesktopConfig} */ config) =>
    ipcRenderer.invoke('louis:set-config', config),
  pickCookiesFile: () => ipcRenderer.invoke('louis:pick-cookies-file'),
  getRedirectUri: () => ipcRenderer.invoke('louis:get-redirect-uri'),
  getAppUpdateStatus: () => ipcRenderer.invoke('louis:get-app-update-status'),
  openAppUpdate: (/** @type {'installer' | 'release'} */ target) =>
    ipcRenderer.invoke('louis:open-app-update', target),
  onAppUpdateStatus: (/** @type {(status: unknown) => void} */ callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('louis:app-update-status', listener)
    return () => ipcRenderer.removeListener('louis:app-update-status', listener)
  },
  openExternal: (/** @type {string} */ url) => ipcRenderer.invoke('louis:open-external', url),
  focusMainWindow: () => ipcRenderer.invoke('louis:focus-main-window'),
  restartNitro: () => ipcRenderer.invoke('louis:restart-nitro'),
})
