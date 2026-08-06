export type MobileToastAddedPayload = {
  kind: 'added'
  trackTitle: string
  cardTitle: string
}

export type MobileToastErrorPayload = {
  kind: 'error'
  message: string
}

export type MobileToastPayload = MobileToastAddedPayload | MobileToastErrorPayload

/** Client-only timer handle — never touched during SSR. */
const clientTimer: { id: ReturnType<typeof setTimeout> | null } = { id: null }

/**
 * Shared mobile toast — top tray notifications (phone only at call sites).
 * State uses Nuxt `useState` so it stays per-request on SSR and shared in the client app.
 */
export function useMobileToast() {
  const open = useState('mobile-toast-open', () => false)
  const payload = useState<MobileToastPayload | null>('mobile-toast-payload', () => null)
  const seq = useState('mobile-toast-seq', () => 0)

  function clearAutoClose() {
    if (!import.meta.client) return
    if (clientTimer.id) {
      clearTimeout(clientTimer.id)
      clientTimer.id = null
    }
  }

  function dismiss() {
    clearAutoClose()
    open.value = false
  }

  function scheduleAutoClose(durationMs: number) {
    clearAutoClose()
    seq.value += 1
    const id = seq.value
    open.value = true
    if (!import.meta.client) return
    clientTimer.id = setTimeout(() => {
      if (id !== seq.value) return
      dismiss()
    }, durationMs)
  }

  function showAddedToCard(trackTitle: string, cardTitle: string, durationMs = 6400) {
    payload.value = {
      kind: 'added',
      trackTitle: trackTitle.trim() || 'Track',
      cardTitle: cardTitle.trim() || 'card',
    }
    scheduleAutoClose(durationMs)
  }

  function showError(message: string, durationMs = 7000) {
    const text = message.trim()
    if (!text) return
    payload.value = {
      kind: 'error',
      message: text,
    }
    scheduleAutoClose(durationMs)
  }

  return {
    open,
    payload,
    showAddedToCard,
    showError,
    dismiss,
  }
}
