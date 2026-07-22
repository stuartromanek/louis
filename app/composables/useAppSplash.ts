const SPLASH_SEEN_KEY = 'louis.splash.seen'
const SPLASH_PENDING_CLASS = 'app-splash-pending'

function readSeen(): boolean {
  if (typeof sessionStorage === 'undefined') return true
  return sessionStorage.getItem(SPLASH_SEEN_KEY) === '1'
}

function writeSeen() {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(SPLASH_SEEN_KEY, '1')
}

function readSplashDebug(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('splash') === 'debug'
}

function setSplashPendingClass(on: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle(SPLASH_PENDING_CLASS, on)
}

export function useAppSplash() {
  /** True only after client has read sessionStorage (avoids SSR mismatch). */
  const splashBootstrapped = ref(false)
  const shouldShowSplash = ref(false)
  /** `?splash=debug` — replay every refresh, stay on splash for refining. */
  const splashDebug = ref(false)

  /** Hold auth gate / cover until splash decision + playback finish. */
  const splashHoldsGate = computed(
    () => !splashBootstrapped.value || shouldShowSplash.value,
  )

  onMounted(() => {
    splashDebug.value = readSplashDebug()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    shouldShowSplash.value = splashDebug.value || (!reduced && !readSeen())
    splashBootstrapped.value = true
    setSplashPendingClass(splashHoldsGate.value)
  })

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
