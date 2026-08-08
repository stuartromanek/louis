import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pickLouisEnv } from './louis-env'

export type YotoDesktopSession = {
  accessToken: string
  refreshToken: string
  scope: string
  /** Epoch ms when accessToken should be treated as expired. */
  accessExpiresAt: number
}

type PendingPkce = {
  verifier: string
  external: boolean
  expiresAt: number
}

const PENDING_TTL_MS = 10 * 60 * 1000
const pendingByState = new Map<string, PendingPkce>()

export function isDesktopAuthMode(): boolean {
  const raw = pickLouisEnv('LOUIS_PUBLIC_DESKTOP', 'NUXT_PUBLIC_DESKTOP')
  const v = raw.toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export function resolveYotoSessionPath(): string {
  const configured = pickLouisEnv('LOUIS_YOTO_SESSION_FILE', 'NUXT_YOTO_SESSION_FILE')
  if (configured) return configured
  const audio = pickLouisEnv('LOUIS_AUDIO_WORK_DIR', 'NUXT_AUDIO_WORK_DIR')
  if (audio) return join(audio, '..', 'yoto-session.json')
  return join(process.cwd(), 'yoto-session.json')
}

export function readYotoDesktopSession(): YotoDesktopSession | null {
  if (!isDesktopAuthMode()) return null
  const path = resolveYotoSessionPath()
  try {
    if (!existsSync(path)) return null
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<YotoDesktopSession>
    if (!raw.accessToken && !raw.refreshToken) return null
    return {
      accessToken: String(raw.accessToken || ''),
      refreshToken: String(raw.refreshToken || ''),
      scope: String(raw.scope || ''),
      accessExpiresAt: Number(raw.accessExpiresAt) || 0,
    }
  }
  catch {
    return null
  }
}

export function writeYotoDesktopSession(session: YotoDesktopSession) {
  if (!isDesktopAuthMode()) return
  const path = resolveYotoSessionPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(session, null, 2)}\n`, 'utf8')
}

export function clearYotoDesktopSession() {
  if (!isDesktopAuthMode()) return
  const path = resolveYotoSessionPath()
  try {
    if (existsSync(path)) unlinkSync(path)
  }
  catch {
    // best-effort
  }
}

export function createOAuthState(): string {
  return randomBytes(16).toString('hex')
}

export function storePendingPkce(state: string, verifier: string, external: boolean) {
  pendingByState.set(state, {
    verifier,
    external,
    expiresAt: Date.now() + PENDING_TTL_MS,
  })
}

export function takePendingPkce(state: string): PendingPkce | null {
  const entry = pendingByState.get(state)
  if (!entry) return null
  pendingByState.delete(state)
  if (Date.now() > entry.expiresAt) return null
  return entry
}
