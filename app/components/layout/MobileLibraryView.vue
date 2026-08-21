<script setup lang="ts">
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'
import {
  MOBILE_EDITOR_CHROME_KEY,
} from '~/composables/useMobileEditorChrome'
import type { YotoMyoCard as YotoMyoCardType } from '~/components/yoto-myo/types'
import type { PlaylistTrack } from '~/components/playlist/types'
import { movePlaylistBlock, playlistBlocks, removeTrackOrGroup, trackIndexForBlock, blockIndexForTrack, splitGroupSourceTitle, splitPartNumberLabel, splitTrackAccessibleName } from '#shared/myo-editor/splitTrack'
import PlaylistSaveProgress from '~/components/playlist/PlaylistSaveProgress.vue'
import PlaylistEmptyState from '~/components/playlist/PlaylistEmptyState.vue'
import MobilePlaylistCapacity from '~/components/playlist/MobilePlaylistCapacity.vue'
import Tray from '~/components/ui/Tray.vue'
import {
  SAVE_PROGRESS_TEST_FIXTURE,
  useSaveProgressTestMode,
} from '~/components/playlist/saveProgressTestFixture'
import { useLeftoverOutcomeFixtures } from '~/components/playlist/leftoverOutcomeFixtures'
import {
  getPlaylistCapacitySnapshot,
  YOTO_MYO_TRACK_COUNT_MESSAGE,
} from '#shared/myo-editor/yotoMyoLimits'
import {
  getStandalonePlaylistValidationError,
  PLAYLIST_NOT_ON_YOTO_YET_MESSAGE,
} from '#shared/myo-editor/standalonePlaylist'
import { formatDurationSeconds } from '#shared/myo-editor/youtubeDuration'
import TrackArtThumb from '~/components/track-art/TrackArtThumb.vue'
import { TRACK_ART_EDITOR_KEY } from '~/composables/useTrackArtEditor'
import PlaylistUpdatePrompt from '~/components/playlist/PlaylistUpdatePrompt.vue'
import { usePlaylistEnterStagger } from '~/components/playlist/usePlaylistEnterStagger'

const yoto = inject(YOTO_MYO_KEY)
const editor = inject(MYO_EDITOR_KEY)
const chrome = inject(MOBILE_EDITOR_CHROME_KEY)
const artEditor = inject(TRACK_ART_EDITOR_KEY)

if (!yoto || !editor || !chrome) {
  throw new Error('MobileLibraryView requires YOTO_MYO_KEY, MYO_EDITOR_KEY, and MOBILE_EDITOR_CHROME_KEY')
}

const { playEvent } = useUiSound()
const saveProgressTestMode = useSaveProgressTestMode()
const leftoverFixtures = useLeftoverOutcomeFixtures()
const uncertainRefreshBusy = ref(false)

const { cards, status, cardsLoading, errorMessage, connected } = yoto
const {
  playlist,
  selectedCardId,
  cardTitle,
  loading,
  isPlaylistLocked,
  isDirty,
  isPodcast,
  isNewPlaylist,
  createOutcomeUncertain,
  selectCard,
  startNewPlaylist,
  resetChanges,
  requestUpdate,
  cancelUpdatePrompt,
  confirmUpdatePrompt,
  keepVolumeAsIs,
  saveProgress,
  isKnownPodcast,
} = editor

const { enterIndex } = usePlaylistEnterStagger(playlist)

const { libraryMode, openPlaylist, backToLibrary } = chrome

const CARD_PLACEHOLDERS = [0, 1, 2, 3, 4, 5, 6, 7]

const selectedCard = computed(
  () => cards.value.find(c => c.cardId === selectedCardId.value) ?? null,
)

const displayedSaveProgress = computed(() =>
  saveProgressTestMode.value ? SAVE_PROGRESS_TEST_FIXTURE : saveProgress.value,
)

const hasActiveSaves = computed(
  () => saveProgressTestMode.value || editor.hasActiveSaves.value,
)

const updateInProgress = computed(() => Boolean(displayedSaveProgress.value))

const isNamingPlaylist = computed(
  () => isNewPlaylist.value && !cardTitle.value.trim(),
)

const isRenamingPlaylist = computed(
  () => editor.playlistManagePrompt.value === 'rename',
)

const isDeletingPlaylist = computed(
  () => editor.playlistManagePrompt.value === 'delete',
)

const showNameForm = computed(() => isNamingPlaylist.value || isRenamingPlaylist.value)

/** Armed only after in-flight saves finish — matches Menu bubble latch. */
const canCreate = computed(
  () => !getStandalonePlaylistValidationError(cardTitle.value, playlist.value),
)

const canUpdate = computed(
  () => Boolean(
    !loading.value
    && !isPodcast.value
    && !hasActiveSaves.value
    && (
      isNewPlaylist.value
        ? canCreate.value && !createOutcomeUncertain.value
        : selectedCardId.value && isDirty.value
    ),
  ),
)

const askingUpdatePrompt = computed(
  () => leftoverFixtures.createPrompts.value
    || (
      Boolean(editor.updatePrompt.value)
      && !editor.saveStarting.value
      && editor.updatePromptSurface.value === 'footer'
    ),
)

const updatePromptKind = computed(() =>
  leftoverFixtures.createPrompts.value ? 'capacity' : editor.updatePrompt.value,
)

const updatePromptIntent = computed(() =>
  leftoverFixtures.createPrompts.value || isNewPlaylist.value ? 'create' : 'update',
)

const showUncertainCover = computed(
  () => leftoverFixtures.uncertainCreate.value || editor.showUncertainCreateCover.value,
)

const primaryLabel = computed(() => {
  if (hasActiveSaves.value) return isNewPlaylist.value ? 'Creating…' : 'Updating…'
  return isNewPlaylist.value ? 'Create' : 'Update'
})

const capacity = computed(() => getPlaylistCapacitySnapshot(playlist.value))

const overTrackLimit = computed(
  () => capacity.value.trackCount > capacity.value.trackMax,
)

const footerHint = computed(() => {
  if (isPodcast.value) return 'Podcasts cannot be edited yet.'
  if (createOutcomeUncertain.value) return 'Check Playlists before trying again.'
  if (overTrackLimit.value) return YOTO_MYO_TRACK_COUNT_MESSAGE
  if (isNewPlaylist.value && cardTitle.value.trim()) return PLAYLIST_NOT_ON_YOTO_YET_MESSAGE
  return ''
})

const canReset = computed(
  () => Boolean(isDirty.value && !loading.value && !isPlaylistLocked.value && !saveProgressTestMode.value),
)

const tracksLocked = computed(
  () => isPlaylistLocked.value || saveProgressTestMode.value || isPodcast.value,
)

async function onSelectCard(card: YotoMyoCardType) {
  playEvent('buttonClick')
  await selectCard(card)
  if (selectedCardId.value === card.cardId) {
    openPlaylist()
  }
}

function onStartNewPlaylist() {
  if (loading.value || isPlaylistLocked.value) {
    playEvent('disabled')
    return
  }
  if (!startNewPlaylist()) {
    playEvent('disabled')
    return
  }
  playEvent('buttonClick')
  openPlaylist()
}

function onPromptCancel() {
  if (editor.saveStarting.value || editor.playlistManageBusy.value || uncertainRefreshBusy.value) return
  if (editor.playlistManagePrompt.value) {
    editor.cancelPlaylistManage()
    return
  }
  if (leftoverFixtures.createPrompts.value) return
  if (editor.updatePrompt.value) {
    cancelUpdatePrompt()
    return
  }
  if (showUncertainCover.value) {
    editor.dismissUncertainCreateCover()
  }
}

function onPromptKeep() {
  keepVolumeAsIs()
}

async function onPromptConfirm() {
  if (askingUpdatePrompt.value) {
    confirmUpdatePrompt()
    return
  }
  if (editor.playlistManagePrompt.value === 'delete') {
    const ok = await editor.confirmDelete()
    if (ok) backToLibrary()
    return
  }
  if (showUncertainCover.value) {
    if (uncertainRefreshBusy.value) return
    uncertainRefreshBusy.value = true
    try {
      await yoto.refresh({ quiet: true })
    }
    finally {
      uncertainRefreshBusy.value = false
    }
  }
}

function onReset() {
  if (!canReset.value) {
    playEvent('disabled')
    return
  }
  cancelUpdatePrompt()
  clearPendingRemoveTimer()
  pendingRemoveTrackId.value = null
  trackLeavePending.value = false
  playEvent('resetPlaylist')
  resetChanges()
}

function onUpdate() {
  if (!canUpdate.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonPrimary')
  requestUpdate('footer')
}

const playlistBlockList = computed(() => playlistBlocks(playlist.value))

function splitRowLabel(track: PlaylistTrack) {
  const part = splitPartNumberLabel(track.split?.index ?? 0)
  if (typeof track.duration !== 'number' || track.duration <= 0) return part
  return `${part} \u00B7 ${formatDurationSeconds(track.duration)}`
}

const menuBlockIndex = computed(() => {
  if (trackMenuIndex.value === null) return null
  return blockIndexForTrack(playlist.value, trackMenuIndex.value)
})

function moveTrack(index: number, delta: number) {
  if (tracksLocked.value) {
    playEvent('disabled')
    return
  }
  const fromBlock = blockIndexForTrack(playlist.value, index)
  const targetBlock = fromBlock + delta
  if (fromBlock < 0 || targetBlock < 0 || targetBlock >= playlistBlockList.value.length) {
    playEvent('disabled')
    return
  }
  const id = playlist.value[index]?.id
  playlist.value = movePlaylistBlock(playlist.value, index, delta)
  playEvent('reorderSwipe')
  if (id) {
    const nextIndex = playlist.value.findIndex(track => track.id === id)
    if (nextIndex >= 0) trackMenuIndex.value = nextIndex
  }
}

function removeTrack(id: string) {
  if (tracksLocked.value) {
    playEvent('disabled')
    return
  }
  playlist.value = removeTrackOrGroup(playlist.value, id)
  playEvent('chipHover')
}

const trackMenuIndex = ref<number | null>(null)
/** Track id to remove after the action tray finishes closing. */
const pendingRemoveTrackId = ref<string | null>(null)
/** Keep the list mounted while the last track’s leave animation runs. */
const trackLeavePending = ref(false)
let pendingRemoveTimer: ReturnType<typeof setTimeout> | null = null

const trackMenuOpen = computed({
  get: () => trackMenuIndex.value !== null,
  set: (open: boolean) => {
    if (!open) trackMenuIndex.value = null
  },
})

const menuTrack = computed(() => {
  const index = trackMenuIndex.value
  if (index === null) return null
  return playlist.value[index] ?? null
})

const menuTrackTitle = computed(() => {
  const track = menuTrack.value
  if (!track) return 'Track'
  return splitTrackAccessibleName(track)
})

const showTrackList = computed(
  () => !isRenamingPlaylist.value && (playlist.value.length > 0 || trackLeavePending.value),
)

/** 1-based index after Move up; null when move is unavailable. */
const moveUpBecomesTrack = computed(() => {
  const blockIndex = menuBlockIndex.value
  if (blockIndex === null || blockIndex <= 0) return null
  return trackIndexForBlock(playlist.value, blockIndex - 1) + 1
})

/** 1-based index after Move down; null when move is unavailable. */
const moveDownBecomesTrack = computed(() => {
  const blockIndex = menuBlockIndex.value
  if (blockIndex === null || blockIndex >= playlistBlockList.value.length - 1) return null
  const next = playlistBlockList.value[blockIndex + 1]
  if (!next) return null
  return trackIndexForBlock(playlist.value, blockIndex) + next.tracks.length + 1
})

const canMoveUp = computed(() => {
  const blockIndex = menuBlockIndex.value
  return blockIndex !== null && blockIndex > 0
})

const canMoveDown = computed(() => {
  const blockIndex = menuBlockIndex.value
  return blockIndex !== null && blockIndex < playlistBlockList.value.length - 1
})

function clearPendingRemoveTimer() {
  if (pendingRemoveTimer !== null) {
    clearTimeout(pendingRemoveTimer)
    pendingRemoveTimer = null
  }
}

function openTrackMenu(index: number) {
  if (tracksLocked.value) {
    playEvent('disabled')
    return
  }
  // Cancel a staged remove if the user opens another menu mid-sequence.
  clearPendingRemoveTimer()
  pendingRemoveTrackId.value = null
  playEvent('buttonClick')
  trackMenuIndex.value = index
}

function onMenuMove(delta: number) {
  const index = trackMenuIndex.value
  if (index === null) return
  moveTrack(index, delta)
}

function onMenuRemove() {
  const track = menuTrack.value
  if (!track || tracksLocked.value) return
  pendingRemoveTrackId.value = track.id
  // Close the tray first — remove runs after the veil clears (@close).
  trackMenuIndex.value = null
}

/** After tray exit: brief beat, then remove so the row exit is visible. */
function onTrackMenuClosed() {
  const id = pendingRemoveTrackId.value
  pendingRemoveTrackId.value = null
  if (!id) return

  const reduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const beatMs = reduced ? 0 : 120

  clearPendingRemoveTimer()
  pendingRemoveTimer = setTimeout(() => {
    pendingRemoveTimer = null
    if (tracksLocked.value) return
    trackLeavePending.value = true
    removeTrack(id)
  }, beatMs)
}

function onTrackListAfterLeave() {
  if (playlist.value.length === 0) {
    trackLeavePending.value = false
  }
}

const playlistMenuOpen = ref(false)

const playlistMenuDisabled = computed(() => Boolean(
  !selectedCardId.value
  || isPlaylistLocked.value
  || editor.saveStarting.value
  || editor.playlistManageBusy.value
  || editor.playlistManagePrompt.value,
))

function openPlaylistMenu() {
  if (playlistMenuDisabled.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonClick')
  trackMenuIndex.value = null
  playlistMenuOpen.value = true
}

function onPlaylistRename() {
  playEvent('buttonClick')
  playlistMenuOpen.value = false
  editor.startRename()
}

function onPlaylistDelete() {
  playEvent('buttonClick')
  playlistMenuOpen.value = false
  editor.startDelete()
}

watch(libraryMode, () => {
  clearPendingRemoveTimer()
  pendingRemoveTrackId.value = null
  trackLeavePending.value = false
  trackMenuIndex.value = null
  playlistMenuOpen.value = false
})

watch(tracksLocked, (locked) => {
  if (locked) {
    clearPendingRemoveTimer()
    pendingRemoveTrackId.value = null
    trackMenuIndex.value = null
    playlistMenuOpen.value = false
  }
})

onUnmounted(() => {
  clearPendingRemoveTimer()
})

onMounted(() => {
  if (isNewPlaylist.value) openPlaylist()
})
</script>

<template>
  <div class="mobile-library flex flex-col flex-1 min-h-0 h-full overflow-hidden">
    <!-- Grid -->
    <div
      v-if="libraryMode === 'grid'"
      class="flex flex-col flex-1 min-h-0 overflow-hidden"
    >
      <p
        v-if="status === 'loading'"
        class="empty-state flex-1 empty-state-meta"
      >
        Checking Yoto…
      </p>
      <p
        v-else-if="status === 'unconfigured' || status === 'error'"
        class="type-meta text-maru-red m-3 p-3 border-maru rounded-maru bg-maru-red-lighter"
      >
        {{ errorMessage }}
      </p>
      <div
        v-else-if="status === 'disconnected' || !connected"
        class="empty-state flex-1 gap-3"
      >
        <MaruEmoji name="Bear" size="lg" />
        <p class="empty-state-meta">
          Connect your Yoto account to load your playlists.
        </p>
      </div>
      <ul
        v-else-if="cardsLoading"
        class="mobile-library-grid list-none m-0 p-2 overflow-y-auto flex-1 min-h-0"
        aria-busy="true"
        aria-label="Loading playlists"
      >
        <li
          v-for="n in CARD_PLACEHOLDERS"
          :key="`ph-${n}`"
          aria-hidden="true"
        >
          <div class="mobile-library-tile mobile-library-tile--placeholder">
            <div class="mobile-library-tile__art-wrap">
              <div class="mobile-library-tile__art mobile-library-tile__art--empty library-placeholder__pulse" />
            </div>
            <span class="mobile-library-tile__title library-placeholder__title">&nbsp;</span>
          </div>
        </li>
      </ul>
      <ul
        v-else
        class="mobile-library-grid list-none m-0 p-2 overflow-y-auto flex-1 min-h-0"
        aria-label="Playlists"
      >
        <li>
          <button
            type="button"
            class="mobile-library-tile mobile-library-tile--new"
            :class="{ 'mobile-library-tile--selected': isNewPlaylist }"
            @click="onStartNewPlaylist"
          >
            <div class="mobile-library-tile__art-wrap">
              <div class="mobile-library-tile__art mobile-library-tile__art--empty">
                <MaruEmoji name="CardIndexDividers" size="lg" />
              </div>
            </div>
            <span class="mobile-library-tile__title font-maru-bold">New playlist</span>
          </button>
        </li>
        <li
          v-for="card in cards"
          :key="card.cardId"
        >
          <button
            type="button"
            class="mobile-library-tile"
            :class="{ 'mobile-library-tile--selected': selectedCardId === card.cardId }"
            @click="onSelectCard(card)"
          >
            <div class="mobile-library-tile__art-wrap">
              <img
                v-if="card.coverUrl"
                :src="card.coverUrl"
                :alt="card.title"
                class="mobile-library-tile__art"
                loading="lazy"
              >
              <div
                v-else
                class="mobile-library-tile__art mobile-library-tile__art--empty"
              >
                <MaruEmoji name="Bear" size="md" />
              </div>
              <span
                v-if="isKnownPodcast(card.cardId)"
                class="mobile-card-podcast-badge"
              >Podcast</span>
            </div>
            <span class="mobile-library-tile__title font-maru-bold">{{ card.title }}</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- Card detail -->
    <div
      v-else
      class="mobile-card-detail flex flex-col flex-1 min-h-0 overflow-hidden relative"
    >
      <div
        class="flex-1 min-h-0 overflow-y-auto px-2 pb-3"
        :class="{ 'mobile-card-detail__body--naming': showNameForm }"
      >
        <div
          class="mobile-card-detail__hero"
          :class="{ 'mobile-card-detail__hero--plain': showNameForm }"
        >
          <img
            v-if="!showNameForm && selectedCard?.coverUrl"
            :src="selectedCard.coverUrl"
            :alt="cardTitle || selectedCard.title"
            class="mobile-card-detail__art"
          >
          <div
            v-else
            class="mobile-card-detail__art mobile-card-detail__art--empty"
          >
            <MaruEmoji name="Bear" size="lg" />
          </div>
          <span
            v-if="isPodcast && !showNameForm"
            class="mobile-card-podcast-badge mobile-card-podcast-badge--detail"
          >Podcast</span>
        </div>

        <div
          v-if="!showNameForm"
          class="mobile-card-detail__title-row"
        >
          <h2 class="mobile-card-detail__title type-empty-title font-maru-bold text-pretty">
            {{ isNewPlaylist ? (cardTitle.trim() || 'New playlist') : (cardTitle || selectedCard?.title || 'Playlist') }}
          </h2>
          <MobilePlaylistCapacity />
        </div>

        <p
          v-if="footerHint"
          class="mobile-card-detail__hint font-maru-mono text-pretty"
          role="alert"
        >
          {{ footerHint }}
        </p>

        <div
          v-if="!showNameForm"
          class="mobile-card-detail__actions"
          :class="{ 'mobile-card-detail__actions--updating': updateInProgress || hasActiveSaves }"
        >
          <button
            v-if="!(updateInProgress || hasActiveSaves)"
            type="button"
            class="panel-footer-btn panel-footer-btn--short panel-footer-btn--secondary flex-1"
            :aria-disabled="!canReset"
            @click="onReset"
          >
            <span class="panel-footer-btn__label">Reset</span>
          </button>
          <button
            type="button"
            class="panel-footer-btn panel-footer-btn--short panel-footer-btn--primary flex-1"
            :class="{ 'panel-footer-btn--updating': updateInProgress || hasActiveSaves }"
            :aria-disabled="!canUpdate"
            :disabled="!canUpdate && !hasActiveSaves"
            @click="onUpdate"
          >
            <PlaylistSaveProgress
              v-if="displayedSaveProgress"
              class="mobile-card-detail__update-progress"
              :progress="displayedSaveProgress"
              variant="mobile"
            />
            <span
              v-else
              class="panel-footer-btn__label"
            >{{ primaryLabel }}</span>
          </button>
          <button
            v-if="selectedCardId && !(updateInProgress || hasActiveSaves)"
            type="button"
            class="panel-footer-btn panel-footer-btn--short panel-footer-btn--secondary mobile-card-detail__playlist-menu"
            aria-label="Playlist menu"
            aria-haspopup="dialog"
            :aria-expanded="playlistMenuOpen"
            :disabled="playlistMenuDisabled"
            @click="openPlaylistMenu"
          >
            <MaruEmoji
              name="CardFileBox"
              :size-rem="1.35"
            />
          </button>
        </div>

        <p
          v-if="loading && !isPlaylistLocked"
          class="empty-state-meta text-center py-6"
        >
          Loading playlist...
        </p>

        <TransitionGroup
          v-else-if="showTrackList"
          tag="ul"
          name="mobile-card-track"
          class="mobile-card-tracks list-none m-0 p-0 flex flex-col gap-2 mt-3"
          @after-leave="onTrackListAfterLeave"
        >
          <li
            v-for="block in playlistBlockList"
            :key="block.kind === 'split'
              ? `split:${block.tracks[0]?.split?.groupId ?? block.tracks[0]?.id}`
              : block.tracks[0]!.id"
            :class="block.kind === 'split'
              ? 'mobile-card-track-group border-maru rounded-maru overflow-hidden bg-maru-white'
              : 'mobile-card-track border-maru rounded-maru bg-maru-white'"
            :style="{ '--playlist-enter-i': enterIndex(block.tracks[0]!.id) }"
          >
            <header
              v-if="block.kind === 'split'"
              class="mobile-card-track-group__header border-maru-bottom bg-maru-yellow"
            >
              <h3 class="mobile-card-track__title font-maru-medium line-clamp-2 text-pretty min-w-0 flex-1">
                {{ splitGroupSourceTitle(block.tracks[0]!.title) }}
              </h3>
              <button
                type="button"
                class="mobile-card-track__menu shrink-0"
                :disabled="tracksLocked"
                :aria-label="`Track menu for ${splitGroupSourceTitle(block.tracks[0]!.title)}`"
                :aria-expanded="trackMenuIndex === playlist.findIndex(item => item.id === block.tracks[0]!.id)"
                aria-haspopup="dialog"
                @click="openTrackMenu(playlist.findIndex(item => item.id === block.tracks[0]!.id))"
              >
                <MaruEmoji
                  name="CardFileBox"
                  :size-rem="1.35"
                />
              </button>
            </header>
            <template
              v-for="track in block.tracks"
              :key="track.id"
            >
              <div
                class="mobile-card-track__inner"
                :class="{ 'mobile-card-track__inner--split': block.kind === 'split' }"
              >
                <div class="mobile-card-track__media mobile-card-track__media--art">
                  <TrackArtThumb
                    class="mobile-card-track__art-thumb"
                    :track="track"
                    :locked="tracksLocked"
                    size="md"
                    @edit="artEditor?.openForTrack(track.id)"
                  />
                </div>

                <div
                  class="mobile-card-track__copy"
                  :class="{ 'mobile-card-track__copy--split': block.kind === 'split' }"
                >
                  <template v-if="block.kind === 'split'">
                    <p class="mobile-card-track__title font-maru-medium truncate min-w-0 flex-1">
                      {{ splitRowLabel(track) }}
                    </p>
                    <span
                      v-if="track.split"
                      class="playlist-split-part playlist-split-part--inline type-caption font-maru-mono tabular-nums shrink-0"
                    >{{ track.split.index + 1 }}/{{ track.split.count }}</span>
                  </template>
                  <template v-else>
                    <p class="mobile-card-track__title font-maru-medium line-clamp-2 text-pretty min-w-0 flex-1">
                      {{ track.title }}
                    </p>
                    <p
                      v-if="track.duration"
                      class="mobile-card-track__meta type-meta-sm font-maru-mono tabular-nums text-maru-black/70"
                    >
                      {{ formatDurationSeconds(track.duration) }}
                    </p>
                  </template>
                </div>

                <button
                  v-if="block.kind !== 'split'"
                  type="button"
                  class="mobile-card-track__menu"
                  :disabled="tracksLocked"
                  :aria-label="`Track menu for ${track.title}`"
                  :aria-expanded="trackMenuIndex === playlist.findIndex(item => item.id === track.id)"
                  aria-haspopup="dialog"
                  @click="openTrackMenu(playlist.findIndex(item => item.id === track.id))"
                >
                  <MaruEmoji
                    name="CardFileBox"
                    :size-rem="1.35"
                  />
                </button>
              </div>
            </template>
          </li>
        </TransitionGroup>

        <PlaylistEmptyState
          v-else-if="!loading && showNameForm"
        />

        <p
          v-else-if="!loading"
          class="empty-state-meta text-center py-8"
        >
          <template v-if="isNewPlaylist">
            {{ PLAYLIST_NOT_ON_YOTO_YET_MESSAGE }} Add songs from Search, or paste a video, playlist, or channel URL.
          </template>
          <template v-else>
            No tracks yet. Add songs from Search, or paste a video, playlist, or channel URL.
          </template>
        </p>

        <Tray
          v-model:open="trackMenuOpen"
          role="menu"
          :aria-label="`Actions for ${menuTrackTitle}`"
          :title="menuTrackTitle"
          height="auto"
          @close="onTrackMenuClosed"
        >
          <div class="mobile-overflow-menu__list">
            <button
              type="button"
              class="mobile-overflow-menu__item mobile-card-track-menu__item--up"
              role="menuitem"
              :disabled="tracksLocked || !canMoveUp"
              :aria-label="moveUpBecomesTrack !== null ? `Move up. Becomes track ${moveUpBecomesTrack}` : 'Move up'"
              @click="onMenuMove(-1)"
            >
              <MaruEmoji
                name="RedTrianglePointedUp"
                size="md"
                class="mobile-overflow-menu__item-emoji"
              />
              <span class="mobile-overflow-menu__item-label">Move up</span>
              <span
                v-if="moveUpBecomesTrack !== null"
                class="mobile-overflow-menu__item-hint"
                aria-hidden="true"
              >Becomes track {{ moveUpBecomesTrack }}</span>
            </button>
            <button
              type="button"
              class="mobile-overflow-menu__item mobile-card-track-menu__item--down"
              role="menuitem"
              :disabled="tracksLocked || !canMoveDown"
              :aria-label="moveDownBecomesTrack !== null ? `Move down. Becomes track ${moveDownBecomesTrack}` : 'Move down'"
              @click="onMenuMove(1)"
            >
              <MaruEmoji
                name="RedTrianglePointedUp"
                size="md"
                class="mobile-overflow-menu__item-emoji mobile-card-track__btn-emoji--down"
              />
              <span class="mobile-overflow-menu__item-label">Move down</span>
              <span
                v-if="moveDownBecomesTrack !== null"
                class="mobile-overflow-menu__item-hint"
                aria-hidden="true"
              >Becomes track {{ moveDownBecomesTrack }}</span>
            </button>
            <button
              type="button"
              class="mobile-overflow-menu__item mobile-overflow-menu__item--signout"
              role="menuitem"
              :disabled="tracksLocked || !menuTrack"
              @click="onMenuRemove"
            >
              <MaruEmoji
                name="Fire"
                size="md"
                class="mobile-overflow-menu__item-emoji"
              />
              <span class="mobile-overflow-menu__item-label">{{
                menuTrack?.split ? 'Remove all parts' : 'Remove'
              }}</span>
            </button>
          </div>
        </Tray>

        <Tray
          v-model:open="playlistMenuOpen"
          role="menu"
          aria-label="Playlist actions"
          title="Playlist"
          height="auto"
        >
          <div class="mobile-overflow-menu__list">
            <button
              type="button"
              class="mobile-overflow-menu__item"
              role="menuitem"
              @click="onPlaylistRename"
            >
              <MaruEmoji
                name="Crayon"
                size="md"
                class="mobile-overflow-menu__item-emoji"
              />
              <span class="mobile-overflow-menu__item-label">Rename</span>
            </button>
            <button
              type="button"
              class="mobile-overflow-menu__item mobile-overflow-menu__item--signout"
              role="menuitem"
              @click="onPlaylistDelete"
            >
              <MaruEmoji
                name="Fire"
                size="md"
                class="mobile-overflow-menu__item-emoji"
              />
              <span class="mobile-overflow-menu__item-label">Delete</span>
            </button>
          </div>
        </Tray>
      </div>

      <PlaylistUpdatePrompt
        v-if="askingUpdatePrompt && updatePromptKind"
        :kind="updatePromptKind"
        surface="panel"
        id-prefix="mobile-card-update"
        :card-count="editor.updatePromptCardCount.value"
        :busy="editor.saveStarting.value"
        :intent="updatePromptIntent"
        @cancel="onPromptCancel"
        @keep="onPromptKeep"
        @confirm="onPromptConfirm"
      />
      <PlaylistUpdatePrompt
        v-else-if="isDeletingPlaylist"
        kind="delete"
        surface="panel"
        id-prefix="mobile-card-delete"
        :playlist-title="cardTitle"
        :busy="editor.playlistManageBusy.value"
        @cancel="onPromptCancel"
        @confirm="onPromptConfirm"
      />
      <PlaylistUpdatePrompt
        v-else-if="showUncertainCover"
        kind="uncertain"
        surface="panel"
        id-prefix="mobile-uncertain-create"
        :busy="uncertainRefreshBusy"
        @cancel="onPromptCancel"
        @confirm="onPromptConfirm"
      />
    </div>
  </div>
</template>
