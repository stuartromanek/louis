import { spawn } from 'node:child_process'
import { ffmpegTimeoutMs, probeAudioDurationSeconds } from './ffmpeg-split.ts'

export const WAVEFORM_BAR_COUNT = 200
const PEAK_SAMPLE_RATE = 8000

let cachedFfmpeg: string | null | undefined

async function ffmpegBinary(): Promise<string | null> {
  if (cachedFfmpeg !== undefined) return cachedFfmpeg
  const { resolveFfmpegBinary } = await import('./system-deps')
  cachedFfmpeg = await resolveFfmpegBinary()
  return cachedFfmpeg
}

export type AudioPeaks = {
  peaks: number[]
  duration: number
}

export type PeakWindow = {
  startSeconds: number
  durationSeconds: number
}

export function parsePeakWindow(query: Record<string, unknown>): PeakWindow | null {
  const start = Number(query.start)
  const duration = Number(query.duration)
  if (!Number.isFinite(start) || start < 0) return null
  if (!Number.isFinite(duration) || duration <= 0) return null
  return { startSeconds: start, durationSeconds: duration }
}

export function peakDecodeArgs(
  filePath: string,
  window?: PeakWindow | null,
): string[] {
  const args = ['-hide_banner', '-nostats']
  if (window && window.durationSeconds > 0) {
    if (window.startSeconds > 0) {
      args.push('-ss', String(window.startSeconds))
    }
    args.push('-t', String(window.durationSeconds))
  }
  args.push(
    '-i', filePath,
    '-ac', '1',
    '-ar', String(PEAK_SAMPLE_RATE),
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    'pipe:1',
  )
  return args
}

/**
 * Downsample preview audio to ~200 max-abs bars without loading the whole
 * decode into an AudioContext. Optional window uses ffmpeg -ss/-t so split
 * parts decode only their segment of the full file.
 */
export async function computeAudioPeaks(
  filePath: string,
  options?: {
    barCount?: number
    window?: PeakWindow | null
  },
): Promise<AudioPeaks | null> {
  const ffmpeg = await ffmpegBinary()
  if (!ffmpeg) return null

  const window = options?.window && options.window.durationSeconds > 0
    ? options.window
    : null
  const duration = window?.durationSeconds
    ?? await probeAudioDurationSeconds(filePath)
  if (!duration || duration <= 0) return null

  const bars = Math.max(8, Math.min(512, Math.floor(options?.barCount ?? WAVEFORM_BAR_COUNT)))
  const totalSamples = Math.max(1, Math.floor(duration * PEAK_SAMPLE_RATE))
  const samplesPerBar = Math.max(1, totalSamples / bars)
  const peaks = new Array<number>(bars).fill(0)

  return new Promise((resolve) => {
    const proc = spawn(ffmpeg, peakDecodeArgs(filePath, window), {
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    let sampleIndex = 0
    let leftover: Buffer | null = null
    let settled = false

    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
    }, ffmpegTimeoutMs(duration))

    function finish(result: AudioPeaks | null) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    function consume(buffer: Buffer) {
      const view = new Int16Array(
        buffer.buffer,
        buffer.byteOffset,
        Math.floor(buffer.byteLength / 2),
      )
      for (let i = 0; i < view.length; i++) {
        const bar = Math.min(bars - 1, Math.floor(sampleIndex / samplesPerBar))
        const amp = Math.abs(view[i]!) / 32768
        if (amp > peaks[bar]!) peaks[bar] = amp
        sampleIndex += 1
      }
    }

    proc.stdout?.on('data', (chunk: Buffer) => {
      const data = leftover ? Buffer.concat([leftover, chunk]) : chunk
      const even = data.byteLength - (data.byteLength % 2)
      if (even > 0) consume(data.subarray(0, even))
      leftover = even < data.byteLength ? data.subarray(even) : null
    })

    proc.on('error', () => finish(null))
    proc.on('close', (code) => {
      if (code !== 0 && sampleIndex === 0) {
        finish(null)
        return
      }
      const max = peaks.reduce((hi, value) => Math.max(hi, value), 0)
      const normalized = max > 0
        ? peaks.map(value => Math.max(0.04, value / max))
        : peaks.map(() => 0.2)
      finish({ peaks: normalized, duration })
    })
  })
}
