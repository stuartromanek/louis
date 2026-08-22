import type { InjectionKey, Ref } from 'vue'

export interface TrackTrimEditorShell {
  open: Ref<boolean>
  trackId: Ref<string | null>
  returnFocusEl: Ref<HTMLElement | null>
  openForTrack: (trackId: string) => void
  close: () => void
  restoreFocus: () => void
}

export const TRACK_TRIM_EDITOR_KEY: InjectionKey<TrackTrimEditorShell> = Symbol('trackTrimEditor')

export function useTrackTrimEditorShell(): TrackTrimEditorShell {
  const open = ref(false)
  const trackId = ref<string | null>(null)
  const returnFocusEl = ref<HTMLElement | null>(null)

  function openForTrack(id: string) {
    const active = document.activeElement
    returnFocusEl.value = active instanceof HTMLElement ? active : null
    trackId.value = id
    open.value = true
  }

  function close() {
    open.value = false
    trackId.value = null
  }

  function restoreFocus() {
    const el = returnFocusEl.value
    returnFocusEl.value = null
    if (el && typeof el.focus === 'function' && document.contains(el)) {
      el.focus()
    }
  }

  return { open, trackId, returnFocusEl, openForTrack, close, restoreFocus }
}
