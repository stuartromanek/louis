import {
  DEFAULT_STDERR_EXCERPT_BYTES,
  VERBOSE_STDERR_EXCERPT_BYTES,
} from './schema.ts'

const COOKIES_FLAG = '--cookies'

/** Replace cookie paths and JS-runtime file paths so logs never store them. */
export function redactYtdlpArgs(args: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === COOKIES_FLAG) {
      out.push(arg)
      if (i + 1 < args.length) {
        out.push('<redacted>')
        i += 1
      }
      continue
    }
    if (arg.startsWith(`${COOKIES_FLAG}=`)) {
      out.push(`${COOKIES_FLAG}=<redacted>`)
      continue
    }
    if (arg === '--js-runtimes' && i + 1 < args.length) {
      out.push(arg)
      out.push(redactJsRuntimeSpec(args[++i]!))
      continue
    }
    out.push(redactJsRuntimeSpec(arg))
  }
  return out
}

function redactJsRuntimeSpec(value: string): string {
  const colon = value.indexOf(':')
  if (colon <= 0) return value
  const runtime = value.slice(0, colon)
  if (runtime !== 'node' && runtime !== 'deno' && runtime !== 'bun' && runtime !== 'quickjs') {
    return value
  }
  return `${runtime}:<redacted>`
}

export function redactYtdlpText(text: string): string {
  return text
    .replace(/--cookies(?:=|\s+)\S+/gi, '--cookies <redacted>')
    .replace(/\b(node|deno|bun|quickjs):(?:\/|[A-Za-z]:\\)[^\s"']+/g, '$1:<redacted>')
}

export function excerptYtdlpOutput(
  text: string,
  options?: { verbose?: boolean, maxBytes?: number },
): string {
  const maxBytes = options?.maxBytes
    ?? (options?.verbose ? VERBOSE_STDERR_EXCERPT_BYTES : DEFAULT_STDERR_EXCERPT_BYTES)
  const redacted = redactYtdlpText(String(text || ''))
  const lines = redacted.split(/\r?\n/)
  const preferred = lines.filter(line => isPreferredYtdlpLine(line))
  const chosen = preferred.length > 0 ? preferred : lines
  return clipToBytes(chosen.join('\n').trim(), maxBytes)
}

function isPreferredYtdlpLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/^ERROR:/i.test(trimmed)) return true
  if (/HTTP Error 403/i.test(trimmed)) return true
  if (/not a bot/i.test(trimmed)) return true
  if (/Downloading \d+ format\(s\):/i.test(trimmed)) return true
  if (/\[info\]/i.test(trimmed) && /format/i.test(trimmed)) return true
  if (/\[download\] Destination:/i.test(trimmed)) return true
  if (/\[ExtractAudio\]/i.test(trimmed)) return true
  if (/nsig extraction failed/i.test(trimmed)) return true
  return false
}

function clipToBytes(text: string, maxBytes: number): string {
  if (maxBytes <= 0 || !text) return ''
  const encoded = Buffer.from(text, 'utf8')
  if (encoded.length <= maxBytes) return text
  const slice = encoded.subarray(encoded.length - maxBytes)
  const decoded = slice.toString('utf8').replace(/^\uFFFD/, '')
  return `…${decoded}`
}

export type YtdlpFormatInfo = {
  formatId?: string
  ext?: string
  acodec?: string
  abr?: string
  filesize?: string
}

const MISSING = /^(NA|none|null|-)?$/i

/** Parse `--print after_move` TSV (`format_id ext acodec abr filesize`) and stderr format lines. */
export function parseYtdlpFormatInfo(stdout: string, stderr = ''): YtdlpFormatInfo {
  const fromPrint = parseYtdlpPrintLine(stdout)
  const fromStderr = parseYtdlpFormatFromStderr(stderr)
  return {
    formatId: fromPrint.formatId || fromStderr.formatId,
    ext: fromPrint.ext || fromStderr.ext,
    acodec: fromPrint.acodec,
    abr: fromPrint.abr,
    filesize: fromPrint.filesize,
  }
}

export function parseYtdlpPrintLine(stdout: string): YtdlpFormatInfo {
  const lines = String(stdout || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!
    if (line.startsWith('{') || line.startsWith('[')) continue
    const parts = line.split('\t')
    if (parts.length < 2) continue
    return {
      formatId: present(parts[0]),
      ext: present(parts[1]),
      acodec: present(parts[2]),
      abr: present(parts[3]),
      filesize: present(parts[4]),
    }
  }
  return {}
}

function parseYtdlpFormatFromStderr(stderr: string): YtdlpFormatInfo {
  const formatMatch = String(stderr || '').match(/Downloading \d+ format\(s\):\s+(\S+)/i)
  const destMatch = String(stderr || '').match(/\[download\] Destination:\s+\S+\.([A-Za-z0-9]+)/i)
  return {
    formatId: formatMatch?.[1],
    ext: destMatch?.[1]?.toLowerCase(),
  }
}

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed || MISSING.test(trimmed)) return undefined
  return trimmed
}

export const YTDLP_FORMAT_PRINT_TEMPLATE =
  'after_move:%(format_id)s\t%(ext)s\t%(acodec)s\t%(abr)s\t%(filesize,filesize_approx)s'
