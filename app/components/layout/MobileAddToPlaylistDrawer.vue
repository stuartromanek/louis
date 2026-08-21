<script setup lang="ts">
import Tray from '~/components/ui/Tray.vue'
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'
import { MOBILE_EDITOR_CHROME_KEY } from '~/composables/useMobileEditorChrome'
import { videosToPlaylistTracks } from '~/components/playlist/types'
import type { InsertTracksResult } from '~/components/myo-editor/useMyoEditor'
import { classifyInsertTracksOutcome } from '#shared/myo-editor/standalonePlaylist'
import type { YotoMyoCard as YotoMyoCardType } from '~/components/yoto-myo/types'
import type { YoutubeVideoSummary } from '~/components/youtube-picker/types'

const yoto = inject(YOTO_MYO_KEY)
const editor = inject(MYO_EDITOR_KEY)
const chrome = inject(MOBILE_EDITOR_CHROME_KEY)

if (!yoto || !editor || !chrome) {
  throw new Error('MobileAddToPlaylistDrawer requires YOTO_MYO_KEY, MYO_EDITOR_KEY, and MOBILE_EDITOR_CHROME_KEY')
}

const { playEvent } = useUiSound()
const { cards, status, cardsLoading, connected } = yoto
const {
  selectedCardId,
  isPlaylistLocked,
  isPodcast,
  isKnownPodcast,
  selectCard,
  startNewPlaylist,
  queuePendingCreateTracks,
  insertTracks,
} = editor
const { addDrawerVideos, closeAddDrawer, openPlaylist } = chrome
const { showAddedToPlaylist, showDuplicateTrack, showError } = useToast()
const { clear: clearResultSelection } = useYoutubeResultSelection()

const picking = ref(false)

const trayOpen = computed({
  get: () => addDrawerVideos.value.length > 0,
  set: (value: boolean) => {
    if (!value) closeAddDrawer()
  },
})

const selectableCards = computed(() => cards.value)

function cardIsPodcast(card: YotoMyoCardType) {
  return isKnownPodcast(card.cardId)
    || (selectedCardId.value === card.cardId && isPodcast.value)
}

function addedLabel(videos: YoutubeVideoSummary[], added: number) {
  if (videos.length === 1) return videos[0]?.title ?? 'Track'
  if (added === 1) return videos[0]?.title ?? 'Track'
  return `${added} tracks`
}

function finishAdd(
  result: InsertTracksResult,
  videos: YoutubeVideoSummary[],
  destinationTitle: string,
  openDetail: boolean,
) {
  if (!result.ok) {
    playEvent('disabled')
    showError(result.message)
    return
  }

  const outcome = classifyInsertTracksOutcome(result)
  if (result.added > 0) {
    playEvent('drop')
    clearResultSelection()
    closeAddDrawer()
    if (openDetail) chrome.openPlaylist()
  }

  if (outcome.kind === 'mixed' || outcome.kind === 'overflow') {
    showError(outcome.message, 0, outcome.title)
    if (result.added === 0) closeAddDrawer()
    return
  }

  if (outcome.kind === 'added') {
    showAddedToPlaylist(addedLabel(videos, result.added), destinationTitle)
    return
  }

  if (outcome.kind === 'duplicate') {
    showDuplicateTrack(videos[0]?.title ?? 'Track')
    closeAddDrawer()
  }
}

async function onPickNewCard() {
  const videos = addDrawerVideos.value
  if (videos.length === 0 || picking.value) return

  picking.value = true
  try {
    if (!startNewPlaylist()) {
      playEvent('disabled')
      showError('Could not start a new playlist. Try again.')
      return
    }

    queuePendingCreateTracks(videosToPlaylistTracks(videos))
    playEvent('buttonClick')
    closeAddDrawer()
    openPlaylist()
  }
  finally {
    picking.value = false
  }
}

async function onPickCard(card: YotoMyoCardType) {
  const videos = addDrawerVideos.value
  if (videos.length === 0 || picking.value) return

  if (cardIsPodcast(card)) {
    playEvent('disabled')
    showError('Podcasts cannot be edited yet.')
    return
  }

  picking.value = true
  try {
    if (selectedCardId.value !== card.cardId) {
      await selectCard(card)
    }

    if (selectedCardId.value !== card.cardId) {
      playEvent('disabled')
      showError('Could not open that playlist. Try again.')
      return
    }

    if (isPlaylistLocked.value || isPodcast.value) {
      playEvent('disabled')
      if (isPodcast.value) {
        showError('Podcasts cannot be edited yet.')
      }
      return
    }

    const result = insertTracks(videosToPlaylistTracks(videos))
    finishAdd(result, videos, card.title, false)
  }
  finally {
    picking.value = false
  }
}
</script>

<template>
  <Tray
    v-model:open="trayOpen"
    title="Add to..."
    height="auto"
  >
    <p
      v-if="status === 'loading'"
      class="empty-state-meta mobile-add-drawer__status"
    >
      Checking Yoto…
    </p>
    <p
      v-else-if="!connected || status === 'disconnected'"
      class="empty-state-meta mobile-add-drawer__status"
    >
      Connect Yoto to choose a playlist.
    </p>
    <ul
      v-else-if="cardsLoading"
      class="mobile-add-drawer__scroller list-none m-0"
      aria-busy="true"
      aria-label="Loading playlists"
    >
      <li
        v-for="n in [0, 1, 2, 3]"
        :key="`ph-${n}`"
        aria-hidden="true"
      >
        <div class="mobile-add-drawer__card mobile-add-drawer__card--placeholder">
          <div class="mobile-add-drawer__card-art-wrap">
            <div class="mobile-add-drawer__card-art mobile-add-drawer__card-art--empty library-placeholder__pulse" />
          </div>
          <span class="mobile-add-drawer__card-title library-placeholder__title">&nbsp;</span>
        </div>
      </li>
    </ul>
    <ul
      v-else
      class="mobile-add-drawer__scroller list-none m-0"
      aria-label="Choose a playlist"
    >
      <li>
        <button
          type="button"
          class="mobile-add-drawer__card mobile-add-drawer__card--new"
          :disabled="picking"
          @click="onPickNewCard"
        >
          <div class="mobile-add-drawer__card-art-wrap">
            <div class="mobile-add-drawer__card-art mobile-add-drawer__card-art--empty">
              <MaruEmoji
                name="CardIndexDividers"
                size="md"
              />
            </div>
          </div>
          <span class="mobile-add-drawer__card-title font-maru-bold">New playlist</span>
        </button>
      </li>
      <li
        v-for="card in selectableCards"
        :key="card.cardId"
      >
        <button
          type="button"
          class="mobile-add-drawer__card"
          :class="{ 'mobile-add-drawer__card--podcast': cardIsPodcast(card) }"
          :disabled="cardIsPodcast(card) || picking"
          @click="onPickCard(card)"
        >
          <div class="mobile-add-drawer__card-art-wrap">
            <img
              v-if="card.coverUrl"
              :src="card.coverUrl"
              :alt="card.title"
              class="mobile-add-drawer__card-art"
              loading="lazy"
            >
            <div
              v-else
              class="mobile-add-drawer__card-art mobile-add-drawer__card-art--empty"
            >
              <MaruEmoji
                name="Bear"
                size="md"
              />
            </div>
            <span
              v-if="cardIsPodcast(card)"
              class="mobile-card-podcast-badge"
            >Podcast</span>
          </div>
          <span class="mobile-add-drawer__card-title font-maru-bold">{{ card.title }}</span>
        </button>
      </li>
    </ul>
  </Tray>
</template>
