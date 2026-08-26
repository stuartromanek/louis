<template>
  <div class="app-shell">
    <!-- inert on the editor only — overlays (setup/splash/gates) stay interactive. -->
    <div
      class="app-shell__main"
      :inert="mainContentInert || undefined"
    >
      <DragDropProvider
        :plugins="configurePlaylistDndPlugins"
        @drag-start="onDragStart"
        @drag-over="onDragOver"
        @drag-end="onDragEnd"
      >
        <AppMainLayout
          :playlist-title="playlistTitle"
          :playlists-title="playlistsTitle"
        >
          <template #youtube>
            <YoutubePicker embedded />
          </template>

          <template #myo>
            <YotoMyo embedded />
          </template>

          <template #myo-header>
            <button
              v-if="connected && (status === 'idle' || status === 'error')"
              type="button"
              class="maru-button maru-button--sm typetester-inline-search-btn text-maru-black bg-maru-turquoise-light"
              :disabled="isPlaylistLocked"
              @click="onStartNewPlaylist"
            >
              <span class="maru-button__label">New</span>
            </button>
          </template>

          <template #playlist-header>
            <PlaylistHeaderMenu />
          </template>

          <template #playlist>
            <YoutubePlaylist
              :scroll-to-video-id="scrollToVideoId"
              @scroll-to-complete="scrollToVideoId = null"
            />
          </template>

          <template #playlist-footer>
            <PlaylistPanelFooter />
          </template>

          <template #phone-library>
            <MobileLibraryView />
          </template>

          <template #toolbar>
            <AppStatusBar />
          </template>

          <template #footer>
            <AppDevToolsStrip />
          </template>
        </AppMainLayout>
        <MobileAddToPlaylistDrawer />
        <ToastHost />
      </DragDropProvider>
    </div>
    <!-- Same bg as splash; covers first paint until splash + desktop setup finish. -->
    <div
      v-if="appBootHold"
      class="app-splash-cover"
      aria-hidden="true"
    />
    <AppSplash
      v-if="shouldShowSplash"
      :debug="splashDebug"
      @done="markSplashSeen"
    />
    <Teleport to="body">
      <DesktopSetupScreen
        v-if="showDesktopSetup"
        @complete="onDesktopSetupComplete"
      />
    </Teleport>
    <YotoAuthGate
      :paused="appBootHold || welcomeOpen"
      @update:blocking="authGateBlocksApp = $event"
    />
    <YotoConnectedModal
      :open="welcomeOpen"
      :paused="appBootHold"
      @update:blocking="welcomeBlocksApp = $event"
      @dismiss="onWelcomeDismiss"
    />
    <!-- Single prefs host (status bar + phone header both open via shell state). -->
    <UserPreferencesModal v-model:open="prefsOpen" />
    <TrackArtEditorModal
      v-model:open="trackArtOpen"
      v-model:track-id="trackArtTrackId"
    />
    <TrackTrimDialog
      v-model:open="trackTrimOpen"
      v-model:track-id="trackTrimTrackId"
    />
  </div>
</template>

<script setup lang="ts">
import { DragDropProvider, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/vue'
import { isSortable, isSortableOperation } from '@dnd-kit/vue/sortable'
import { videosToPlaylistTracks } from '~/components/playlist/types'
import type { YoutubeVideoSummary } from '~/components/youtube-picker/types'
import { videoResultKey } from '#shared/myo-editor/youtubePlaylistImport'
import { reorderPlaylistBlocks, trackIndexForBlock } from '#shared/myo-editor/splitTrack'
import { classifyInsertTracksOutcome } from '#shared/myo-editor/standalonePlaylist'
import {
  OVERFLOW_TOAST_TEST_MESSAGE,
  OVERFLOW_TOAST_TEST_TITLE,
  useLeftoverOutcomeFixtures,
} from '~/components/playlist/leftoverOutcomeFixtures'
import { useSelectedResultTracks } from '~/components/youtube-picker/useYoutubePicker'
import {
  PLAYLIST_DROPZONE_ID,
  configurePlaylistDndPlugins,
  type DndItemData,
} from '~/components/playlist/dnd'
import YoutubePlaylist from '~/components/playlist/YoutubePlaylist.vue'
import PlaylistPanelFooter from '~/components/playlist/PlaylistPanelFooter.vue'
import PlaylistHeaderMenu from '~/components/playlist/PlaylistHeaderMenu.vue'
import AppMainLayout from '~/components/layout/AppMainLayout.vue'
import { useMyoEditor } from '~/components/myo-editor/useMyoEditor'
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { useYotoMyo } from '~/components/yoto-myo/useYotoMyo'
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'
import AppStatusBar from '~/components/layout/AppStatusBar.vue'
import AppDevToolsStrip from '~/components/dev/AppDevToolsStrip.vue'
import UserPreferencesModal from '~/components/layout/UserPreferencesModal.vue'
import TrackArtEditorModal from '~/components/track-art/TrackArtEditorModal.vue'
import TrackTrimDialog from '~/components/track-trim/TrackTrimDialog.vue'
import YotoAuthGate from '~/components/yoto-myo/YotoAuthGate.vue'
import YotoConnectedModal from '~/components/yoto-myo/YotoConnectedModal.vue'
import AppSplash from '~/components/splash/AppSplash.vue'
import DesktopSetupScreen from '~/components/splash/DesktopSetupScreen.vue'
import MobileLibraryView from '~/components/layout/MobileLibraryView.vue'
import MobileAddToPlaylistDrawer from '~/components/layout/MobileAddToPlaylistDrawer.vue'
import ToastHost from '~/components/ui/ToastHost.vue'
import {
  MOBILE_EDITOR_CHROME_KEY,
  useMobileEditorChrome,
} from '~/composables/useMobileEditorChrome'
import {
  TRACK_ART_EDITOR_KEY,
  useTrackArtEditorShell,
} from '~/composables/useTrackArtEditor'
import {
  TRACK_TRIM_EDITOR_KEY,
  useTrackTrimEditorShell,
} from '~/composables/useTrackTrimEditor'

const yoto = useYotoMyo()
provide(YOTO_MYO_KEY, yoto)

const editor = useMyoEditor({
  onPlaylistCreated: (cardId) => {
    yoto.rememberCreatedCard({ cardId, title: editor.cardTitle.value })
    void yoto.refresh({ quiet: true })
  },
  onPlaylistRenamed: (cardId, title) => {
    yoto.rememberCreatedCard({ cardId, title })
  },
  onPlaylistDeleted: (cardId) => {
    yoto.forgetCard(cardId)
    void yoto.refresh({ quiet: true })
  },
  onPlaylistCoverChanged: (cardId, coverUrl) => {
    yoto.updateCardCover(cardId, coverUrl)
  },
  onPlaylistSaved: (cardId, stats) => {
    yoto.updateCardStats(cardId, stats)
  },
})
provide(MYO_EDITOR_KEY, editor)

const mobileChrome = useMobileEditorChrome()
provide(MOBILE_EDITOR_CHROME_KEY, mobileChrome)

const trackArtEditor = useTrackArtEditorShell()
provide(TRACK_ART_EDITOR_KEY, trackArtEditor)
const trackArtOpen = trackArtEditor.open
const trackArtTrackId = trackArtEditor.trackId

const trackTrimEditor = useTrackTrimEditorShell()
provide(TRACK_TRIM_EDITOR_KEY, trackTrimEditor)
const trackTrimOpen = trackTrimEditor.open
const trackTrimTrackId = trackTrimEditor.trackId

const route = useRoute()
const router = useRouter()

const { playEvent } = useUiSound()
const { showDuplicateTrack, showError } = useToast()
const leftoverFixtures = useLeftoverOutcomeFixtures()

watch(
  () => leftoverFixtures.overflowToast.value,
  (on) => {
    if (on) showError(OVERFLOW_TOAST_TEST_MESSAGE, 0, OVERFLOW_TOAST_TEST_TITLE)
  },
  { immediate: true },
)
const { clear: clearResultSelection, isSelected, setInFlightKeys, clearInFlight } = useYoutubeResultSelection()
const selectedResultTracks = useSelectedResultTracks()
const { shouldShowSplash, splashHoldsGate, splashDebug, markSplashSeen } = useAppSplash()
const { open: prefsOpen } = usePreferencesShell()
const { isDesktop, getConfig, desktopPrefsDebug } = useDesktopHost()

const { playlist, isPlaylistLocked, selectedCardId, cardTitle, isNewPlaylist, canAcceptTracks } = editor
const { connected, status, cards, cardsLoading } = yoto

const playlistsTitle = computed(() => {
  if (!connected.value || status.value !== 'idle' || cardsLoading.value) return 'Playlists'
  return `Playlists (${cards.value.length})`
})

const authGateBlocksApp = ref(false)
const welcomeBlocksApp = ref(false)
const welcomeOpen = ref(false)
const scrollToVideoId = ref<string | null>(null)
const desktopConfigChecked = ref(false)
const needsDesktopSetup = ref(false)
let lastReorderIndex: number | null = null
let welcomeHandled = false

const appBootHold = computed(
  () =>
    splashHoldsGate.value
    || needsDesktopSetup.value
    || (isDesktop.value && !desktopConfigChecked.value),
)

const showDesktopSetup = computed(
  () => needsDesktopSetup.value && !splashHoldsGate.value && desktopConfigChecked.value,
)

/** Block editor interaction while a gate/setup owns the screen — not the shell root. */
const mainContentInert = computed(
  () => authGateBlocksApp.value || welcomeBlocksApp.value || appBootHold.value || trackArtOpen.value || trackTrimOpen.value,
)

async function refreshDesktopSetupNeeded() {
  if (!isDesktop.value) {
    needsDesktopSetup.value = false
    desktopConfigChecked.value = true
    return
  }
  try {
    const config = await getConfig()
    const forceQuery = route.query.desktopSetup === '1' && desktopPrefsDebug.value
    needsDesktopSetup.value = forceQuery
      || !config.yotoClientId.trim()
  }
  catch {
    needsDesktopSetup.value = true
  }
  finally {
    desktopConfigChecked.value = true
  }
  if (route.query.desktopSetup === '1') {
    void clearDesktopSetupQuery()
  }
}

function onDesktopSetupComplete() {
  needsDesktopSetup.value = false
}

async function clearYotoConnectedQuery() {
  if (route.query.yoto !== 'connected') return
  const nextQuery = { ...route.query }
  delete nextQuery.yoto
  await router.replace({ query: nextQuery })
}

async function clearDesktopSetupQuery() {
  if (route.query.desktopSetup !== '1') return
  const nextQuery = { ...route.query }
  delete nextQuery.desktopSetup
  await router.replace({ query: nextQuery })
}

function onWelcomeDismiss() {
  welcomeOpen.value = false
  void clearYotoConnectedQuery()
}

watch(
  isDesktop,
  () => {
    desktopConfigChecked.value = false
    void refreshDesktopSetupNeeded()
  },
  { immediate: true },
)

watch(
  () => route.query.desktopSetup,
  (value) => {
    if (value === '1') void refreshDesktopSetupNeeded()
  },
)

watch(
  [() => route.query.yoto, connected, status, appBootHold],
  ([yotoFlag]) => {
    if (welcomeHandled) return
    if (yotoFlag !== 'connected') return
    if (appBootHold.value) return
    if (status.value === 'loading') return

    if (!connected.value) {
      welcomeHandled = true
      void clearYotoConnectedQuery()
      return
    }

    welcomeHandled = true
    welcomeOpen.value = true
    void clearYotoConnectedQuery()
  },
  { immediate: true },
)

const playlistTitle = computed(() => {
  if (isNewPlaylist.value) return cardTitle.value.trim() || 'New playlist'
  if (!selectedCardId.value || !cardTitle.value.trim()) return 'Playlist'
  return cardTitle.value.trim()
})

function onStartNewPlaylist() {
  if (isPlaylistLocked.value) {
    playEvent('disabled')
    return
  }
  if (!editor.startNewPlaylist()) {
    playEvent('disabled')
    return
  }
  if (selectedResultTracks.value.length > 0) {
    editor.queuePendingCreateTracks(selectedResultTracks.value)
  }
  playEvent('buttonClick')
}

function getItemData(entity: { data?: unknown } | null | undefined): DndItemData | null {
  const data = entity?.data
  if (!data || typeof data !== 'object') return null
  if (!('type' in data)) return null
  return data as DndItemData
}

function applyResultDrop(videos: YoutubeVideoSummary[], sourceTitle: string, atIndex?: number) {
  const tracks = videosToPlaylistTracks(videos)
  const result = editor.insertTracks(tracks, atIndex)
  if (!result.ok) {
    playEvent('disabled')
    showError(result.message)
    return
  }

  const outcome = classifyInsertTracksOutcome(result)
  if (result.added > 0) {
    playEvent('drop')
    if (result.firstAddedId) scrollToVideoId.value = result.firstAddedId
    if (videos.length > 1 || isSelected(videoResultKey(videos[0]!))) {
      clearResultSelection()
    }
  }

  if (outcome.kind === 'mixed' || outcome.kind === 'overflow') {
    showError(outcome.message, 0, outcome.title)
    return
  }

  if (outcome.kind === 'duplicate') {
    showDuplicateTrack(sourceTitle)
  }
}

function onDragStart(event: DragStartEvent) {
  lastReorderIndex = null
  const source = event.operation.source
  if (!source) return

  const sourceData = getItemData(source)
  if (sourceData?.type === 'result') {
    const videos = sourceData.videos?.length ? sourceData.videos : [sourceData.video]
    if (videos.length > 1) {
      setInFlightKeys(videos.map(video => videoResultKey(video)))
    }
    return
  }

  if (isPlaylistLocked.value) return

  if (!isSortable(source)) return
  if (sourceData?.type !== 'playlist') return

  lastReorderIndex = source.index
}

function onDragOver(event: DragOverEvent) {
  if (isPlaylistLocked.value) return

  const { operation } = event
  const source = operation.source
  if (!source || !isSortable(source) || !isSortableOperation(operation)) return

  const sourceData = getItemData(source)
  if (sourceData?.type !== 'playlist') return

  const currentIndex = source.index
  if (lastReorderIndex === null) {
    lastReorderIndex = source.initialIndex
  }

  if (currentIndex !== lastReorderIndex) {
    playEvent('reorderSwipe')
    lastReorderIndex = currentIndex
  }
}

function onDragEnd(event: DragEndEvent) {
  lastReorderIndex = null
  clearInFlight()
  if (event.canceled || isPlaylistLocked.value) return

  const { operation } = event
  const source = operation.source
  const target = operation.target
  if (!source) return

  const sourceData = getItemData(source)

  if (sourceData?.type === 'playlist' && isSortableOperation(operation) && isSortable(source)) {
    const fromIndex = source.initialIndex
    const toIndex = source.index

    if (fromIndex !== toIndex) {
      playlist.value = reorderPlaylistBlocks(playlist.value, fromIndex, toIndex)
      playEvent('drop')
    }
    return
  }

  if (sourceData?.type === 'result') {
    if (!canAcceptTracks.value) {
      playEvent('disabled')
      return
    }

    const videos = sourceData.videos?.length ? sourceData.videos : [sourceData.video]
    if (!target) return

    if (target.id === PLAYLIST_DROPZONE_ID) {
      applyResultDrop(videos, sourceData.video.title)
      return
    }

    if (isSortable(target)) {
      applyResultDrop(
        videos,
        sourceData.video.title,
        trackIndexForBlock(playlist.value, target.index),
      )
    }
  }
}
</script>
