import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, chmod, copyFile, cp, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createError } from 'h3'
import type { H3Event } from 'h3'
import { resolveAudioWorkDirConfig } from './audio-work-dir'
import {
  findYtdlpBinary,
  invalidateYtdlpBinaryCache,
  readYtdlpVersion,
} from './ytdlp-binary'
import {
  isPersistentAudioWorkDir,
  isYtdlpVersionNewer,
  nightlyAssetForHost,
  parseSha256Sums,
  ytdlpManagedBinDir,
  ytdlpManagedBinaryName,
  ytdlpManagedBinaryPath,
} from './ytdlp-tools'

const execFileAsync = promisify(execFile)

const NIGHTLY_API = 'https://api.github.com/repos/yt-dlp/yt-dlp-nightly-builds/releases/latest'
const STABLE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'
const UPDATE_LOCK_TIMEOUT_MS = 6 * 60 * 1000

export type ToolsBinaryView = {
  available: boolean
  path?: string
  version?: string
  managed?: boolean
  error?: string
}

export type ToolsUpstream = {
  tag: string
  url: string
  newer: boolean
  error?: string
}

export type ToolsStatus = {
  updateSupported: boolean
  ytdlp: ToolsBinaryView
  ffmpeg: ToolsBinaryView
  upstream?: ToolsUpstream
}

type GithubAsset = { name: string, browser_download_url: string }
type GithubRelease = {
  tag_name: string
  html_url: string
  assets: GithubAsset[]
}

let inFlightUpdate: Promise<{ version: string, path: string }> | null = null
let upstreamCache: { at: number, release: GithubRelease } | null = null
const UPSTREAM_CACHE_MS = 5 * 60 * 1000

function githubHeaders(event?: H3Event): Record<string, string> {
  const version = event
    ? String(useRuntimeConfig(event).public.appVersion || '0.0.0')
    : '0.0.0'
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': `Louis/${version} (https://github.com/stuartromanek/louis)`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function isDesktopHost(event?: H3Event): boolean {
  const config = event ? useRuntimeConfig(event) : useRuntimeConfig()
  return Boolean(config.public.desktop)
}

export function isYtdlpUpdateSupported(event?: H3Event): boolean {
  if (isDesktopHost(event)) return true
  const audioWorkDir = resolveAudioWorkDirConfig(event).audioWorkDir
  return isPersistentAudioWorkDir(audioWorkDir)
}

async function fetchGithubRelease(url: string, event?: H3Event): Promise<GithubRelease> {
  const res = await fetch(url, { headers: githubHeaders(event) })
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} fetching ${url}`)
  }
  return await res.json() as GithubRelease
}

export async function fetchLatestYtdlpRelease(event?: H3Event): Promise<GithubRelease> {
  if (upstreamCache && Date.now() - upstreamCache.at < UPSTREAM_CACHE_MS) {
    return upstreamCache.release
  }
  try {
    const release = await fetchGithubRelease(NIGHTLY_API, event)
    upstreamCache = { at: Date.now(), release }
    return release
  }
  catch (nightlyErr) {
    try {
      const release = await fetchGithubRelease(STABLE_API, event)
      upstreamCache = { at: Date.now(), release }
      return release
    }
    catch {
      const message = nightlyErr instanceof Error ? nightlyErr.message : 'Could not reach GitHub'
      throw createError({ statusCode: 502, statusMessage: message })
    }
  }
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  return hash.digest('hex')
}

async function downloadToFile(url: string, dest: string, event?: H3Event): Promise<void> {
  const res = await fetch(url, { headers: githubHeaders(event), redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed ${res.status} ${url}`)
  }
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest))
}

async function findFileRecursive(dir: string, basename: string): Promise<string | null> {
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

function powershellQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

async function extractZipArchive(zipPath: string, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true })
  if (process.platform === 'win32') {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath ${powershellQuote(zipPath)} -DestinationPath ${powershellQuote(outDir)} -Force`,
      ],
      { timeout: 120_000 },
    )
    return
  }
  await execFileAsync('unzip', ['-o', '-q', zipPath, '-d', outDir], { timeout: 120_000 })
}

async function clearMacQuarantine(dir: string): Promise<void> {
  if (process.platform !== 'darwin') return
  try {
    await execFileAsync('xattr', ['-cr', dir], { timeout: 30_000 })
  }
  catch (err) {
    console.warn('[yt-dlp-update] xattr -cr failed (non-fatal):', err instanceof Error ? err.message : err)
  }
}

export async function getToolsStatus(event: H3Event, options?: { check?: boolean }): Promise<ToolsStatus> {
  const { getSystemDepsStatus } = await import('./system-deps')
  const found = await findYtdlpBinary(event)
  const deps = await getSystemDepsStatus(event)
  const status: ToolsStatus = {
    updateSupported: isYtdlpUpdateSupported(event),
    ytdlp: found
      ? {
          available: true,
          path: found.path,
          version: found.version,
          managed: found.managed,
        }
      : {
          available: false,
          error: deps.ytdlp.error || 'yt-dlp not found',
          managed: false,
        },
    ffmpeg: {
      available: deps.ffmpeg.available,
      path: deps.ffmpeg.path,
      version: deps.ffmpeg.version,
      error: deps.ffmpeg.error,
    },
  }

  if (!options?.check) return status

  try {
    const release = await fetchLatestYtdlpRelease(event)
    const installed = found?.version || ''
    status.upstream = {
      tag: release.tag_name.replace(/^v/, ''),
      url: release.html_url,
      newer: installed ? isYtdlpVersionNewer(release.tag_name.replace(/^v/, ''), installed) : true,
    }
  }
  catch (err) {
    status.upstream = {
      tag: '',
      url: '',
      newer: false,
      error: err instanceof Error ? err.message : 'Could not check for a newer yt-dlp',
    }
  }

  return status
}

async function installFromRelease(
  event: H3Event,
  release: GithubRelease,
): Promise<{ version: string, path: string }> {
  let assetSpec
  try {
    assetSpec = nightlyAssetForHost()
  }
  catch (err) {
    throw createError({
      statusCode: 400,
      statusMessage: err instanceof Error ? err.message : 'Unsupported platform',
    })
  }
  const asset = release.assets.find(item => item.name === assetSpec.name)
  const sumsAsset = release.assets.find(item => item.name === 'SHA2-256SUMS' || item.name === 'SHA2-256SUMS.txt')
  if (!asset) {
    throw createError({
      statusCode: 502,
      statusMessage: `Nightly release is missing ${assetSpec.name}`,
    })
  }
  if (!sumsAsset) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Nightly release is missing SHA2-256SUMS',
    })
  }

  const sumsText = await fetch(sumsAsset.browser_download_url, { headers: githubHeaders(event) })
    .then(async (res) => {
      if (!res.ok) throw new Error(`SHA2-256SUMS download failed (${res.status})`)
      return res.text()
    })
  const expected = parseSha256Sums(sumsText).get(assetSpec.name)
  if (!expected) {
    throw createError({
      statusCode: 502,
      statusMessage: `SHA2-256SUMS has no entry for ${assetSpec.name}`,
    })
  }

  const audioWorkDir = resolveAudioWorkDirConfig(event).audioWorkDir
  const binDir = ytdlpManagedBinDir(audioWorkDir)
  const destPath = ytdlpManagedBinaryPath(audioWorkDir)
  const tmpDir = path.join(binDir, '.tmp-ytdlp-update')
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })

  try {
    const downloadPath = path.join(tmpDir, assetSpec.name)
    await downloadToFile(asset.browser_download_url, downloadPath, event)
    const actual = await sha256File(downloadPath)
    if (actual !== expected) {
      throw createError({
        statusCode: 502,
        statusMessage: `SHA-256 mismatch for ${assetSpec.name}`,
      })
    }

    const staging = path.join(tmpDir, 'staging')
    await mkdir(staging, { recursive: true })
    const stagedBin = path.join(staging, ytdlpManagedBinaryName())

    if (assetSpec.kind === 'file') {
      await copyFile(downloadPath, stagedBin)
      if (process.platform !== 'win32') await chmod(stagedBin, 0o755)
    }
    else {
      const extractDir = path.join(tmpDir, 'extract')
      await extractZipArchive(downloadPath, extractDir)
      const launcherPath = await findFileRecursive(extractDir, assetSpec.launcher)
      if (!launcherPath) {
        throw createError({
          statusCode: 502,
          statusMessage: `Launcher ${assetSpec.launcher} not found in ${assetSpec.name}`,
        })
      }
      await copyFile(launcherPath, stagedBin)
      if (process.platform !== 'win32') await chmod(stagedBin, 0o755)
      const internalSrc = path.join(path.dirname(launcherPath), '_internal')
      try {
        await access(internalSrc)
      }
      catch {
        throw createError({
          statusCode: 502,
          statusMessage: `Missing _internal/ next to ${assetSpec.launcher}`,
        })
      }
      await cp(internalSrc, path.join(staging, '_internal'), { recursive: true })
    }

    await mkdir(binDir, { recursive: true })
    await rm(destPath, { force: true })
    await rm(path.join(binDir, '_internal'), { recursive: true, force: true })
    await copyFile(stagedBin, destPath)
    if (process.platform !== 'win32') await chmod(destPath, 0o755)
    try {
      await access(path.join(staging, '_internal'))
      await cp(path.join(staging, '_internal'), path.join(binDir, '_internal'), { recursive: true })
    }
    catch {
      // file installs have no _internal
    }
    await clearMacQuarantine(binDir)
  }
  finally {
    await rm(tmpDir, { recursive: true, force: true })
  }

  invalidateYtdlpBinaryCache()
  const version = await readYtdlpVersion(destPath)
  if (!version) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Installed yt-dlp but could not read --version',
    })
  }
  return { version, path: destPath }
}

export async function updateManagedYtdlp(event: H3Event): Promise<{ version: string, path: string }> {
  if (!isYtdlpUpdateSupported(event)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'In-app yt-dlp updates need a persistent data dir (Docker volume or the Louis desktop app). In npm run dev, upgrade yt-dlp with brew or pip.',
    })
  }

  const { hasInFlightYtdlpDownloads } = await import('./youtube-download')
  if (hasInFlightYtdlpDownloads()) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A YouTube download is running. Try Update again when it finishes.',
    })
  }

  if (inFlightUpdate) return inFlightUpdate

  const run = (async () => {
    const release = await fetchLatestYtdlpRelease(event)
    return installFromRelease(event, release)
  })()

  inFlightUpdate = run.finally(() => {
    inFlightUpdate = null
  })
  return Promise.race([
    inFlightUpdate,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(createError({ statusCode: 504, statusMessage: 'yt-dlp update timed out' }))
      }, UPDATE_LOCK_TIMEOUT_MS)
    }),
  ])
}
