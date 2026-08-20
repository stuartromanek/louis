import type { InjectionKey, Ref } from 'vue'
import type { YoutubeVideoSummary } from '~/components/youtube-picker/types'

export type MobileEditorTab = 'search' | 'library'
export type MobileLibraryMode = 'grid' | 'detail'

export type MobileEditorChrome = {
  activeTab: Ref<MobileEditorTab>
  libraryMode: Ref<MobileLibraryMode>
  addDrawerVideos: Ref<YoutubeVideoSummary[]>
  isPhone: Ref<boolean>
  goToTab: (tab: MobileEditorTab) => void
  openPlaylist: () => void
  backToLibrary: () => void
  openAddDrawer: (videos: YoutubeVideoSummary | YoutubeVideoSummary[]) => void
  closeAddDrawer: () => void
}

export const MOBILE_EDITOR_CHROME_KEY: InjectionKey<MobileEditorChrome> = Symbol('mobileEditorChrome')

const PHONE_MQ = '(max-width: 599px)'

export function useMobileEditorChrome(): MobileEditorChrome {
  const activeTab = ref<MobileEditorTab>('search')
  const libraryMode = ref<MobileLibraryMode>('grid')
  const addDrawerVideos = ref<YoutubeVideoSummary[]>([])
  const isPhone = ref(false)

  function goToTab(tab: MobileEditorTab) {
    activeTab.value = tab
    if (tab === 'search') {
      // Keep libraryMode so returning to Library restores detail vs grid.
    }
  }

  function openPlaylist() {
    activeTab.value = 'library'
    libraryMode.value = 'detail'
  }

  function backToLibrary() {
    libraryMode.value = 'grid'
    activeTab.value = 'library'
  }

  function openAddDrawer(videos: YoutubeVideoSummary | YoutubeVideoSummary[]) {
    addDrawerVideos.value = Array.isArray(videos) ? videos : [videos]
  }

  function closeAddDrawer() {
    addDrawerVideos.value = []
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
    addDrawerVideos,
    isPhone,
    goToTab,
    openPlaylist,
    backToLibrary,
    openAddDrawer,
    closeAddDrawer,
  }
}
