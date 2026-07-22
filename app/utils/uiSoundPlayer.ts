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
  /** True after a play() succeeded under a user gesture (browser autoplay policy). */
  private unlocked = false

  setMuted(muted: boolean) {
    this.muted = muted
    if (muted) {
      this.stopAll()
    }
  }

  isMuted(): boolean {
    return this.muted
  }

  isUnlocked(): boolean {
    return this.unlocked
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume))
  }

  getVolume(): number {
    return this.volume
  }

  /** Warm decode buffers so the first real play is snappy after unlock. */
  preload(id: UiSoundId): void {
    if (typeof Audio === 'undefined') return
    this.borrowAudio(id)
  }

  /**
   * Attempt to satisfy the browser autoplay gesture requirement.
   * Call from a pointer/key handler. Returns whether playback is allowed.
   */
  async unlock(id?: UiSoundId): Promise<boolean> {
    if (this.unlocked) return true
    if (typeof Audio === 'undefined') return false

    const audio = id
      ? this.borrowAudio(id)
      : new Audio(
          'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=',
        )
    const previousVolume = audio.volume
    audio.muted = true
    audio.volume = 0
    try {
      await audio.play()
      audio.pause()
      audio.currentTime = 0
      this.unlocked = true
      return true
    }
    catch {
      return false
    }
    finally {
      audio.muted = false
      audio.volume = id ? this.effectiveVolume(id) : previousVolume
    }
  }

  play(id: UiSoundId, options?: UiSoundPlayOptions): void {
    if (this.muted || typeof Audio === 'undefined') return
    if (UI_SOUND_LOOP_IDS.has(id)) {
      this.startLoop(id, options)
      return
    }

    void this.tryPlayOneShot(id, options)
  }

  playOneShot(id: UiSoundId, options?: UiSoundPlayOptions): void {
    void this.tryPlayOneShot(id, options)
  }

  /** Play once; resolves true if the browser allowed playback. */
  async tryPlayOneShot(id: UiSoundId, options?: UiSoundPlayOptions): Promise<boolean> {
    if (this.muted || typeof Audio === 'undefined') return false

    const audio = this.borrowAudio(id)
    audio.loop = false
    audio.muted = false
    audio.currentTime = 0
    audio.volume = this.effectiveVolume(id, options?.gain)
    try {
      await audio.play()
      this.unlocked = true
      return true
    }
    catch {
      return false
    }
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
