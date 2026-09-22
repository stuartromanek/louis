/** localStorage key: last local calendar day the splash shout actually played. */
export const SPLASH_CUE_DAY_KEY = 'louis.splash.cue.day'

/** `YYYY-MM-DD` in the user's local timezone. */
export function splashCueLocalDay(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Whether the splash shout should play.
 * `force` is for `npm run dev` and `?splash=debug` so the cue is always audible while iterating.
 */
export function shouldPlaySplashCue(options: {
  force?: boolean
  storedDay?: string | null
  now?: Date
} = {}): boolean {
  if (options.force) return true
  return options.storedDay !== splashCueLocalDay(options.now)
}
