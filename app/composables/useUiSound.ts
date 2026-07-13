import { ref, readonly } from 'vue'
import type { UiSoundId, UiSoundVariantPrefix } from '~/utils/uiSoundCatalog'
import {
  type UiSoundEvent,
  isUiSoundLoopEvent,
  resolveUiSoundEvent,
} from '~/utils/uiSoundRegistry'
import { getUiSoundPlayer } from '~/utils/uiSoundPlayer'

const MUTE_STORAGE_KEY = 'yoto-cards:ui-sounds-muted'

const muted = ref(false)
const volume = ref(1)
let initialized = false

function readStoredMuted(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(MUTE_STORAGE_KEY) === '1'
}

function writeStoredMuted(value: boolean) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(MUTE_STORAGE_KEY, value ? '1' : '0')
}

function ensureInitialized() {
  if (initialized || import.meta.server) return
  initialized = true
  muted.value = readStoredMuted()
  getUiSoundPlayer().setMuted(muted.value)
  getUiSoundPlayer().setVolume(volume.value)
}

export function useUiSound() {
  ensureInitialized()

  const player = getUiSoundPlayer()

  function play(id: UiSoundId, gain = 1) {
    player.play(id, { gain })
  }

  function playRandom(prefix: UiSoundVariantPrefix, gain = 1) {
    player.playRandom(prefix, { gain })
  }

  function playOneShot(id: UiSoundId, gain = 1) {
    player.playOneShot(id, { gain })
  }

  function playEvent(event: UiSoundEvent) {
    const resolved = resolveUiSoundEvent(event)
    if (isUiSoundLoopEvent(event)) {
      player.startLoop(resolved.id, { gain: resolved.gain })
      return
    }
    if (resolved.oneShot) {
      player.playOneShot(resolved.id, { gain: resolved.gain })
      return
    }
    player.play(resolved.id, { gain: resolved.gain })
  }

  function startLoopEvent(event: UiSoundEvent) {
    const resolved = resolveUiSoundEvent(event)
    player.startLoop(resolved.id, { gain: resolved.gain })
  }

  function stopLoopEvent(event: UiSoundEvent) {
    const resolved = resolveUiSoundEvent(event)
    player.stopLoop(resolved.id)
  }

  function startLoop(id: UiSoundId, gain = 1) {
    player.startLoop(id, { gain })
  }

  function stopLoop(id: UiSoundId) {
    player.stopLoop(id)
  }

  function stopAll() {
    player.stopAll()
  }

  function setMuted(value: boolean) {
    muted.value = value
    writeStoredMuted(value)
    player.setMuted(value)
  }

  function setVolume(value: number) {
    volume.value = Math.max(0, Math.min(1, value))
    player.setVolume(volume.value)
  }

  function toggleMuted() {
    setMuted(!muted.value)
    return muted.value
  }

  return {
    play,
    playOneShot,
    playRandom,
    playEvent,
    startLoopEvent,
    stopLoopEvent,
    startLoop,
    stopLoop,
    stopAll,
    setMuted,
    setVolume,
    toggleMuted,
    muted: readonly(muted),
    volume: readonly(volume),
  }
}
