<script setup lang="ts">
import { useDroppable } from '@dnd-kit/vue'
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'
import { PLAYLIST_DROPZONE_ID } from './dnd'
import PlaylistCardLoading from './PlaylistCardLoading.vue'
import PlaylistEmptyState from './PlaylistEmptyState.vue'
import PlaylistItem from './PlaylistItem.vue'
import PlaylistSaveProgress from './PlaylistSaveProgress.vue'
import {
  SAVE_PROGRESS_TEST_FIXTURE,
  useSaveProgressTestMode,
} from './saveProgressTestFixture'

const props = withDefaults(defineProps<{
  scrollToVideoId?: string | null
}>(), {
  scrollToVideoId: null,
})

const emit = defineEmits<{
  scrollToComplete: []
}>()

const editor = inject(MYO_EDITOR_KEY, null)
if (!editor) {
  throw new Error('YoutubePlaylist requires MYO_EDITOR_KEY provider')
}

const yoto = inject(YOTO_MYO_KEY, null)

const { playlist, isPlaylistLocked, saveProgress, loading, cardTitle, selectedCardId, clearSelection } = editor

const saveProgressTestMode = useSaveProgressTestMode()

const displayedSaveProgress = computed(() =>
  saveProgressTestMode.value ? SAVE_PROGRESS_TEST_FIXTURE : saveProgress.value,
)

const showSaveProgressOverlay = computed(() =>
  saveProgressTestMode.value || (isPlaylistLocked.value && !!saveProgress.value),
)

const isDropzoneLocked = computed(() => isPlaylistLocked.value || saveProgressTestMode.value)

const isYotoUnavailable = computed(() => {
  if (!yoto) return false

  return (
    yoto.status.value === 'disconnected'
    || yoto.status.value === 'unconfigured'
    || yoto.status.value === 'error'
    || !yoto.connected.value
  )
})

const isYotoLoading = computed(() => yoto?.status.value === 'loading')

const isYotoDisconnectGarage = ref(false)

const isYotoPlaylistBlocked = computed(
  () => isYotoUnavailable.value || isYotoLoading.value || isYotoDisconnectGarage.value,
)

const showPlaylistItems = computed(() => {
  if (isYotoDisconnectGarage.value) return true
  return !isYotoUnavailable.value && !isYotoLoading.value
})

const showEmptyState = computed(() => {
  if (isYotoDisconnectGarage.value) return false
  if (isYotoUnavailable.value || isYotoLoading.value) return false
  return playlist.value.length === 0
})

const isCardLoading = computed(() => loading.value && !isPlaylistLocked.value)

const CARD_LOADING_MIN_MS = 3000
const GARAGE_DOOR_MS = 520

type GarageDoorMode = 'card' | 'disconnect' | 'idle-disconnected' | null

const showCardLoadingGarage = ref(false)
const garageDoorShut = ref(false)
const garageDoorMode = ref<GarageDoorMode>(null)
let cardLoadingStartedAt = 0
let cardLoadingDismissTimer: ReturnType<typeof setTimeout> | null = null
let cardLoadingExitTimer: ReturnType<typeof setTimeout> | null = null

const isCardLoadingActive = computed(
  () => isCardLoading.value || showCardLoadingGarage.value,
)

const cardLoadingHeading = computed(() => {
  const name = cardTitle.value.trim()
  return name ? `Loading ${name}` : 'Loading'
})

const garageHeading = computed(() => cardLoadingHeading.value)

function showDisconnectedIdleGarage() {
  garageDoorMode.value = 'idle-disconnected'
  showCardLoadingGarage.value = true
  garageDoorShut.value = true
}

const { playEvent } = useUiSound()

function clearCardLoadingTimers() {
  if (cardLoadingDismissTimer) {
    clearTimeout(cardLoadingDismissTimer)
    cardLoadingDismissTimer = null
  }
  if (cardLoadingExitTimer) {
    clearTimeout(cardLoadingExitTimer)
    cardLoadingExitTimer = null
  }
}

function pullGarageDoorShut() {
  playEvent('playlistConceal')

  if (garageDoorShut.value) return

  nextTick(() => {
    requestAnimationFrame(() => {
      garageDoorShut.value = true
    })
  })
}

function showGarageDoor(mode: GarageDoorMode) {
  garageDoorMode.value = mode
  showCardLoadingGarage.value = true
  garageDoorShut.value = false
  pullGarageDoorShut()
}

function openGarageDoor() {
  garageDoorShut.value = false
  playEvent('playlistReveal')
}

function finishDisconnectGarage() {
  clearSelection(true)
  isYotoDisconnectGarage.value = false
  garageDoorMode.value = 'idle-disconnected'
}

function beginYotoDisconnectGarage() {
  clearCardLoadingTimers()
  isYotoDisconnectGarage.value = true

  if (showCardLoadingGarage.value && garageDoorShut.value) {
    garageDoorMode.value = 'disconnect'
    finishDisconnectGarage()
    return
  }

  showGarageDoor('disconnect')
}

function scheduleGarageDoorExit() {
  clearCardLoadingTimers()

  const elapsed = Date.now() - cardLoadingStartedAt
  const remaining = Math.max(0, CARD_LOADING_MIN_MS - elapsed)

  cardLoadingDismissTimer = setTimeout(() => {
    openGarageDoor()
    cardLoadingExitTimer = setTimeout(() => {
      showCardLoadingGarage.value = false
      garageDoorMode.value = null
      cardLoadingExitTimer = null
    }, GARAGE_DOOR_MS)
  }, remaining)
}

function onGarageDoorTransitionEnd(event: TransitionEvent) {
  if (event.propertyName !== 'transform') return

  if (garageDoorShut.value && garageDoorMode.value === 'disconnect') {
    finishDisconnectGarage()
    return
  }

  if (!garageDoorShut.value && showCardLoadingGarage.value) {
    if (cardLoadingExitTimer) {
      clearTimeout(cardLoadingExitTimer)
      cardLoadingExitTimer = null
    }
    showCardLoadingGarage.value = false
    garageDoorMode.value = null
  }
}

watch(isYotoUnavailable, (unavailable, wasUnavailable) => {
  if (!unavailable && wasUnavailable) {
    if (garageDoorMode.value === 'idle-disconnected') {
      showCardLoadingGarage.value = false
      garageDoorMode.value = null
      garageDoorShut.value = false
    }
    return
  }

  if (!unavailable || wasUnavailable) return

  const hadContent = playlist.value.length > 0 || Boolean(selectedCardId.value)
  if (!hadContent) {
    clearSelection(true)
    return
  }

  beginYotoDisconnectGarage()
})

watch(
  () => isYotoUnavailable.value && !isYotoLoading.value,
  (showIdle) => {
    if (!showIdle) return
    if (isYotoDisconnectGarage.value) return
    if (garageDoorMode.value === 'disconnect') return
    if (garageDoorMode.value === 'idle-disconnected') return

    showDisconnectedIdleGarage()
  },
  { immediate: true },
)

watch(isCardLoading, (loadingNow) => {
  if (loadingNow) {
    clearCardLoadingTimers()
    cardLoadingStartedAt = Date.now()

    if (!showCardLoadingGarage.value) {
      showGarageDoor('card')
      return
    }

    pullGarageDoorShut()
    return
  }

  if (showCardLoadingGarage.value && garageDoorMode.value === 'card') {
    scheduleGarageDoorExit()
  }
})

onUnmounted(() => {
  clearCardLoadingTimers()
})

const element = ref<HTMLElement | null>(null)
const { isDropTarget } = useDroppable({
  id: PLAYLIST_DROPZONE_ID,
  element,
  accept: ['result'],
  type: 'playlist-dropzone',
  disabled: computed(() => isDropzoneLocked.value || isCardLoadingActive.value || isYotoPlaylistBlocked.value),
})

function removeTrack(id: string) {
  if (isDropzoneLocked.value || isCardLoadingActive.value || isYotoPlaylistBlocked.value) return
  playEvent('removeTrack')
  playlist.value = playlist.value.filter(track => track.id !== id)
}

function isVisibleInScrollContainer(item: HTMLElement, container: HTMLElement) {
  const itemRect = item.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  return itemRect.top >= containerRect.top && itemRect.bottom <= containerRect.bottom
}

watch(() => props.scrollToVideoId, async (id) => {
  if (!id || !element.value) return

  await nextTick()

  const scrollRoot = element.value.querySelector<HTMLElement>('.playlist-dropzone__scroll')
  const searchRoot = scrollRoot ?? element.value

  const item = searchRoot.querySelector<HTMLElement>(
    `[data-playlist-video-id="${CSS.escape(id)}"]`,
  )
  if (!item) {
    emit('scrollToComplete')
    return
  }

  if (scrollRoot && !isVisibleInScrollContainer(item, scrollRoot)) {
    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  emit('scrollToComplete')
})
</script>

<template>
  <div
    ref="element"
    class="playlist-dropzone relative flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden transition-[background-color,box-shadow]"
    :class="[
      isDropTarget && !isDropzoneLocked && !isCardLoadingActive && !isYotoPlaylistBlocked ? 'bg-maru-green-light ring-2 ring-inset ring-maru-blue' : '',
      isDropzoneLocked ? 'playlist-dropzone--locked' : '',
      isCardLoadingActive ? 'playlist-dropzone--loading' : '',
    ]"
  >
    <div
      class="playlist-dropzone__scroll flex flex-col flex-1 min-h-0 overflow-y-auto p-3 sm:p-4"
      :class="isDropzoneLocked || isCardLoadingActive || isYotoPlaylistBlocked ? 'pointer-events-none select-none' : ''"
    >
      <TransitionGroup
        v-if="showPlaylistItems"
        tag="ol"
        name="playlist-track"
        class="playlist-items flex flex-col gap-1.5 list-none m-0 p-0"
      >
        <PlaylistItem
          v-for="(track, index) in playlist"
          :key="track.id"
          :track="track"
          :index="index"
          :locked="isDropzoneLocked"
          @remove="removeTrack"
        />
      </TransitionGroup>

      <PlaylistEmptyState
        v-if="showEmptyState"
        fill
      />
    </div>

    <div
      v-if="isYotoLoading"
      class="playlist-dropzone__lock absolute inset-0 z-10 flex h-full min-h-0 bg-maru-green-lighter"
      aria-live="polite"
      aria-busy="true"
    >
      <PlaylistCardLoading
        key="yoto-loading"
        heading="Loading"
        :show-label="true"
      />
    </div>

    <div
      v-if="showCardLoadingGarage"
      class="playlist-garage-door"
      :class="{
        'playlist-garage-door--shut': garageDoorShut,
        'playlist-garage-door--instant': garageDoorMode === 'idle-disconnected',
      }"
      aria-live="polite"
      :aria-busy="garageDoorMode === 'card' || garageDoorMode === 'disconnect'"
      @transitionend="onGarageDoorTransitionEnd"
    >
      <PlaylistCardLoading
        :key="garageDoorMode === 'card' ? (selectedCardId ?? 'loading') : 'disconnected'"
        :heading="garageHeading"
        :show-label="garageDoorMode === 'card'"
      />
    </div>

    <div
      v-if="showSaveProgressOverlay && displayedSaveProgress"
      class="playlist-dropzone__lock absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-maru-turquoise-light p-4 text-center"
      aria-live="polite"
      :aria-busy="!saveProgressTestMode"
    >
      <p
        v-if="saveProgressTestMode"
        class="font-maru-mono text-[10px] uppercase tracking-wide text-maru-black/50"
      >
        Test mode — ?testSaveProgress
      </p>
      <PlaylistSaveProgress
        :progress="displayedSaveProgress"
        variant="overlay"
      />
    </div>
  </div>
</template>
