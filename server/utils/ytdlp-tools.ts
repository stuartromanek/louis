import os from 'node:os'
import path from 'node:path'

export type YtdlpNightlyAsset = {
  name: string
  kind: 'file' | 'zip'
  launcher: string
  outName: string
}

export function ytdlpManagedBinDir(audioWorkDir: string): string {
  return path.join(audioWorkDir, 'bin')
}

export function ytdlpManagedBinaryName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
}

export function ytdlpManagedBinaryPath(
  audioWorkDir: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return path.join(ytdlpManagedBinDir(audioWorkDir), ytdlpManagedBinaryName(platform))
}

/** Date-like stamp so nightly `2026.08.18.232845` compares after stable `2026.08.18`. */
export function ytdlpVersionStamp(version: string): number {
  const match = String(version).trim().match(/^(\d{4})\.(\d{2})\.(\d{2})(?:\.(\d+))?/)
  if (!match) return 0
  const extra = (match[4] || '0').slice(0, 6).padStart(6, '0')
  return Number(match[1] + match[2] + match[3] + extra)
}

export function isYtdlpVersionNewer(candidate: string, installed: string): boolean {
  return ytdlpVersionStamp(candidate) > ytdlpVersionStamp(installed)
}

export function parseSha256Sums(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/)
    if (!match) continue
    map.set(path.basename(match[2].trim()), match[1].toLowerCase())
  }
  return map
}

export function nightlyAssetForHost(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): YtdlpNightlyAsset {
  const outName = platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  if (platform === 'darwin') {
    return { name: 'yt-dlp_macos.zip', kind: 'zip', launcher: 'yt-dlp_macos', outName }
  }
  if (platform === 'win32') {
    return { name: 'yt-dlp_win.zip', kind: 'zip', launcher: 'yt-dlp.exe', outName }
  }
  if (platform === 'linux' && (arch === 'arm64' || arch === 'aarch64')) {
    return { name: 'yt-dlp_linux_aarch64', kind: 'file', launcher: 'yt-dlp_linux_aarch64', outName }
  }
  if (platform === 'linux') {
    return { name: 'yt-dlp_linux', kind: 'file', launcher: 'yt-dlp_linux', outName }
  }
  throw new Error(`yt-dlp updates are not supported on ${platform}-${arch}.`)
}

export function isPersistentAudioWorkDir(dir: string): boolean {
  const resolved = path.resolve(dir)
  const tmp = path.resolve(os.tmpdir())
  if (resolved === tmp || resolved.startsWith(`${tmp}${path.sep}`)) return false
  return true
}
