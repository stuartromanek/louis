import {
  onSharedYoutubePreviewPlay,
  pauseSharedYoutubePreview,
} from '~/components/youtube-picker/useYoutubeAudioPlayer'

export type TrimPreviewPlayer = {
  isPlaying: Ref<boolean>
  isLoading: Ref<boolean>
  error: Ref<string | null>
  playhead: Ref<number>
  duration: Ref<number>
  play: () => Promise<void>
  pause: () => void
  toggle: () => Promise<void>
  seek: (trackSeconds: number) => void
  destroy: () => void
}

function previewUrl(id: string): string {
  return `/api/youtube/preview/${id}`
}

const SEEK_OK_SECONDS = 0.75
const SEEK_FAIL_SECONDS = 1.5

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function waitForAudioEvent(
  el: HTMLAudioElement,
  type: string,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onFail = () => {
      cleanup()
      reject(new Error('Preview unavailable'))
    }
    const cleanup = () => {
      el.removeEventListener(type, onReady)
      el.removeEventListener('error', onFail)
      signal.removeEventListener('abort', onFail)
    }
    el.addEventListener(type, onReady, { once: true })
    el.addEventListener('error', onFail, { once: true })
    signal.addEventListener('abort', onFail, { once: true })
  })
}

export function useTrimPreviewPlayer(options: {
  youtubeId: Ref<string | null>
  offsetSeconds: Ref<number>
  trimStart: Ref<number>
  trimEnd: Ref<number>
}): TrimPreviewPlayer {
  const isPlaying = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const playhead = ref(0)
  const duration = ref(0)

  let audio: HTMLAudioElement | null = null
  let playAbort: AbortController | null = null
  let playGeneration = 0

  function ensureAudio(): HTMLAudioElement {
    if (!audio) {
      audio = new Audio()
      audio.preload = 'none'
      audio.addEventListener('timeupdate', onTimeUpdate)
      audio.addEventListener('playing', onPlaying)
      audio.addEventListener('pause', onPause)
      audio.addEventListener('waiting', onWaiting)
      audio.addEventListener('error', onError)
      audio.addEventListener('ended', onEnded)
      audio.addEventListener('loadedmetadata', onLoadedMetadata)
    }
    return audio
  }

  function offset() {
    return Math.max(0, options.offsetSeconds.value)
  }

  function trimStart() {
    return options.trimStart.value
  }

  function trimEnd() {
    return options.trimEnd.value
  }

  function fileTime(trackSeconds: number) {
    return offset() + trackSeconds
  }

  function trackTime(fileSeconds: number) {
    return fileSeconds - offset()
  }

  function clampPlayhead(trackSeconds: number) {
    return clamp(trackSeconds, trimStart(), trimEnd())
  }

  function hasKeepRegion() {
    return trimEnd() > trimStart() + 0.05
  }

  async function seekToFileTime(
    el: HTMLAudioElement,
    fileSeconds: number,
    signal: AbortSignal,
  ) {
    const target = Math.max(0, fileSeconds)
    if (Number.isFinite(el.currentTime) && Math.abs(el.currentTime - target) <= SEEK_OK_SECONDS) {
      return
    }
    const seeked = waitForAudioEvent(el, 'seeked', signal)
    el.currentTime = target
    await seeked
    if (Math.abs(el.currentTime - target) > SEEK_FAIL_SECONDS) {
      throw new Error('Preview unavailable')
    }
  }

  function onLoadedMetadata() {
    if (!audio) return
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      duration.value = audio.duration
    }
  }

  function onTimeUpdate() {
    if (!audio) return
    const t = trackTime(audio.currentTime)
    if (hasKeepRegion() && t >= trimEnd() - 0.02) {
      audio.pause()
      const snapped = trimEnd()
      audio.currentTime = fileTime(snapped)
      playhead.value = snapped
      isPlaying.value = false
      return
    }
    playhead.value = t
  }

  function onPlaying() {
    isPlaying.value = true
    isLoading.value = false
  }

  function onPause() {
    isPlaying.value = false
  }

  function onWaiting() {
    isLoading.value = true
  }

  function onError() {
    isLoading.value = false
    isPlaying.value = false
    error.value = 'Preview unavailable'
  }

  function onEnded() {
    isPlaying.value = false
    playhead.value = trimEnd()
  }

  function pause() {
    audio?.pause()
    isPlaying.value = false
  }

  function seek(trackSeconds: number) {
    const next = clampPlayhead(trackSeconds)
    playhead.value = next
    if (!audio) return
    audio.currentTime = fileTime(next)
  }

  async function play() {
    const id = options.youtubeId.value
    if (!id) return
    const el = ensureAudio()
    playAbort?.abort()
    playAbort = new AbortController()
    const generation = ++playGeneration
    const url = previewUrl(id)
    const sameSource = el.src === new URL(url, window.location.origin).href

    pauseSharedYoutubePreview()
    isLoading.value = true
    error.value = null

    try {
      const signal = playAbort.signal
      if (!sameSource) {
        el.src = url
        el.load()
        await waitForAudioEvent(el, 'canplay', signal)
        if (generation !== playGeneration) return
        if (Number.isFinite(el.duration) && el.duration > 0) duration.value = el.duration
      }

      const atEnd = hasKeepRegion() && playhead.value >= trimEnd() - 0.05
      const startAt = atEnd ? trimStart() : clampPlayhead(playhead.value)
      await seekToFileTime(el, fileTime(startAt), signal)
      if (generation !== playGeneration) return
      playhead.value = startAt
      await el.play()
    }
    catch {
      if (generation !== playGeneration) return
      isLoading.value = false
      isPlaying.value = false
      error.value = 'Preview unavailable'
    }
  }

  async function toggle() {
    if (isPlaying.value) {
      pause()
      return
    }
    await play()
  }

  function destroy() {
    playAbort?.abort()
    playGeneration += 1
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio = null
    }
    isPlaying.value = false
    isLoading.value = false
  }

  const stopOnPickerPlay = onSharedYoutubePreviewPlay(() => {
    pause()
  })

  onUnmounted(() => {
    stopOnPickerPlay()
    destroy()
  })

  watch(
    () => [options.trimStart.value, options.trimEnd.value] as const,
    ([start, end]) => {
      if (!audio || !isPlaying.value) return
      const t = trackTime(audio.currentTime)
      if (t < start || t > end) pause()
    },
  )

  watch(
    () => options.youtubeId.value,
    () => {
      pause()
      playhead.value = options.trimStart.value
      error.value = null
    },
  )

  return {
    isPlaying,
    isLoading,
    error,
    playhead,
    duration,
    play,
    pause,
    toggle,
    seek,
    destroy,
  }
}
