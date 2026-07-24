import type { InjectionKey, Ref } from 'vue'

export type MobileEditorTab = 'search' | 'cards' | 'playlist'

export type MobileEditorChrome = {
  activeTab: Ref<MobileEditorTab>
  isPhone: Ref<boolean>
  goToTab: (tab: MobileEditorTab) => void
}

export const MOBILE_EDITOR_CHROME_KEY: InjectionKey<MobileEditorChrome> = Symbol('mobileEditorChrome')

/** Phone viewport matches Tailwind `max-sm` (< 600px). */
const PHONE_MQ = '(max-width: 599px)'

export function useMobileEditorChrome(): MobileEditorChrome {
  const activeTab = ref<MobileEditorTab>('search')
  const isPhone = ref(false)

  function goToTab(tab: MobileEditorTab) {
    activeTab.value = tab
  }

  let mq: MediaQueryList | null = null
  const update = () => {
    if (mq) isPhone.value = mq.matches
  }

  onMounted(() => {
    mq = window.matchMedia(PHONE_MQ)
    update()
    mq.addEventListener('change', update)
  })

  onBeforeUnmount(() => {
    mq?.removeEventListener('change', update)
    mq = null
  })

  return { activeTab, isPhone, goToTab }
}
