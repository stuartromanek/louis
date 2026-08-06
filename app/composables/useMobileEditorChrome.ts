import type { InjectionKey, Ref } from 'vue'
import type { YoutubeVideoSummary } from '~/components/youtube-picker/types'

export type MobileEditorTab = 'search' | 'library'
export type MobileLibraryMode = 'grid' | 'card'

export type MobileEditorChrome = {
  activeTab: Ref<MobileEditorTab>
  libraryMode: Ref<MobileLibraryMode>
  addDrawerVideo: Ref<YoutubeVideoSummary | null>
  isPhone: Ref<boolean>
  goToTab: (tab: MobileEditorTab) => void
  openCard: () => void
  backToLibrary: () => void
  openAddDrawer: (video: YoutubeVideoSummary) => void
  closeAddDrawer: () => void
}

export const MOBILE_EDITOR_CHROME_KEY: InjectionKey<MobileEditorChrome> = Symbol('mobileEditorChrome')

const PHONE_MQ = '(max-width: 599px)'

export function useMobileEditorChrome(): MobileEditorChrome {
  const activeTab = ref<MobileEditorTab>('search')
  const libraryMode = ref<MobileLibraryMode>('grid')
  const addDrawerVideo = ref<YoutubeVideoSummary | null>(null)
  const isPhone = ref(false)

  function goToTab(tab: MobileEditorTab) {
    activeTab.value = tab
    if (tab === 'search') {
      // Keep libraryMode so returning to Library restores card vs grid.
    }
  }

  function openCard() {
    activeTab.value = 'library'
    libraryMode.value = 'card'
  }

  function backToLibrary() {
    libraryMode.value = 'grid'
    activeTab.value = 'library'
  }

  function openAddDrawer(video: YoutubeVideoSummary) {
    addDrawerVideo.value = video
  }

  function closeAddDrawer() {
    addDrawerVideo.value = null
  }

  let mq: MediaQueryList | null = null
  const update = () => {
    if (!mq) return
    const wasPhone = isPhone.value
    isPhone.value = mq.matches
    if (wasPhone && !isPhone.value) {
      closeAddDrawer()
    }
  }

  onMounted(() => {
    mq = window.matchMedia(PHONE_MQ)
    isPhone.value = mq.matches
    mq.addEventListener('change', update)
  })

  onBeforeUnmount(() => {
    mq?.removeEventListener('change', update)
    mq = null
  })

  return {
    activeTab,
    libraryMode,
    addDrawerVideo,
    isPhone,
    goToTab,
    openCard,
    backToLibrary,
    openAddDrawer,
    closeAddDrawer,
  }
}
