#!/usr/bin/env node
/**
 * Download platform yt-dlp + ffmpeg into desktop/resources/bin/<platform>/.
 *
 * Prefer yt-dlp *onedir* zips (launcher + `_internal/`). The one-file builds cold-start
 * in ~9s which breaks health checks with a 5s version timeout.
 *
 * Usage:
 *   node desktop/scripts/fetch-binaries.mjs           # host platform only
 *   node desktop/scripts/fetch-binaries.mjs --all      # all supported platforms
 *   node desktop/scripts/fetch-binaries.mjs darwin-arm64 linux-x64
 */
import { createWriteStream } from 'node:fs'
import { mkdir, chmod, rm, readdir, copyFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Readable } from 'node:stream'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BIN_ROOT = path.join(ROOT, 'resources', 'bin')

/** Pin yt-dlp release tag for reproducible desktop bundles. */
const YTDLP_TAG = '2026.07.04'

/**
 * @typedef {'darwin-arm64' | 'darwin-x64' | 'linux-x64' | 'linux-arm64' | 'win32-x64'} PlatformId
 * @typedef {{ kind: 'onedir-zip', url: string, launcher: string, outName: string } | { kind: 'file', url: string, outName: string }} YtdlpSpec
 * @typedef {{ kind: 'zip-file' | 'zip-bin' | 'tar-xz-bin', url: string, member?: string }} FfmpegSpec
 */

/** @type {Record<PlatformId, { ytdlp: YtdlpSpec, ffmpeg: FfmpegSpec }>} */
const PLATFORMS = {
  'darwin-arm64': {
    ytdlp: {
      kind: 'onedir-zip',
      url: `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_TAG}/yt-dlp_macos.zip`,
      launcher: 'yt-dlp_macos',
      outName: 'yt-dlp',
    },
    ffmpeg: {
      kind: 'zip-file',
      url: 'https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip',
    },
  },
  'darwin-x64': {
    ytdlp: {
      kind: 'onedir-zip',
      url: `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_TAG}/yt-dlp_macos.zip`,
      launcher: 'yt-dlp_macos',
      outName: 'yt-dlp',
    },
    ffmpeg: {
      kind: 'zip-file',
      url: 'https://ffmpeg.martin-riedl.de/redirect/latest/macos/amd64/release/ffmpeg.zip',
    },
  },
  'linux-x64': {
    ytdlp: {
      kind: 'onedir-zip',
      url: `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_TAG}/yt-dlp_linux.zip`,
      launcher: 'yt-dlp_linux',
      outName: 'yt-dlp',
    },
    ffmpeg: {
      kind: 'tar-xz-bin',
      url: 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
      member: 'ffmpeg',
    },
  },
  'linux-arm64': {
    ytdlp: {
      kind: 'onedir-zip',
      url: `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_TAG}/yt-dlp_linux_aarch64.zip`,
      launcher: 'yt-dlp_linux_aarch64',
      outName: 'yt-dlp',
    },
    ffmpeg: {
      kind: 'tar-xz-bin',
      url: 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz',
      member: 'ffmpeg',
    },
  },
  'win32-x64': {
    ytdlp: {
      kind: 'onedir-zip',
      url: `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_TAG}/yt-dlp_win.zip`,
      launcher: 'yt-dlp.exe',
      outName: 'yt-dlp.exe',
    },
    ffmpeg: {
      kind: 'zip-bin',
      url: 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
      member: 'ffmpeg.exe',
    },
  },
}

function hostPlatformId() {
  const id = `${process.platform}-${process.arch}`
  if (id in PLATFORMS) return /** @type {PlatformId} */ (id)
  throw new Error(`Unsupported host platform: ${id}`)
}

function parseArgs(argv) {
  const args = argv.slice(2)
  if (args.includes('--all')) return /** @type {PlatformId[]} */ (Object.keys(PLATFORMS))
  const ids = args.filter(a => !a.startsWith('-'))
  if (ids.length === 0) return [hostPlatformId()]
  for (const id of ids) {
    if (!(id in PLATFORMS)) {
      throw new Error(`Unknown platform "${id}". Supported: ${Object.keys(PLATFORMS).join(', ')}`)
    }
  }
  return /** @type {PlatformId[]} */ (ids)
}

async function downloadToFile(url, dest) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed ${res.status} ${url}`)
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

async function ensureEmptyDir(dir) {
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
}

async function findFileRecursive(dir, basename) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = await findFileRecursive(full, basename)
      if (found) return found
    }
    else if (entry.name === basename) {
      return full
    }
  }
  return null
}

async function extractZip(zipPath, outDir) {
  await mkdir(outDir, { recursive: true })
  await execFileAsync('unzip', ['-o', '-q', zipPath, '-d', outDir])
}

async function extractTarXz(archivePath, outDir) {
  await mkdir(outDir, { recursive: true })
  await execFileAsync('tar', ['-xJf', archivePath, '-C', outDir])
}

async function fetchYtdlp(platform, outDir, spec) {
  console.log(`[fetch] ${platform} yt-dlp ← ${spec.url}`)
  if (spec.kind === 'file') {
    const dest = path.join(outDir, spec.outName)
    await downloadToFile(spec.url, dest)
    if (!spec.outName.endsWith('.exe')) await chmod(dest, 0o755)
    return
  }

  const tmp = path.join(outDir, '.tmp-ytdlp')
  await ensureEmptyDir(tmp)
  const zipPath = path.join(tmp, 'yt-dlp.zip')
  await downloadToFile(spec.url, zipPath)
  const extractDir = path.join(tmp, 'extract')
  await extractZip(zipPath, extractDir)

  // Zip may nest under a single top folder or dump launcher + _internal at root.
  const launcherPath = await findFileRecursive(extractDir, spec.launcher)
  if (!launcherPath) {
    throw new Error(`Launcher ${spec.launcher} not found in ${spec.url}`)
  }
  const launchDir = path.dirname(launcherPath)
  const internalSrc = path.join(launchDir, '_internal')

  await copyFile(launcherPath, path.join(outDir, spec.outName))
  if (!spec.outName.endsWith('.exe')) {
    await chmod(path.join(outDir, spec.outName), 0o755)
  }

  try {
    await access(internalSrc)
    // Move _internal beside the launcher (onedir layout).
    await execFileAsync('cp', ['-R', internalSrc, path.join(outDir, '_internal')])
  }
  catch {
    throw new Error(`Missing _internal/ next to ${spec.launcher} in onedir zip`)
  }

  await rm(tmp, { recursive: true, force: true })
}

async function fetchFfmpeg(platform, outDir, ffmpeg) {
  const tmp = path.join(outDir, '.tmp-ffmpeg')
  await ensureEmptyDir(tmp)
  const archiveName = path.basename(new URL(ffmpeg.url).pathname) || 'ffmpeg-archive'
  const archivePath = path.join(tmp, archiveName)
  console.log(`[fetch] ${platform} ffmpeg ← ${ffmpeg.url}`)
  await downloadToFile(ffmpeg.url, archivePath)

  const extractDir = path.join(tmp, 'extract')
  await mkdir(extractDir, { recursive: true })

  const outName = platform.startsWith('win32') ? 'ffmpeg.exe' : 'ffmpeg'
  const dest = path.join(outDir, outName)

  if (ffmpeg.kind === 'zip-file') {
    await extractZip(archivePath, extractDir)
    const found = await findFileRecursive(extractDir, 'ffmpeg')
    if (!found) throw new Error(`ffmpeg binary not found in ${archivePath}`)
    await copyFile(found, dest)
  }
  else if (ffmpeg.kind === 'zip-bin') {
    await extractZip(archivePath, extractDir)
    const found = await findFileRecursive(extractDir, ffmpeg.member || 'ffmpeg.exe')
    if (!found) throw new Error(`${ffmpeg.member} not found in ${archivePath}`)
    await copyFile(found, dest)
  }
  else if (ffmpeg.kind === 'tar-xz-bin') {
    await extractTarXz(archivePath, extractDir)
    const found = await findFileRecursive(extractDir, ffmpeg.member || 'ffmpeg')
    if (!found) throw new Error(`${ffmpeg.member} not found in ${archivePath}`)
    await copyFile(found, dest)
  }
  else {
    throw new Error(`Unknown ffmpeg kind: ${ffmpeg.kind}`)
  }

  if (!outName.endsWith('.exe')) {
    await chmod(dest, 0o755)
  }

  await rm(tmp, { recursive: true, force: true })
}

/** Clear macOS quarantine so Electron/Nitro can exec downloaded binaries. */
async function clearMacQuarantine(outDir) {
  if (process.platform !== 'darwin') return
  try {
    await execFileAsync('xattr', ['-cr', outDir])
  }
  catch (err) {
    console.warn(`[fetch] xattr -cr failed (non-fatal):`, err instanceof Error ? err.message : err)
  }
}

/**
 * yt-dlp's onedir Python.framework ships ambiguous top-level + Versions/ trees that
 * break `codesign`. Keep Versions/ only (standard layout).
 */
async function normalizePythonFramework(outDir) {
  const framework = path.join(outDir, '_internal', 'Python.framework')
  try {
    await access(framework)
  }
  catch {
    return
  }

  const versionsDir = path.join(framework, 'Versions')
  const versionDirs = (await readdir(versionsDir, { withFileTypes: true }))
    .filter(e => e.isDirectory() && e.name !== 'Current')
    .map(e => e.name)
  if (versionDirs.length === 0) return

  const primary = versionDirs.sort().at(-1)
  // Remove ambiguous root copies
  await rm(path.join(framework, 'Python'), { force: true })
  await rm(path.join(framework, 'Resources'), { recursive: true, force: true })
  await rm(path.join(versionsDir, 'Current'), { recursive: true, force: true })
  await execFileAsync('ln', ['-s', primary, path.join(versionsDir, 'Current')])
  await execFileAsync('ln', ['-s', `Versions/Current/Python`, path.join(framework, 'Python')])
  await execFileAsync('ln', ['-s', `Versions/Current/Resources`, path.join(framework, 'Resources')])
  console.log(`[fetch] normalized Python.framework → Versions/${primary}`)
}

async function verifyBinaries(platform, outDir) {
  const outName = PLATFORMS[platform].ytdlp.outName
  const ytdlp = path.join(outDir, outName)
  const ffmpeg = path.join(outDir, platform.startsWith('win32') ? 'ffmpeg.exe' : 'ffmpeg')
  await access(ytdlp)
  await access(ffmpeg)

  if (platform !== hostPlatformId()) {
    console.log(`[fetch] ${platform} ok (skipped --version; cross-platform)`)
    return
  }

  // Cold start of onedir can be slow once; warm the binary then assert.
  await execFileAsync(ytdlp, ['--version'], { timeout: 60_000 })
  const { stdout: yv } = await execFileAsync(ytdlp, ['--version'], { timeout: 15_000 })
  const { stdout: fv } = await execFileAsync(ffmpeg, ['-version'], { timeout: 15_000 })
  console.log(`[fetch] ${platform} yt-dlp ${yv.trim().split('\n')[0]}`)
  console.log(`[fetch] ${platform} ${fv.trim().split('\n')[0]}`)
}

async function fetchPlatform(platform) {
  const spec = PLATFORMS[platform]
  const outDir = path.join(BIN_ROOT, platform)
  await ensureEmptyDir(outDir)
  await fetchYtdlp(platform, outDir, spec.ytdlp)
  await fetchFfmpeg(platform, outDir, spec.ffmpeg)
  await normalizePythonFramework(outDir)
  await clearMacQuarantine(outDir)
  await verifyBinaries(platform, outDir)
}

async function main() {
  const platforms = parseArgs(process.argv)
  console.log(`[fetch] yt-dlp tag=${YTDLP_TAG}; platforms=${platforms.join(', ')}`)
  await mkdir(BIN_ROOT, { recursive: true })
  for (const platform of platforms) {
    await fetchPlatform(platform)
  }
  console.log(`[fetch] done → ${BIN_ROOT}`)
}

main().catch((err) => {
  console.error('[fetch] failed', err)
  process.exit(1)
})
