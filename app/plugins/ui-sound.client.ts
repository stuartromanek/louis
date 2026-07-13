import type { UiSoundEvent } from '~/utils/uiSoundRegistry'

type SoundDirectiveValue = UiSoundEvent | { event: UiSoundEvent, on?: keyof HTMLElementEventMap }

type SoundHandler = {
  listener: () => void
  on: keyof HTMLElementEventMap
}

function resolveBinding(value: SoundDirectiveValue | undefined): {
  event: UiSoundEvent
  on: keyof HTMLElementEventMap
} | null {
  if (!value) return null
  if (typeof value === 'string') {
    return { event: value, on: 'click' }
  }
  return {
    event: value.event,
    on: value.on ?? 'click',
  }
}

export default defineNuxtPlugin((nuxtApp) => {
  const handlers = new WeakMap<HTMLElement, SoundHandler>()

  function attach(el: HTMLElement, value: SoundDirectiveValue | undefined) {
    detach(el)

    const config = resolveBinding(value)
    if (!config) return

    const { playEvent } = useUiSound()
    const listener = () => {
      playEvent(config.event)
    }

    handlers.set(el, { listener, on: config.on })
    el.addEventListener(config.on, listener)
  }

  function detach(el: HTMLElement) {
    const existing = handlers.get(el)
    if (!existing) return
    el.removeEventListener(existing.on, existing.listener)
    handlers.delete(el)
  }

  nuxtApp.vueApp.directive('sound', {
    mounted(el, binding) {
      attach(el as HTMLElement, binding.value as SoundDirectiveValue | undefined)
    },
    updated(el, binding) {
      attach(el as HTMLElement, binding.value as SoundDirectiveValue | undefined)
    },
    unmounted(el) {
      detach(el as HTMLElement)
    },
  })
})
