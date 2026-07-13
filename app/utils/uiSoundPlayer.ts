import {
  type UiSoundId,
  type UiSoundVariantPrefix,
  UI_SOUND_LOOP_IDS,
  pickRandomUiSound,
  uiSoundGain,
  uiSoundPath,
  uiSoundVariants,
} from './uiSoundCatalog'

const POOL_SIZE = 3

export type UiSoundPlayOptions = {
  /** Gain multiplied with master volume (0–1). */
  gain?: number
}

class UiSoundPlayer {
  private muted = false
  private volume = 1
  private pools = new Map<UiSoundId, HTMLAudioElement[]>()
  private poolIndex = new Map<UiSoundId, number>()
  private loops = new Map<UiSoundId, HTMLAudioElement>()

  setMuted(muted: boolean) {
    this.muted = muted
    if (muted) {
      this.stopAll()
    }
  }

  isMuted(): boolean {
    return this.muted
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume))
  }

  getVolume(): number {
    return this.volume
  }

  play(id: UiSoundId, options?: UiSoundPlayOptions): void {
    if (this.muted || typeof Audio === 'undefined') return
    if (UI_SOUND_LOOP_IDS.has(id)) {
      this.startLoop(id, options)
      return
    }

    this.playOneShot(id, options)
  }

  playOneShot(id: UiSoundId, options?: UiSoundPlayOptions): void {
    if (this.muted || typeof Audio === 'undefined') return

    const audio = this.borrowAudio(id)
    audio.loop = false
    audio.currentTime = 0
    audio.volume = this.effectiveVolume(id, options?.gain)
    void audio.play().catch(() => {})
  }

  playRandom(prefix: UiSoundVariantPrefix, options?: UiSoundPlayOptions): void {
    const variants = uiSoundVariants(prefix)
    if (variants.length === 0) return
    this.play(pickRandomUiSound(variants), options)
  }

  startLoop(id: UiSoundId, options?: UiSoundPlayOptions): void {
    if (this.muted || typeof Audio === 'undefined') return
    if (!UI_SOUND_LOOP_IDS.has(id)) {
      this.play(id, options)
      return
    }

    this.stopLoop(id)

    const audio = new Audio(uiSoundPath(id))
    audio.loop = true
    audio.volume = this.effectiveVolume(id, options?.gain)
    this.loops.set(id, audio)
    void audio.play().catch(() => {})
  }

  stopLoop(id: UiSoundId): void {
    const audio = this.loops.get(id)
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    this.loops.delete(id)
  }

  stopAll(): void {
    for (const audio of this.loops.values()) {
      audio.pause()
      audio.currentTime = 0
    }
    this.loops.clear()

    for (const elements of this.pools.values()) {
      for (const audio of elements) {
        audio.pause()
        audio.currentTime = 0
      }
    }
  }

  private effectiveVolume(id: UiSoundId, gain = 1): number {
    return Math.max(0, Math.min(1, this.volume * gain * uiSoundGain(id)))
  }

  private borrowAudio(id: UiSoundId): HTMLAudioElement {
    let pool = this.pools.get(id)
    if (!pool) {
      pool = Array.from({ length: POOL_SIZE }, () => {
        const audio = new Audio(uiSoundPath(id))
        audio.preload = 'auto'
        return audio
      })
      this.pools.set(id, pool)
      this.poolIndex.set(id, 0)
    }

    const index = this.poolIndex.get(id) ?? 0
    const audio = pool[index]!
    this.poolIndex.set(id, (index + 1) % pool.length)
    return audio
  }
}

let player: UiSoundPlayer | null = null

export function getUiSoundPlayer(): UiSoundPlayer {
  if (!player) {
    player = new UiSoundPlayer()
  }
  return player
}

export function resetUiSoundPlayerForTests(): void {
  player?.stopAll()
  player = null
}
