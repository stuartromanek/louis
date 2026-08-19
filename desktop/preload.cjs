'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/**
 * @typedef {object} LouisDesktopConfig
 * @property {string} [yotoClientId]
 * @property {string} [yotoClientSecret]
 * @property {string} [youtubeApiKey]
 * @property {string} [ytdlpCookiesFile]
 */

contextBridge.exposeInMainWorld('louisDesktop', {
  isDesktop: true,
  getConfig: () => ipcRenderer.invoke('louis:get-config'),
  setConfig: (/** @type {LouisDesktopConfig} */ config) =>
    ipcRenderer.invoke('louis:set-config', config),
  pickCookiesFile: () => ipcRenderer.invoke('louis:pick-cookies-file'),
  getRedirectUri: () => ipcRenderer.invoke('louis:get-redirect-uri'),
  openExternal: (/** @type {string} */ url) => ipcRenderer.invoke('louis:open-external', url),
  focusMainWindow: () => ipcRenderer.invoke('louis:focus-main-window'),
  restartNitro: () => ipcRenderer.invoke('louis:restart-nitro'),
})
