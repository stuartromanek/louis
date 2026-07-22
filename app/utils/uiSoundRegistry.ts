import type { UiSoundId } from './uiSoundCatalog'
import { uiSoundVariants } from './uiSoundCatalog'

export type UiSoundEvent =
  | 'buttonClick'
  | 'buttonPrimary'
  | 'select'
  | 'disabled'
  | 'drop'
  | 'saveComplete'
  | 'saveError'
  | 'toggleOn'
  | 'toggleOff'
  | 'progressLoop'
  | 'notification'
  | 'type'
  | 'cardHover'
  | 'chipHover'
  | 'removeTrack'
  | 'resetPlaylist'
  | 'playlistReveal'
  | 'playlistConceal'
  | 'reorderSwipe'
  | 'loadMoreClick'
  | 'loadMoreComplete'
  | 'authGateShow'
  | 'splashCue'
  | 'authConnected'

export type UiSoundRegistryConfig = {
  sounds: UiSoundId | readonly UiSoundId[]
  /** Event gain multiplied with master and per-file gain (0–1). */
  volume?: number
  /** Play a loop asset once without repeating. */
  oneShot?: boolean
}

export const UI_SOUND_REGISTRY: Record<UiSoundEvent, UiSoundRegistryConfig> = {
  buttonClick: { sounds: uiSoundVariants('tap'), volume: 0.75 },
  buttonPrimary: { sounds: 'button', volume: 0.85 },
  select: { sounds: 'select', volume: 0.85 },
  disabled: { sounds: 'disabled', volume: 0.8 },
  drop: { sounds: 'swipe_03', volume: 0.75 },
  saveComplete: { sounds: 'celebration', volume: 1 },
  saveError: { sounds: 'caution', volume: 0.85 },
  toggleOn: { sounds: 'toggle_on', volume: 0.85 },
  toggleOff: { sounds: 'toggle_off', volume: 0.85 },
  progressLoop: { sounds: 'progress_loop', volume: 0.6 },
  notification: { sounds: 'notification', volume: 0.75 },
  type: { sounds: uiSoundVariants('type'), volume: 0.45 },
  cardHover: { sounds: uiSoundVariants('swipe'), volume: 0.2 },
  chipHover: { sounds: uiSoundVariants('tap'), volume: 0.5 },
  removeTrack: { sounds: 'transition_down', volume: 0.85 },
  resetPlaylist: { sounds: 'transition_up', volume: 0.85 },
  playlistReveal: { sounds: 'transition_up', volume: 0.85 },
  playlistConceal: { sounds: 'transition_down', volume: 0.85 },
  reorderSwipe: { sounds: uiSoundVariants('swipe'), volume: 0.35 },
  loadMoreClick: { sounds: 'button', volume: 0.85 },
  loadMoreComplete: { sounds: 'ringtone_loop', volume: 0.8, oneShot: true },
  authGateShow: { sounds: 'ringtone_loop', volume: 0.8, oneShot: true },
  splashCue: { sounds: 'louis', volume: 0.9 },
  authConnected: { sounds: 'celebration', volume: 1 },
}

export type ResolvedUiSound = {
  id: UiSoundId
  /** Event-level gain (excludes master and per-file gain). */
  gain: number
  oneShot?: boolean
}

function pickSound(
  sounds: UiSoundId | readonly UiSoundId[],
): UiSoundId {
  if (Array.isArray(sounds)) {
    return sounds[Math.floor(Math.random() * sounds.length)]!
  }
  return sounds
}

export function resolveUiSoundEvent(event: UiSoundEvent): ResolvedUiSound {
  const config = UI_SOUND_REGISTRY[event]
  return {
    id: pickSound(config.sounds),
    gain: config.volume ?? 1,
    oneShot: config.oneShot,
  }
}

export function isUiSoundLoopEvent(event: UiSoundEvent): boolean {
  return event === 'progressLoop'
}
