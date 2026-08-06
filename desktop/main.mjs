import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createInterface } from 'node:readline'
import {
  applyDesktopConfigToEnv,
  createConfigStore,
  DESKTOP_REDIRECT_URI,
  desktopConfigNeedsSetup,
} from './configStore.mjs'

const require = createRequire(import.meta.url)
const { app, BrowserWindow, dialog, ipcMain } = require('electron')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.setName('Louis')
// Force userData before ready so paths are not "Electron/…"
app.setPath('userData', path.join(app.getPath('appData'), 'Louis'))

const HOST = '127.0.0.1'
const PORT = 4010
const BASE_URL = `http://${HOST}:${PORT}`
const HEALTH_URL = `${BASE_URL}/api/health`

/** @type {import('node:child_process').ChildProcess | null} */
let nitroChild = null
/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null
let quitting = false
let nitroExitNotified = false
let restartingNitro = false

const configStore = createConfigStore(fs, path, app.getPath('userData'))

function resolveAppRoot() {
  // Packaged: .output is shipped via extraResources → resources/.output
  // Dev spike: repo root (parent of desktop/)
  if (app.isPackaged) return process.resourcesPath
  return path.resolve(__dirname, '..')
}

function resolveNitroEntry() {
  return path.join(resolveAppRoot(), '.output', 'server', 'index.mjs')
}

/** Platform folder under resources/bin (e.g. darwin-arm64). */
function platformBinId() {
  return `${process.platform}-${process.arch}`
}

/**
 * Bundled yt-dlp + ffmpeg dir.
 * Packaged: resources/bin/<platform>
 * Dev: desktop/resources/bin/<platform>
 */
function resolveBundledBinDir() {
  const id = platformBinId()
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', id)
  }
  return path.join(__dirname, 'resources', 'bin', id)
}

function resolveBundledTools() {
  const binDir = resolveBundledBinDir()
  const ytdlpName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const ytdlpPath = path.join(binDir, ytdlpName)
  const ffmpegPath = path.join(binDir, ffmpegName)
  return {
    binDir,
    ytdlpPath: fs.existsSync(ytdlpPath) ? ytdlpPath : null,
    ffmpegPath: fs.existsSync(ffmpegPath) ? ffmpegPath : null,
  }
}

function loadDotEnv() {
  if (app.isPackaged) return
  const envPath = path.join(resolveAppRoot(), '.env')
  if (!fs.existsSync(envPath)) return
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

async function waitForHealth(timeoutMs = 60_000) {
  const start = Date.now()
  let lastError = ''
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(HEALTH_URL)
      if (res.ok) return await res.json()
      lastError = `HTTP ${res.status}`
    }
    catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`Nitro health check timed out (${HEALTH_URL}): ${lastError}`)
}

function buildNitroEnv() {
  const audioWorkDir = path.join(app.getPath('userData'), 'audio')
  fs.mkdirSync(audioWorkDir, { recursive: true })

  const tools = resolveBundledTools()
  const pathParts = []
  if (tools.ffmpegPath || tools.ytdlpPath) {
    pathParts.push(tools.binDir)
  }
  if (process.env.PATH) pathParts.push(process.env.PATH)

  /** @type {Record<string, string | undefined>} */
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    HOST,
    PORT: String(PORT),
    NUXT_AUDIO_WORK_DIR: process.env.NUXT_AUDIO_WORK_DIR || audioWorkDir,
    PATH: pathParts.join(path.delimiter),
  }

  if (tools.ytdlpPath) {
    env.NUXT_YTDLP_PATH = tools.ytdlpPath
  }

  const desktopConfig = configStore.read()
  applyDesktopConfigToEnv(env, desktopConfig)

  console.log('[louis-desktop] tools', {
    binDir: tools.binDir,
    ytdlp: tools.ytdlpPath,
    ffmpeg: tools.ffmpegPath,
  })
  console.log('[louis-desktop] config', {
    path: configStore.configPath,
    hasYotoClientId: Boolean(desktopConfig.yotoClientId || env.NUXT_YOTO_CLIENT_ID),
    hasYoutubeApiKey: Boolean(desktopConfig.youtubeApiKey || env.NUXT_YOUTUBE_API_KEY),
    hasCookies: Boolean(desktopConfig.ytdlpCookiesFile || env.NUXT_YTDLP_COOKIES_FILE),
    redirectUri: DESKTOP_REDIRECT_URI,
    needsSetup: desktopConfigNeedsSetup({
      yotoClientId: desktopConfig.yotoClientId || env.NUXT_YOTO_CLIENT_ID || '',
      youtubeApiKey: desktopConfig.youtubeApiKey || env.NUXT_YOUTUBE_API_KEY || '',
      yotoClientSecret: '',
      ytdlpCookiesFile: '',
    }),
  })

  return env
}

function startNitro() {
  const nitroEntry = resolveNitroEntry()
  const appRoot = resolveAppRoot()

  if (!fs.existsSync(nitroEntry)) {
    throw new Error(
      app.isPackaged
        ? `Missing packaged Nitro server at ${nitroEntry}.`
        : `Missing ${nitroEntry}. Run \`npm run build\` before \`npm run desktop:spike\`.`,
    )
  }

  const env = buildNitroEnv()

  nitroChild = spawn(process.execPath, [nitroEntry], {
    cwd: appRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const tag = '[louis-nitro]'
  if (nitroChild.stdout) {
    createInterface({ input: nitroChild.stdout }).on('line', line => {
      console.log(`${tag} ${line}`)
    })
  }
  if (nitroChild.stderr) {
    createInterface({ input: nitroChild.stderr }).on('line', line => {
      console.error(`${tag} ${line}`)
    })
  }

  nitroChild.on('exit', (code, signal) => {
    nitroChild = null
    if (quitting || restartingNitro) return
    console.error(`${tag} exited unexpectedly (code=${code}, signal=${signal})`)
    if (!nitroExitNotified) {
      nitroExitNotified = true
      dialog.showErrorBox(
        'Louis stopped',
        'The local server exited unexpectedly. Louis will close.',
      )
    }
    app.quit()
  })
}

function stopNitro() {
  if (!nitroChild || nitroChild.killed) return
  const child = nitroChild
  nitroChild = null
  try {
    child.kill('SIGTERM')
  }
  catch {
    // ignore
  }
  setTimeout(() => {
    if (!child.killed) {
      try {
        child.kill('SIGKILL')
      }
      catch {
        // ignore
      }
    }
  }, 3000)
}

function stopNitroAsync() {
  return new Promise((resolve) => {
    if (!nitroChild || nitroChild.killed) {
      resolve()
      return
    }
    const child = nitroChild
    nitroChild = null
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      try {
        if (!child.killed) child.kill('SIGKILL')
      }
      catch {
        // ignore
      }
      done()
    }, 4000)
    child.once('exit', done)
    try {
      child.kill('SIGTERM')
    }
    catch {
      done()
    }
  })
}

async function restartNitroAndReload() {
  restartingNitro = true
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadFile(path.join(__dirname, 'loading.html'))
    }
    await stopNitroAsync()
    startNitro()
    await waitForHealth()
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(BASE_URL)
    }
  }
  finally {
    restartingNitro = false
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, 'icons', 'icon.png')
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 360,
    minHeight: 640,
    title: 'Louis',
    show: false,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  return mainWindow
}

function effectiveConfigForSetupCheck() {
  const stored = configStore.read()
  return {
    yotoClientId: stored.yotoClientId || process.env.NUXT_YOTO_CLIENT_ID || '',
    youtubeApiKey: stored.youtubeApiKey || process.env.NUXT_YOUTUBE_API_KEY || '',
    yotoClientSecret: stored.yotoClientSecret || '',
    ytdlpCookiesFile: stored.ytdlpCookiesFile || '',
  }
}

async function showLoadingThenApp() {
  const win = createWindow()
  const loadingPath = path.join(__dirname, 'loading.html')
  await win.loadFile(loadingPath)

  startNitro()
  const health = await waitForHealth()
  console.log('[louis-desktop] health ok', {
    packaged: app.isPackaged,
    appRoot: resolveAppRoot(),
    ytdlp: health?.checks?.ytdlp,
    ffmpeg: health?.checks?.ffmpeg,
    userData: app.getPath('userData'),
  })

  const needsSetup = desktopConfigNeedsSetup(effectiveConfigForSetupCheck())
  const url = needsSetup ? `${BASE_URL}/?desktopSetup=1` : BASE_URL
  await win.loadURL(url)
}

function registerIpc() {
  ipcMain.handle('louis:get-config', () => configStore.read())
  ipcMain.handle('louis:get-redirect-uri', () => DESKTOP_REDIRECT_URI)

  ipcMain.handle('louis:set-config', async (_event, next) => {
    const saved = configStore.write(next || {})
    await restartNitroAndReload()
    return saved
  })

  ipcMain.handle('louis:pick-cookies-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      title: 'Choose yt-dlp cookies.txt',
      properties: ['openFile'],
      filters: [
        { name: 'Cookies', extensions: ['txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })
}

async function boot() {
  loadDotEnv()
  registerIpc()
  await showLoadingThenApp()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}
else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    boot().catch((err) => {
      console.error('[louis-desktop] boot failed', err)
      dialog.showErrorBox(
        'Louis failed to start',
        err instanceof Error ? err.message : String(err),
      )
      stopNitro()
      app.exit(1)
    })
  })

  app.on('before-quit', () => {
    quitting = true
    stopNitro()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
