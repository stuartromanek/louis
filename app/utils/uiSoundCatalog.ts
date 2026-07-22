export const UI_SOUND_IDS = [
  'button',
  'caution',
  'celebration',
  'disabled',
  'louis',
  'notification',
  'progress_loop',
  'ringtone_loop',
  'select',
  'swipe_01',
  'swipe_02',
  'swipe_03',
  'swipe_04',
  'swipe_05',
  'tap_01',
  'tap_02',
  'tap_03',
  'tap_04',
  'tap_05',
  'toggle_off',
  'toggle_on',
  'transition_down',
  'transition_up',
  'type_01',
  'type_02',
  'type_03',
  'type_04',
  'type_05',
] as const

export type UiSoundId = (typeof UI_SOUND_IDS)[number]

export type UiSoundVariantPrefix = 'tap' | 'swipe' | 'type'

export const UI_SOUND_CATALOG = Object.fromEntries(
  UI_SOUND_IDS.map(id => [id, `/sound/${id}.wav`]),
) as Record<UiSoundId, string>

export const UI_SOUND_LOOP_IDS = new Set<UiSoundId>([
  'progress_loop',
  'ringtone_loop',
])

/** Optional per-file gain for louder/shorter source assets (0–1). */
export const UI_SOUND_GAIN: Partial<Record<UiSoundId, number>> = {
  celebration: 0.85,
  notification: 0.7,
  caution: 0.85,
}

export function uiSoundGain(id: UiSoundId): number {
  return UI_SOUND_GAIN[id] ?? 1
}

export function uiSoundPath(id: UiSoundId): string {
  return UI_SOUND_CATALOG[id]
}

export function uiSoundVariants(prefix: UiSoundVariantPrefix): UiSoundId[] {
  return UI_SOUND_IDS.filter(id => id.startsWith(`${prefix}_`))
}

export function pickRandomUiSound(ids: readonly UiSoundId[]): UiSoundId {
  return ids[Math.floor(Math.random() * ids.length)]!
}
