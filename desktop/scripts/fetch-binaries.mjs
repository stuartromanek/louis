#!/usr/bin/env node
/**
 * Download platform yt-dlp + ffmpeg into desktop/resources/bin/<platform>/.
 *
 * Prefer yt-dlp *onedir* zips (launcher + `_internal/`). The one-file builds cold-start
 * in ~9s which breaks health checks with a 5s version timeout.
 *
 * Pins (not floating “latest”): bump intentionally — on breakage, or before `npm run release`.
 * Each archive URL has a SHA-256; downloads fail closed on mismatch.
 *
 * Usage:
 *   node desktop/scripts/fetch-binaries.mjs           # host platform only
 *   node desktop/scripts/fetch-binaries.mjs --all      # all supported platforms
 *   node desktop/scripts/fetch-binaries.mjs darwin-arm64 linux-x64
 */
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, chmod, rm, readdir, copyFile, cp, access, symlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Readable } from 'node:stream'
import extractZip from 'extract-zip'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BIN_ROOT = path.join(ROOT, 'resources', 'bin')

/**
 * Pin yt-dlp release tag (SHA2-256SUMS from that GitHub Release).
 * Bump on YouTube breakage / before each `npm run release`.
 * @see https://github.com/yt-dlp/yt-dlp/releases
 */
const YTDLP_TAG = '2026.07.04'

/**
 * Pin yt-dlp/FFmpeg-Builds autobuild (win/linux). Prefer `autobuild-…` over `latest`.
 * @see https://github.com/yt-dlp/FFmpeg-Builds/releases
 */
const FFMPEG_BUILDS_TAG = 'autobuild-2026-08-05-17-38'
/** Artifact stem inside that release (filename prefix before platform suffix). */
const FFMPEG_BUILDS_REV = 'N-125972-ge13b2e00e8'

/**
 * @typedef {'darwin-arm64' | 'darwin-x64' | 'linux-x64' | 'linux-arm64' | 'win32-x64'} PlatformId
 * @typedef {{ kind: 'onedir-zip', url: string, sha256: string, launcher: string, outName: string } | { kind: 'file', url: string, sha256: string, outName: string }} YtdlpSpec
 * @typedef {{ kind: 'zip-file' | 'zip-bin' | 'tar-xz-bin', url: string, sha256: string, member?: string }} FfmpegSpec
 */

function ffmpegBuildsUrl(filename) {
  return `https://github.com/yt-dlp/FFmpeg-Builds/releases/download/${FFMPEG_BUILDS_TAG}/${filename}`
}

function ytdlpUrl(filename) {
  return `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_TAG}/${filename}`
}

/** @type {Record<PlatformId, { ytdlp: YtdlpSpec, ffmpeg: FfmpegSpec }>} */
const PLATFORMS = {
  'darwin-arm64': {
    ytdlp: {
      kind: 'onedir-zip',
      url: ytdlpUrl('yt-dlp_macos.zip'),
      sha256: 'b0724470a0cf6dae5175a87eee05d6e75c5a0c10d2c3015166bd4d34e92b1b7b',
      launcher: 'yt-dlp_macos',
      outName: 'yt-dlp',
    },
    // martin-riedl versioned path (not /redirect/latest/) — FFmpeg 9.0 arm64 release zip
    ffmpeg: {
      kind: 'zip-file',
      url: 'https://ffmpeg.martin-riedl.de/download/macos/arm64/1785863997_9.0/ffmpeg.zip',
      sha256: '5267ef149ee0d208057a1b316aac079b661b0476574dee5da7d225769773c603',
    },
  },
  'darwin-x64': {
    ytdlp: {
      kind: 'onedir-zip',
      url: ytdlpUrl('yt-dlp_macos.zip'),
      sha256: 'b0724470a0cf6dae5175a87eee05d6e75c5a0c10d2c3015166bd4d34e92b1b7b',
      launcher: 'yt-dlp_macos',
      outName: 'yt-dlp',
    },
    ffmpeg: {
      kind: 'zip-file',
      url: 'https://ffmpeg.martin-riedl.de/download/macos/amd64/1785871427_9.0/ffmpeg.zip',
      sha256: '79d14663d8b078dbbc38de18d63a30f8a5bfc860af5dfee7f8cf3e387cf1c02c',
    },
  },
  'linux-x64': {
    ytdlp: {
      kind: 'onedir-zip',
      url: ytdlpUrl('yt-dlp_linux.zip'),
      sha256: 'd7d2d09e900b5ae11821b5784b18cf064984a2bd88b1ca5c798d744bcbe3658b',
      launcher: 'yt-dlp_linux',
      outName: 'yt-dlp',
    },
    ffmpeg: {
      kind: 'tar-xz-bin',
      url: ffmpegBuildsUrl(`ffmpeg-${FFMPEG_BUILDS_REV}-linux64-gpl.tar.xz`),
      sha256: 'bab09c046ffd5e41f89a6d9943283ee26d08676f9b4857ca74a3c758c6a7b3b6',
      member: 'ffmpeg',
    },
  },
  'linux-arm64': {
    ytdlp: {
      kind: 'onedir-zip',
      url: ytdlpUrl('yt-dlp_linux_aarch64.zip'),
      sha256: '0554d39b22e039b4c0f70a492b9852870f281ed6a93eb75e78f150b32df76543',
      launcher: 'yt-dlp_linux_aarch64',
      outName: 'yt-dlp',
    },
    ffmpeg: {
      kind: 'tar-xz-bin',
      url: ffmpegBuildsUrl(`ffmpeg-${FFMPEG_BUILDS_REV}-linuxarm64-gpl.tar.xz`),
      sha256: '48c11ced939305242b7807baaf0636efcbc441ef0f93f4ff1b8664072853ea9c',
      member: 'ffmpeg',
    },
  },
  'win32-x64': {
    ytdlp: {
      kind: 'onedir-zip',
      url: ytdlpUrl('yt-dlp_win.zip'),
      sha256: '90254845be5282b1f4d843a873abff04f569f857f64250f833fe152b21eec152',
      launcher: 'yt-dlp.exe',
      outName: 'yt-dlp.exe',
    },
    ffmpeg: {
      kind: 'zip-bin',
      url: ffmpegBuildsUrl(`ffmpeg-${FFMPEG_BUILDS_REV}-win64-gpl.zip`),
      sha256: 'aab7e1850062f3958cd0a405d25f7aedc0ea0fa89e4a02e6594e134976568222',
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

async function sha256File(filePath) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  return hash.digest('hex')
}

async function assertSha256(filePath, expected) {
  const actual = await sha256File(filePath)
  const want = expected.toLowerCase()
  if (actual !== want) {
    throw new Error(
      `SHA-256 mismatch for ${path.basename(filePath)}\n  expected ${want}\n  actual   ${actual}`,
    )
  }
}

async function downloadToFile(url, dest, expectedSha256) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed ${res.status} ${url}`)
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  await assertSha256(dest, expectedSha256)
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

async function extractZipArchive(zipPath, outDir) {
  await mkdir(outDir, { recursive: true })
  await extractZip(zipPath, { dir: outDir })
}

/**
 * Linux ffmpeg builds ship as .tar.xz. Host `tar` is used only for that path
 * (desktop-win CI fetches win32 zip assets and never hits this).
 */
async function extractTarXz(archivePath, outDir) {
  await mkdir(outDir, { recursive: true })
  try {
    await execFileAsync('tar', ['-xJf', archivePath, '-C', outDir])
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Failed to extract ${archivePath} with system tar (xz). Install tar/xz or fetch on Linux/macOS. ${msg}`,
    )
  }
}

async function fetchYtdlp(platform, outDir, spec) {
  console.log(`[fetch] ${platform} yt-dlp ← ${spec.url}`)
  if (spec.kind === 'file') {
    const dest = path.join(outDir, spec.outName)
    await downloadToFile(spec.url, dest, spec.sha256)
    if (!spec.outName.endsWith('.exe')) await chmod(dest, 0o755)
    return
  }

  const tmp = path.join(outDir, '.tmp-ytdlp')
  await ensureEmptyDir(tmp)
  const zipPath = path.join(tmp, 'yt-dlp.zip')
  await downloadToFile(spec.url, zipPath, spec.sha256)
  const extractDir = path.join(tmp, 'extract')
  await extractZipArchive(zipPath, extractDir)

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
  }
  catch {
    throw new Error(`Missing _internal/ next to ${spec.launcher} in onedir zip`)
  }
  // Copy _internal beside the launcher (onedir layout). Node cp works on Windows CI.
  await cp(internalSrc, path.join(outDir, '_internal'), { recursive: true })

  await rm(tmp, { recursive: true, force: true })
}

async function fetchFfmpeg(platform, outDir, ffmpeg) {
  const tmp = path.join(outDir, '.tmp-ffmpeg')
  await ensureEmptyDir(tmp)
  const archiveName = path.basename(new URL(ffmpeg.url).pathname) || 'ffmpeg-archive'
  const archivePath = path.join(tmp, archiveName)
  console.log(`[fetch] ${platform} ffmpeg ← ${ffmpeg.url}`)
  await downloadToFile(ffmpeg.url, archivePath, ffmpeg.sha256)

  const extractDir = path.join(tmp, 'extract')
  await mkdir(extractDir, { recursive: true })

  const outName = platform.startsWith('win32') ? 'ffmpeg.exe' : 'ffmpeg'
  const dest = path.join(outDir, outName)

  if (ffmpeg.kind === 'zip-file') {
    await extractZipArchive(archivePath, extractDir)
    const found = await findFileRecursive(extractDir, 'ffmpeg')
    if (!found) throw new Error(`ffmpeg binary not found in ${archivePath}`)
    await copyFile(found, dest)
  }
  else if (ffmpeg.kind === 'zip-bin') {
    await extractZipArchive(archivePath, extractDir)
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
  // macOS-only layout; symlink via Node (no `ln` shell-out).
  await symlink(primary, path.join(versionsDir, 'Current'))
  await symlink('Versions/Current/Python', path.join(framework, 'Python'))
  await symlink('Versions/Current/Resources', path.join(framework, 'Resources'))
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
  console.log(
    `[fetch] yt-dlp=${YTDLP_TAG}; ffmpeg-builds=${FFMPEG_BUILDS_TAG} (${FFMPEG_BUILDS_REV}); platforms=${platforms.join(', ')}`,
  )
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
