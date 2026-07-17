export const YOUTUBE_AUDIO_PLAYER_KEY = Symbol('youtubeAudioPlayer')

export type YoutubeAudioPlayerApi = {
  activeId: Ref<string | null>
  isPlaying: Ref<boolean>
  isLoading: Ref<boolean>
  currentTime: Ref<number>
  duration: Ref<number>
  durationById: Readonly<Record<string, number>>
  ready: Ref<boolean>
  error: Ref<string | null>
  play: (id: string) => Promise<void>
  pause: () => void
  toggle: (id: string) => Promise<void>
  seek: (seconds: number) => void
  destroy: () => void
}

let sharedAudio: HTMLAudioElement | null = null

function previewUrl(id: string): string {
  return `/api/youtube/preview/${id}`
}

function ensureAudio(): HTMLAudioElement {
  if (import.meta.server) {
    throw new Error('YouTube audio preview is client-only')
  }
  if (!sharedAudio) {
    sharedAudio = new Audio()
    sharedAudio.preload = 'none'
  }
  return sharedAudio
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function waitForCanPlay(audio: HTMLAudioElement, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('The play() request was interrupted.', 'AbortError'))
  }
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onFail = () => {
      cleanup()
      reject(new Error('Preview unavailable'))
    }
    const onAbort = () => {
      cleanup()
      reject(new DOMException('The play() request was interrupted.', 'AbortError'))
    }
    const cleanup = () => {
      audio.removeEventListener('canplay', onReady)
      audio.removeEventListener('error', onFail)
      audio.removeEventListener('abort', onAbort)
      signal.removeEventListener('abort', onAbort)
    }
    audio.addEventListener('canplay', onReady)
    audio.addEventListener('error', onFail)
    audio.addEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort)
  })
}

export function useYoutubeAudioPlayer(): YoutubeAudioPlayerApi {
  const activeId = ref<string | null>(null)
  const isPlaying = ref(false)
  const isLoading = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const durationById = reactive<Record<string, number>>({})
  const ready = ref(false)
  const error = ref<string | null>(null)

  let pollId: ReturnType<typeof setInterval> | null = null
  let boundAudio: HTMLAudioElement | null = null
  let playAbort: AbortController | null = null
  let playGeneration = 0

  function clearPoll() {
    if (pollId !== null) {
      clearInterval(pollId)
      pollId = null
    }
  }

  function rememberDuration(id: string | null, seconds: number) {
    if (!id || !(seconds > 0) || !Number.isFinite(seconds)) return
    durationById[id] = seconds
  }

  function syncTimes(audio: HTMLAudioElement) {
    currentTime.value = audio.currentTime || 0
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      duration.value = audio.duration
      rememberDuration(activeId.value, audio.duration)
    }
  }

  function startPoll(audio: HTMLAudioElement) {
    clearPoll()
    pollId = setInterval(() => syncTimes(audio), 250)
  }

  function bindAudio(audio: HTMLAudioElement) {
    if (boundAudio === audio) return
    if (boundAudio) {
      boundAudio.removeEventListener('loadedmetadata', onLoadedMetadata)
      boundAudio.removeEventListener('canplay', onCanPlay)
      boundAudio.removeEventListener('playing', onPlaying)
      boundAudio.removeEventListener('pause', onPause)
      boundAudio.removeEventListener('ended', onEnded)
      boundAudio.removeEventListener('waiting', onWaiting)
      boundAudio.removeEventListener('error', onError)
      boundAudio.removeEventListener('timeupdate', onTimeUpdate)
    }

    boundAudio = audio
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('error', onError)
    audio.addEventListener('timeupdate', onTimeUpdate)
  }

  function onLoadedMetadata() {
    if (!boundAudio) return
    syncTimes(boundAudio)
    ready.value = true
  }

  function onCanPlay() {
    isLoading.value = false
  }

  function onPlaying() {
    isPlaying.value = true
    isLoading.value = false
    if (boundAudio) startPoll(boundAudio)
  }

  function onPause() {
    isPlaying.value = false
    clearPoll()
    if (boundAudio) syncTimes(boundAudio)
  }

  function onEnded() {
    isPlaying.value = false
    clearPoll()
    if (boundAudio) {
      syncTimes(boundAudio)
      currentTime.value = duration.value
    }
  }

  function onWaiting() {
    isLoading.value = true
  }

  function clearBrokenSource(audio: HTMLAudioElement) {
    audio.removeAttribute('src')
    audio.load()
  }

  function onError() {
    isLoading.value = false
    isPlaying.value = false
    if (activeId.value) {
      error.value = 'Preview unavailable'
    }
  }

  function onTimeUpdate() {
    if (boundAudio) syncTimes(boundAudio)
  }

  async function play(id: string) {
    const audio = ensureAudio()
    bindAudio(audio)
    playAbort?.abort()
    playAbort = new AbortController()
    const { signal } = playAbort
    const generation = ++playGeneration
    const url = previewUrl(id)
    const sameSource = audio.src === new URL(url, window.location.origin).href
    const isStale = () => generation !== playGeneration

    activeId.value = id
    ready.value = false
    isLoading.value = true
    error.value = null

    try {
      if (!sameSource) {
        currentTime.value = 0
        duration.value = durationById[id] ?? 0
        audio.src = url
        audio.load()
        await waitForCanPlay(audio, signal)
        if (isStale()) return
      }

      await audio.play()
    }
    catch (err) {
      if (isStale() || isAbortError(err)) return
      isLoading.value = false
      isPlaying.value = false
      error.value = 'Preview unavailable'
      clearBrokenSource(audio)
    }
  }

  function pause() {
    sharedAudio?.pause()
  }

  async function toggle(id: string) {
    if (activeId.value === id && isPlaying.value) {
      pause()
      return
    }
    await play(id)
  }

  function seek(seconds: number) {
    if (!sharedAudio) return
    const clamped = Math.max(0, Math.min(seconds, duration.value || seconds))
    sharedAudio.currentTime = clamped
    currentTime.value = clamped
  }

  function destroy() {
    clearPoll()
    playAbort?.abort()
    playAbort = null
    playGeneration += 1
    if (boundAudio) {
      boundAudio.pause()
      boundAudio.removeAttribute('src')
      boundAudio.load()
      boundAudio.removeEventListener('loadedmetadata', onLoadedMetadata)
      boundAudio.removeEventListener('canplay', onCanPlay)
      boundAudio.removeEventListener('playing', onPlaying)
      boundAudio.removeEventListener('pause', onPause)
      boundAudio.removeEventListener('ended', onEnded)
      boundAudio.removeEventListener('waiting', onWaiting)
      boundAudio.removeEventListener('error', onError)
      boundAudio.removeEventListener('timeupdate', onTimeUpdate)
      boundAudio = null
    }
    sharedAudio = null
    ready.value = false
    activeId.value = null
    isPlaying.value = false
    isLoading.value = false
    error.value = null
    currentTime.value = 0
    duration.value = 0
    for (const key of Object.keys(durationById)) {
      delete durationById[key]
    }
  }

  return {
    activeId,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    durationById,
    ready,
    error,
    play,
    pause,
    toggle,
    seek,
    destroy,
  }
}
