const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSccwkdCpYaJjODtpxSrtBIaye045nobwudH1L0VX8S6NzFtjA/viewform'
const VERSION_ENTRY_ID = 'entry.1332721159'

export type FeedbackRuntimeInfo = {
  electronVersion: string
  platform: string
  arch: string
}

function platformLabel(platform: string): string {
  if (platform === 'darwin') return 'macOS'
  if (platform === 'win32') return 'Windows'
  if (platform === 'linux') return 'Linux'
  return platform
}

export function buildFeedbackUrl(
  appVersion: string,
  runtimeInfo?: FeedbackRuntimeInfo | null,
): string {
  const version = appVersion.trim()
  const versionLabel = version ? `Louis v${version}` : 'Louis version unknown'
  const electronVersion = runtimeInfo?.electronVersion.trim()
  const platform = runtimeInfo?.platform.trim()
  const arch = runtimeInfo?.arch.trim()
  const runtimeLabel = electronVersion && platform && arch
    ? ` · Electron ${electronVersion} · ${platformLabel(platform)} ${arch}`
    : ''
  const url = new URL(FEEDBACK_FORM_URL)
  url.searchParams.set('usp', 'pp_url')
  url.searchParams.set(VERSION_ENTRY_ID, `${versionLabel}${runtimeLabel}`)
  return url.toString()
}
