export const YOUTUBE_AUDIO_PLAYER_KEY = Symbol('youtubeAudioPlayer')

export type YoutubeAudioPlayerApi = {
  activeId: Ref<string | null>
  isPlaying: Ref<boolean>
  isLoading: Ref<boolean>
  currentTime: Ref<number>
  duration: Ref<number>
  ready: Ref<boolean>
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

export function useYoutubeAudioPlayer(): YoutubeAudioPlayerApi {
  const activeId = ref<string | null>(null)
  const isPlaying = ref(false)
  const isLoading = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const ready = ref(false)

  let pollId: ReturnType<typeof setInterval> | null = null
  let boundAudio: HTMLAudioElement | null = null

  function clearPoll() {
    if (pollId !== null) {
      clearInterval(pollId)
      pollId = null
    }
  }

  function syncTimes(audio: HTMLAudioElement) {
    currentTime.value = audio.currentTime || 0
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      duration.value = audio.duration
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

  function onError() {
    isLoading.value = false
    isPlaying.value = false
  }

  function onTimeUpdate() {
    if (boundAudio) syncTimes(boundAudio)
  }

  async function play(id: string) {
    const audio = ensureAudio()
    bindAudio(audio)
    const url = previewUrl(id)
    const sameSource = audio.src === new URL(url, window.location.origin).href

    activeId.value = id
    ready.value = false
    isLoading.value = true

    if (!sameSource) {
      currentTime.value = 0
      duration.value = 0
      audio.src = url
      audio.load()
    }

    try {
      await audio.play()
    }
    catch (error) {
      isLoading.value = false
      throw error
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
    currentTime.value = 0
    duration.value = 0
  }

  return {
    activeId,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    ready,
    play,
    pause,
    toggle,
    seek,
    destroy,
  }
}
