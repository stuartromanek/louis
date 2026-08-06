import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createInterface } from 'node:readline'

const require = createRequire(import.meta.url)
const { app, BrowserWindow } = require('electron')

app.setName('Louis')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const nitroEntry = path.join(repoRoot, '.output', 'server', 'index.mjs')

const HOST = '127.0.0.1'
const PORT = 4010
const BASE_URL = `http://${HOST}:${PORT}`
const HEALTH_URL = `${BASE_URL}/api/health`

/** @type {import('node:child_process').ChildProcess | null} */
let nitroChild = null
/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null
let quitting = false

function loadDotEnv() {
  const envPath = path.join(repoRoot, '.env')
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
  if (!fs.existsSync(nitroEntry)) {
    throw new Error(
      `Missing ${nitroEntry}. Run \`npm run build\` before \`npm run desktop:spike\`.`,
    )
  }

  const audioWorkDir = path.join(app.getPath('userData'), 'audio')
  fs.mkdirSync(audioWorkDir, { recursive: true })

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    HOST,
    PORT: String(PORT),
    NUXT_AUDIO_WORK_DIR: process.env.NUXT_AUDIO_WORK_DIR || audioWorkDir,
  }

  const nodeBin = process.env.npm_node_execpath || 'node'
  nitroChild = spawn(nodeBin, [nitroEntry], {
    cwd: repoRoot,
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
    if (!quitting) {
      console.error(`${tag} exited unexpectedly (code=${code}, signal=${signal})`)
      app.quit()
    }
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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 360,
    minHeight: 640,
    title: 'Louis',
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

  return mainWindow.loadURL(BASE_URL)
}

async function boot() {
  loadDotEnv()
  startNitro()
  const health = await waitForHealth()
  console.log('[louis-desktop] health ok', {
    ytdlp: health?.checks?.ytdlp?.available,
    ffmpeg: health?.checks?.ffmpeg?.available,
  })
  await createWindow()
}

app.whenReady().then(() => {
  boot().catch((err) => {
    console.error('[louis-desktop] boot failed', err)
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
