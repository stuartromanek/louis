import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { H3Event } from 'h3'
import {
  electronAsNodeProbe,
  jsRuntimeExecOptions,
} from '#shared/ytdlp-js-runtime-probe.mjs'
import { parseYtdlpJsRuntimeSpec } from '#shared/ytdlp-js-runtime-spec.mjs'
import { pickLouisEnv } from './louis-env'

export { parseYtdlpJsRuntimeSpec }

const execFileAsync = promisify(execFile)

/**
 * yt-dlp `--js-runtimes` value for YouTube EJS challenges.
 * Desktop sets LOUIS_YTDLP_JS_RUNTIME to `node:<absolute Electron node shim>`
 * (Windows: `node:<Louis.exe>`). Docker / native: bare `node` on PATH.
 */
export function resolveYtdlpJsRuntimeSpec(event?: H3Event): string {
  const config = event ? useRuntimeConfig(event) : useRuntimeConfig()
  const fromConfig = String(config.ytdlpJsRuntime || '').trim()
  if (fromConfig) return fromConfig

  const fromEnv = pickLouisEnv('LOUIS_YTDLP_JS_RUNTIME', 'NUXT_YTDLP_JS_RUNTIME')
  if (fromEnv) return fromEnv

  return 'node'
}

/** Args fragment: `['--js-runtimes', spec]`. */
export function ytdlpJsRuntimeArgs(event?: H3Event): string[] {
  return ['--js-runtimes', resolveYtdlpJsRuntimeSpec(event)]
}

export type YtdlpJsRuntimeStatus = {
  available: boolean
  /** Full `--js-runtimes` value Louis passes (e.g. `node` or `node:/path/to/shim`). */
  spec: string
  runtime?: string
  path?: string
  version?: string
  error?: string
}

function expandBareBinary(name: string): string[] {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  const names = process.platform === 'win32' && !name.endsWith('.exe') && !name.endsWith('.cmd')
    ? [`${name}.exe`, `${name}.cmd`, name]
    : [name]
  const out: string[] = []
  for (const dir of dirs) {
    for (const n of names) {
      out.push(path.join(dir, n))
    }
  }
  out.push(name)
  return out
}

async function probeNodeVersion(binaryPath: string): Promise<string | null> {
  const execOptions = jsRuntimeExecOptions(binaryPath)
  try {
    const { stdout } = await execFileAsync(
      binaryPath,
      ['-e', 'console.log(process.version)'],
      execOptions,
    )
    const version = stdout.trim().split('\n')[0] || ''
    return version || null
  }
  catch {
    try {
      const { stdout } = await execFileAsync(binaryPath, ['--version'], execOptions)
      const version = stdout.trim().split('\n')[0] || ''
      return version || null
    }
    catch {
      return null
    }
  }
}

/** Resolve and probe the JS runtime Louis will pass to yt-dlp (for `/api/health`). */
export async function resolveYtdlpJsRuntimeStatus(event?: H3Event): Promise<YtdlpJsRuntimeStatus> {
  const spec = resolveYtdlpJsRuntimeSpec(event)
  const { runtime, binaryPath } = parseYtdlpJsRuntimeSpec(spec)

  if (runtime !== 'node' && runtime !== 'deno' && runtime !== 'bun' && runtime !== 'quickjs') {
    return {
      available: false,
      spec,
      runtime,
      error: `Unsupported JS runtime "${runtime}"`,
    }
  }

  const asNode = electronAsNodeProbe(runtime, binaryPath)
  if (asNode) {
    if (!asNode.available) {
      return { available: false, spec, runtime, error: asNode.error }
    }
    return {
      available: true,
      spec,
      runtime,
      path: asNode.path,
      version: asNode.version,
    }
  }

  const candidates = binaryPath
    ? [binaryPath]
    : expandBareBinary(runtime)

  const tried: string[] = []
  for (const candidate of candidates) {
    if (tried.includes(candidate)) continue
    tried.push(candidate)
    const version = await probeNodeVersion(candidate)
    if (version) {
      return {
        available: true,
        spec,
        runtime,
        path: candidate,
        version,
      }
    }
  }

  return {
    available: false,
    spec,
    runtime,
    error: binaryPath
      ? `JS runtime not executable at ${binaryPath}`
      : `${runtime} not found on PATH (required for YouTube EJS / nsig)`,
  }
}
