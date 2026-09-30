const SPLASH_SEEN_KEY = 'louis.splash.seen'
const SPLASH_PENDING_CLASS = 'app-splash-pending'
/** TEMP: replay splash on every refresh while iterating on it. */
const FORCE_SPLASH_EVERY_REFRESH = true

function readSeen(): boolean {
  if (typeof sessionStorage === 'undefined') return true
  return sessionStorage.getItem(SPLASH_SEEN_KEY) === '1'
}

function writeSeen() {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(SPLASH_SEEN_KEY, '1')
}

function queryIsSplashDebug(value: unknown): boolean {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'debug'
}

function setSplashPendingClass(on: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle(SPLASH_PENDING_CLASS, on)
}

export function useAppSplash() {
  const route = useRoute()
  /** True only after client has read sessionStorage (avoids SSR mismatch). */
  const splashBootstrapped = ref(false)
  const shouldShowSplash = ref(false)
  /** `?splash=debug` — replay every refresh, stay on splash for refining. */
  const splashDebug = ref(false)

  /** Hold auth gate / cover until splash decision + playback finish. */
  const splashHoldsGate = computed(
    () => !splashBootstrapped.value || shouldShowSplash.value,
  )

  function applyInitialSplash() {
    splashDebug.value = queryIsSplashDebug(route.query.splash)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    shouldShowSplash.value =
      FORCE_SPLASH_EVERY_REFRESH
      || splashDebug.value
      || (!reduced && !readSeen())
  }

  onMounted(() => {
    applyInitialSplash()
    splashBootstrapped.value = true
    setSplashPendingClass(splashHoldsGate.value)
  })

  watch(
    () => route.query.splash,
    () => {
      if (!splashBootstrapped.value) return
      const debug = queryIsSplashDebug(route.query.splash)
      splashDebug.value = debug
      shouldShowSplash.value = debug
    },
  )

  watch(splashHoldsGate, (holds) => {
    setSplashPendingClass(holds)
  })

  function markSplashSeen() {
    if (splashDebug.value) return
    writeSeen()
    shouldShowSplash.value = false
  }

  return {
    shouldShowSplash,
    splashHoldsGate,
    splashDebug,
    markSplashSeen,
  }
}
