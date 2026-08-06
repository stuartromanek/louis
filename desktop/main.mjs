import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createInterface } from 'node:readline'

const require = createRequire(import.meta.url)
const { app, BrowserWindow, dialog } = require('electron')

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

  const audioWorkDir = path.join(app.getPath('userData'), 'audio')
  fs.mkdirSync(audioWorkDir, { recursive: true })

  const tools = resolveBundledTools()
  const pathParts = []
  if (tools.ffmpegPath || tools.ytdlpPath) {
    pathParts.push(tools.binDir)
  }
  if (process.env.PATH) pathParts.push(process.env.PATH)

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    HOST,
    PORT: String(PORT),
    NUXT_AUDIO_WORK_DIR: process.env.NUXT_AUDIO_WORK_DIR || audioWorkDir,
    PATH: pathParts.join(path.delimiter),
  }

  // Prefer bundled yt-dlp when present (overrides shell / Homebrew).
  if (tools.ytdlpPath) {
    env.NUXT_YTDLP_PATH = tools.ytdlpPath
  }

  console.log('[louis-desktop] tools', {
    binDir: tools.binDir,
    ytdlp: tools.ytdlpPath,
    ffmpeg: tools.ffmpegPath,
  })

  // Use Electron binary as Node — no separate Node runtime in the package.
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
    if (quitting) return
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
  await win.loadURL(BASE_URL)
}

async function boot() {
  loadDotEnv()
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
