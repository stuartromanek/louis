<template>
  <div
    class="h-screen overflow-hidden min-h-0"
    :inert="authGateBlocksApp || welcomeBlocksApp || splashHoldsGate || undefined"
  >
    <DragDropProvider
      :plugins="configurePlaylistDndPlugins"
      @drag-start="onDragStart"
      @drag-over="onDragOver"
      @drag-end="onDragEnd"
    >
      <AppMainLayout
        :playlist-title="playlistTitle"
        :myo-count="myoCountLabel"
      >
        <template #youtube>
          <YoutubePicker embedded />
        </template>

        <template #myo>
          <YotoMyo embedded @update:count="myoCountLabel = $event" />
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

        <template #toolbar>
          <AppStatusBar />
        </template>

        <template #footer>
          <AppDevToolsStrip />
        </template>
      </AppMainLayout>
    </DragDropProvider>
    <!-- Same bg as splash; covers first paint until splash boots or is skipped. -->
    <div
      v-if="splashHoldsGate"
      class="app-splash-cover"
      aria-hidden="true"
    />
    <AppSplash
      v-if="shouldShowSplash"
      :debug="splashDebug"
      @done="markSplashSeen"
    />
    <YotoAuthGate
      :paused="splashHoldsGate || welcomeOpen"
      @update:blocking="authGateBlocksApp = $event"
    />
    <YotoConnectedModal
      :open="welcomeOpen"
      :paused="splashHoldsGate"
      @update:blocking="welcomeBlocksApp = $event"
      @dismiss="onWelcomeDismiss"
    />
  </div>
</template>

<script setup lang="ts">
import { DragDropProvider, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/vue'
import { isSortable, isSortableOperation } from '@dnd-kit/vue/sortable'
import type { PlaylistTrack } from '~/components/playlist/types'
import { pickerVideoToPlaylistTrack } from '~/components/playlist/types'
import {
  PLAYLIST_DROPZONE_ID,
  configurePlaylistDndPlugins,
  type DndItemData,
} from '~/components/playlist/dnd'
import YoutubePlaylist from '~/components/playlist/YoutubePlaylist.vue'
import PlaylistPanelFooter from '~/components/playlist/PlaylistPanelFooter.vue'
import AppMainLayout from '~/components/layout/AppMainLayout.vue'
import { useMyoEditor } from '~/components/myo-editor/useMyoEditor'
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { useYotoMyo } from '~/components/yoto-myo/useYotoMyo'
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'
import AppStatusBar from '~/components/layout/AppStatusBar.vue'
import AppDevToolsStrip from '~/components/dev/AppDevToolsStrip.vue'
import YotoAuthGate from '~/components/yoto-myo/YotoAuthGate.vue'
import YotoConnectedModal from '~/components/yoto-myo/YotoConnectedModal.vue'
import AppSplash from '~/components/splash/AppSplash.vue'

const yoto = useYotoMyo()
provide(YOTO_MYO_KEY, yoto)

const editor = useMyoEditor()
provide(MYO_EDITOR_KEY, editor)

const route = useRoute()
const router = useRouter()

const { playEvent } = useUiSound()
const { shouldShowSplash, splashHoldsGate, splashDebug, markSplashSeen } = useAppSplash()

const { playlist, isPlaylistLocked, selectedCardId, cardTitle } = editor
const { connected, status } = yoto

const myoCountLabel = ref('')
const authGateBlocksApp = ref(false)
const welcomeBlocksApp = ref(false)
const welcomeOpen = ref(false)
const scrollToVideoId = ref<string | null>(null)
let lastReorderIndex: number | null = null
let welcomeHandled = false

async function clearYotoConnectedQuery() {
  if (route.query.yoto !== 'connected') return
  const nextQuery = { ...route.query }
  delete nextQuery.yoto
  await router.replace({ query: nextQuery })
}

function onWelcomeDismiss() {
  welcomeOpen.value = false
  void clearYotoConnectedQuery()
}

watch(
  [() => route.query.yoto, connected, status, splashHoldsGate],
  ([yotoFlag]) => {
    if (welcomeHandled) return
    if (yotoFlag !== 'connected') return
    if (splashHoldsGate.value) return
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
  if (!selectedCardId.value || !cardTitle.value.trim()) return 'Playlist'
  return cardTitle.value.trim()
})

function getItemData(entity: { data?: unknown } | null | undefined): DndItemData | null {
  const data = entity?.data
  if (!data || typeof data !== 'object') return null
  if (!('type' in data)) return null
  return data as DndItemData
}

function insertTrack(track: PlaylistTrack, atIndex?: number): boolean {
  if (playlist.value.some(item => item.id === track.id)) return false

  if (atIndex === undefined || atIndex < 0 || atIndex >= playlist.value.length) {
    playlist.value = [...playlist.value, track]
    return true
  }

  const next = [...playlist.value]
  next.splice(atIndex, 0, track)
  playlist.value = next
  return true
}

function onDragStart(event: DragStartEvent) {
  lastReorderIndex = null
  if (isPlaylistLocked.value) return

  const source = event.operation.source
  if (!source || !isSortable(source)) return

  const sourceData = getItemData(source)
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
      playlist.value = moveItem(playlist.value, fromIndex, toIndex)
      playEvent('drop')
    }
    return
  }

  if (sourceData?.type === 'result') {
    if (!selectedCardId.value) {
      playEvent('disabled')
      return
    }

    const track = pickerVideoToPlaylistTrack(sourceData.video)
    if (!target) return

    if (target.id === PLAYLIST_DROPZONE_ID) {
      if (insertTrack(track)) {
        playEvent('drop')
        scrollToVideoId.value = track.id
      }
      return
    }

    if (isSortable(target)) {
      if (insertTrack(track, target.index)) {
        playEvent('drop')
        scrollToVideoId.value = track.id
      }
    }
  }
}
</script>
