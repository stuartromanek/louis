<script setup lang="ts">
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'
import {
  MOBILE_EDITOR_CHROME_KEY,
} from '~/composables/useMobileEditorChrome'
import type { YotoMyoCard as YotoMyoCardType } from '~/components/yoto-myo/types'
import { moveItem } from '~/utils/reorder'
import PlaylistSaveProgress from '~/components/playlist/PlaylistSaveProgress.vue'
import MobilePlaylistCapacity from '~/components/playlist/MobilePlaylistCapacity.vue'
import MobileTray from '~/components/ui/MobileTray.vue'
import {
  SAVE_PROGRESS_TEST_FIXTURE,
  useSaveProgressTestMode,
} from '~/components/playlist/saveProgressTestFixture'
import {
  getPlaylistCapacitySnapshot,
  YOTO_MYO_TRACK_COUNT_MESSAGE,
} from '#shared/myo-editor/yotoMyoLimits'
import { formatDurationSeconds } from '#shared/myo-editor/youtubeDuration'

const yoto = inject(YOTO_MYO_KEY)
const editor = inject(MYO_EDITOR_KEY)
const chrome = inject(MOBILE_EDITOR_CHROME_KEY)

if (!yoto || !editor || !chrome) {
  throw new Error('MobileLibraryView requires YOTO_MYO_KEY, MYO_EDITOR_KEY, and MOBILE_EDITOR_CHROME_KEY')
}

const { playEvent } = useUiSound()
const saveProgressTestMode = useSaveProgressTestMode()

const { cards, status, errorMessage, connected } = yoto
const {
  playlist,
  selectedCardId,
  cardTitle,
  loading,
  isPlaylistLocked,
  isDirty,
  isPodcast,
  errorMessage: editorError,
  selectCard,
  resetChanges,
  updateCard,
  saveProgress,
  isKnownPodcast,
} = editor

const { libraryMode, openCard } = chrome

const showCapacityConfirm = ref(false)

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

/** Armed only after in-flight saves finish — matches Menu bubble latch. */
const canUpdate = computed(
  () => Boolean(
    selectedCardId.value
    && isDirty.value
    && !loading.value
    && !isPodcast.value
    && !hasActiveSaves.value,
  ),
)

const capacity = computed(() => getPlaylistCapacitySnapshot(playlist.value))

const overCapacity = computed(() => {
  const { trackCount, trackMax, knownDurationSeconds, durationMax } = capacity.value
  const overTracks = trackMax > 0 && trackCount / trackMax >= 1
  const overTime = durationMax > 0 && knownDurationSeconds / durationMax >= 1
  return overTracks || overTime
})

const overTrackLimit = computed(
  () => capacity.value.trackCount > capacity.value.trackMax,
)

const footerHint = computed(() => {
  if (isPodcast.value) return 'Podcast cards cannot be edited yet.'
  if (editorError.value) return editorError.value
  if (overTrackLimit.value) return YOTO_MYO_TRACK_COUNT_MESSAGE
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
    openCard()
  }
}

function onReset() {
  if (!canReset.value) {
    playEvent('disabled')
    return
  }
  showCapacityConfirm.value = false
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
  if (overCapacity.value) {
    playEvent('buttonPrimary')
    showCapacityConfirm.value = true
    return
  }
  playEvent('buttonPrimary')
  void updateCard()
}

function onConfirmRiskyUpdate() {
  if (!canUpdate.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonPrimary')
  showCapacityConfirm.value = false
  void updateCard({ acknowledgeCapacityRisk: true })
}

function onCancelRiskyUpdate() {
  playEvent('resetPlaylist')
  showCapacityConfirm.value = false
}

watch(() => chrome.isPhone.value, (phone) => {
  if (!phone) {
    showCapacityConfirm.value = false
  }
})

function moveTrack(index: number, delta: number) {
  if (tracksLocked.value) {
    playEvent('disabled')
    return
  }
  const next = index + delta
  if (next < 0 || next >= playlist.value.length) {
    playEvent('disabled')
    return
  }
  playlist.value = moveItem(playlist.value, index, next)
  playEvent('reorderSwipe')
}

function removeTrack(id: string) {
  if (tracksLocked.value) {
    playEvent('disabled')
    return
  }
  playlist.value = playlist.value.filter(t => t.id !== id)
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

const menuTrackTitle = computed(() => menuTrack.value?.title?.trim() || 'Track')

const showTrackList = computed(
  () => playlist.value.length > 0 || trackLeavePending.value,
)

/** 1-based index after Move up; null when move is unavailable. */
const moveUpBecomesTrack = computed(() => {
  const index = trackMenuIndex.value
  if (index === null || index <= 0) return null
  return index
})

/** 1-based index after Move down; null when move is unavailable. */
const moveDownBecomesTrack = computed(() => {
  const index = trackMenuIndex.value
  if (index === null || index >= playlist.value.length - 1) return null
  return index + 2
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
  const next = index + delta
  if (next < 0 || next >= playlist.value.length) {
    trackMenuIndex.value = null
    return
  }
  trackMenuIndex.value = next
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

watch(libraryMode, () => {
  clearPendingRemoveTimer()
  pendingRemoveTrackId.value = null
  trackLeavePending.value = false
  trackMenuIndex.value = null
})

watch(tracksLocked, (locked) => {
  if (locked) {
    clearPendingRemoveTimer()
    pendingRemoveTrackId.value = null
    trackMenuIndex.value = null
  }
})

onUnmounted(() => {
  clearPendingRemoveTimer()
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
        Loading MYO cards...
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
          Connect your Yoto account to load your MYO cards.
        </p>
      </div>
      <p
        v-else-if="cards.length === 0"
        class="empty-state flex-1 empty-state-meta"
      >
        No MYO cards found.
      </p>
      <ul
        v-else
        class="mobile-library-grid list-none m-0 p-2 overflow-y-auto flex-1 min-h-0"
        aria-label="My Yoto cards"
      >
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
      <div class="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
        <div class="mobile-card-detail__hero">
          <img
            v-if="selectedCard?.coverUrl"
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
            v-if="isPodcast"
            class="mobile-card-podcast-badge mobile-card-podcast-badge--detail"
          >Podcast</span>
        </div>

        <div class="mobile-card-detail__title-row">
          <h2 class="mobile-card-detail__title type-empty-title font-maru-bold text-pretty">
            {{ cardTitle || selectedCard?.title || 'Card' }}
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
            >{{ hasActiveSaves ? 'Updating…' : 'Update' }}</span>
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
            v-for="(track, index) in playlist"
            :key="track.id"
            class="mobile-card-track border-maru rounded-maru bg-maru-white"
          >
            <div class="mobile-card-track__media">
              <img
                v-if="track.thumbnailUrl"
                :src="track.thumbnailUrl"
                alt=""
                class="mobile-card-track__thumb"
                loading="lazy"
              >
              <div
                v-else
                class="mobile-card-track__thumb mobile-card-track__thumb--empty"
                aria-hidden="true"
              >
                <MaruEmoji
                  name="MusicalNote"
                  :size-rem="1.1"
                />
              </div>
              <span
                class="mobile-card-track__index type-meta font-maru-bold"
                :class="`mobile-card-track__index--tone-${index % 6}`"
                aria-hidden="true"
              >{{ index + 1 }}</span>
              <span
                v-if="track.duration"
                class="yt-result-duration font-maru-mono tabular-nums"
              >{{ formatDurationSeconds(track.duration) }}</span>
            </div>

            <p class="mobile-card-track__title font-maru-medium line-clamp-2 text-pretty">
              {{ track.title }}
            </p>

            <button
              type="button"
              class="mobile-card-track__menu"
              :disabled="tracksLocked"
              :aria-label="`Track menu for ${track.title}`"
              :aria-expanded="trackMenuIndex === index"
              aria-haspopup="dialog"
              @click="openTrackMenu(index)"
            >
              <MaruEmoji
                name="CardFileBox"
                :size-rem="1.35"
              />
            </button>
          </li>
        </TransitionGroup>

        <p
          v-else-if="!loading"
          class="empty-state-meta text-center py-8"
        >
          No tracks yet. Add songs from Search.
        </p>

        <MobileTray
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
              :disabled="tracksLocked || trackMenuIndex === null || trackMenuIndex <= 0"
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
              :disabled="tracksLocked || trackMenuIndex === null || trackMenuIndex >= playlist.length - 1"
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
              <span class="mobile-overflow-menu__item-label">Remove</span>
            </button>
          </div>
        </MobileTray>
      </div>

      <div
        v-if="showCapacityConfirm"
        class="footer-capacity-confirm footer-capacity-confirm--open"
        role="dialog"
        aria-modal="true"
      >
        <p class="footer-capacity-confirm__copy font-maru-mono text-pretty">
          Over MYO limit — update may fail.
        </p>
        <div class="footer-capacity-confirm__actions">
          <button
            type="button"
            class="panel-footer-btn panel-footer-btn--short panel-footer-btn--secondary"
            @click="onCancelRiskyUpdate"
          >
            <span class="panel-footer-btn__label">Cancel</span>
          </button>
          <button
            type="button"
            class="panel-footer-btn panel-footer-btn--short panel-footer-btn--primary"
            @click="onConfirmRiskyUpdate"
          >
            <span class="panel-footer-btn__label">Update anyway</span>
          </button>
        </div>
      </div>

    </div>
  </div>
</template>
