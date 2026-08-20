import { detectPwaInstallPlatform } from '~/composables/usePwaInstall'

export type ToastEdge = 'top' | 'bottom'
export type ToastAlign = 'start' | 'center' | 'end'

export type ToastPlacement = {
  edge: ToastEdge
  align: ToastAlign
}

export type ToastAddedPayload = ToastPlacement & {
  kind: 'added'
  trackTitle: string
  cardTitle: string
}

export type ToastDuplicatePayload = ToastPlacement & {
  kind: 'duplicate'
  trackTitle: string
}

export type ToastErrorPayload = ToastPlacement & {
  kind: 'error'
  message: string
}

export type ToastInstallHelpPayload = ToastPlacement & {
  kind: 'install-help'
}

export type ToastPayload =
  | ToastAddedPayload
  | ToastDuplicatePayload
  | ToastErrorPayload
  | ToastInstallHelpPayload

/** Client-only timer handle — never touched during SSR. */
const clientTimer: { id: ReturnType<typeof setTimeout> | null } = { id: null }

/**
 * iOS: top (Share / home indicator). Everyone else: bottom-end
 * (desktop corner; phone is full-width). Callers can pass a patch to override.
 */
export function defaultToastPlacement(patch?: Partial<ToastPlacement>): ToastPlacement {
  return {
    edge: detectPwaInstallPlatform() === 'ios' ? 'top' : 'bottom',
    align: 'end',
    ...patch,
  }
}

/**
 * Shared toast — top/bottom tray notifications.
 * State uses Nuxt `useState` so it stays per-request on SSR and shared in the client app.
 * Phone ignores `align` (full width); sm+ honors corner placement.
 */
export function useToast() {
  const open = useState('toast-open', () => false)
  const payload = useState<ToastPayload | null>('toast-payload', () => null)
  const seq = useState('toast-seq', () => 0)
  const persistent = useState('toast-persistent', () => false)

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
    persistent.value = durationMs <= 0
    open.value = true
    if (!import.meta.client) return
    if (durationMs <= 0) return
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
      ...defaultToastPlacement(),
    }
    scheduleAutoClose(durationMs)
  }

  function showDuplicateTrack(trackTitle: string, durationMs = 4800) {
    payload.value = {
      kind: 'duplicate',
      trackTitle: trackTitle.trim() || 'Track',
      ...defaultToastPlacement(),
    }
    scheduleAutoClose(durationMs)
  }

  /** Technical errors stay until dismissed (durationMs <= 0). */
  function showError(message: string, durationMs = 0) {
    const text = message.trim()
    if (!text) return
    payload.value = {
      kind: 'error',
      message: text,
      ...defaultToastPlacement(),
    }
    scheduleAutoClose(durationMs)
  }

  function showInstallHelp() {
    payload.value = {
      kind: 'install-help',
      ...defaultToastPlacement(),
    }
    scheduleAutoClose(0)
  }

  return {
    open,
    payload,
    showAddedToCard,
    showDuplicateTrack,
    showError,
    showInstallHelp,
    persistent,
    dismiss,
  }
}
