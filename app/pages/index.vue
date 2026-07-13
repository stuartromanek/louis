<template>
  <div
    class="h-screen overflow-hidden min-h-0"
    :inert="authGateBlocksApp || undefined"
  >
    <DragDropProvider
      :plugins="configurePlaylistDndPlugins"
      @drag-start="onDragStart"
      @drag-over="onDragOver"
      @drag-end="onDragEnd"
    >
      <AppMainLayout
        :playlist-count="playlistCountLabel"
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
    <YotoAuthGate @update:blocking="authGateBlocksApp = $event" />
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

const yoto = useYotoMyo()
provide(YOTO_MYO_KEY, yoto)

const editor = useMyoEditor()
provide(MYO_EDITOR_KEY, editor)

const { playEvent } = useUiSound()

const { playlist, isPlaylistLocked, selectedCardId, cardTitle } = editor

const myoCountLabel = ref('')
const authGateBlocksApp = ref(false)
const scrollToVideoId = ref<string | null>(null)
let lastReorderIndex: number | null = null

const playlistCountLabel = computed(() => {
  const n = playlist.value.length
  return `${n} ${n === 1 ? 'track' : 'tracks'}`
})

const playlistTitle = computed(() => {
  if (!selectedCardId.value || !cardTitle.value.trim()) return 'Playlist'
  return `Playlist - ${cardTitle.value.trim()}`
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
