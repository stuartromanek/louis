/**
 * Keep `--app-vvh` in sync with the visible viewport.
 * Mobile browser chrome often overlays the page until scroll; sizing the
 * shell to visualViewport (with an svh CSS fallback) keeps UI out from under
 * the URL bar.
 */
export function useAppViewportHeight() {
  function sync() {
    if (!import.meta.client) return
    const h = window.visualViewport?.height ?? window.innerHeight
    if (!Number.isFinite(h) || h <= 0) return
    document.documentElement.style.setProperty('--app-vvh', `${Math.round(h)}px`)
  }

  onMounted(() => {
    sync()
    window.visualViewport?.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
  })

  onBeforeUnmount(() => {
    window.visualViewport?.removeEventListener('resize', sync)
    window.visualViewport?.removeEventListener('scroll', sync)
    window.removeEventListener('resize', sync)
  })

  return { sync }
}
