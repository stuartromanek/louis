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

const open = ref(false)
const payload = ref<MobileToastPayload | null>(null)
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null
let seq = 0

function clearAutoClose() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer)
    autoCloseTimer = null
  }
}

function dismiss() {
  clearAutoClose()
  open.value = false
}

function scheduleAutoClose(durationMs: number) {
  clearAutoClose()
  seq += 1
  const id = seq
  open.value = true
  autoCloseTimer = setTimeout(() => {
    if (id !== seq) return
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

/**
 * Singleton mobile toast — top tray notifications (phone only at call sites).
 */
export function useMobileToast() {
  return {
    open,
    payload,
    showAddedToCard,
    showError,
    dismiss,
  }
}
