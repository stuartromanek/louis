<script setup lang="ts">
import MobileTray from '~/components/ui/MobileTray.vue'
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'
import { MOBILE_EDITOR_CHROME_KEY } from '~/composables/useMobileEditorChrome'
import { pickerVideoToPlaylistTrack } from '~/components/playlist/types'
import type { YotoMyoCard as YotoMyoCardType } from '~/components/yoto-myo/types'

const yoto = inject(YOTO_MYO_KEY)
const editor = inject(MYO_EDITOR_KEY)
const chrome = inject(MOBILE_EDITOR_CHROME_KEY)

if (!yoto || !editor || !chrome) {
  throw new Error('MobileAddToCardDrawer requires YOTO_MYO_KEY, MYO_EDITOR_KEY, and MOBILE_EDITOR_CHROME_KEY')
}

const { playEvent } = useUiSound()
const { cards, status, connected } = yoto
const {
  playlist,
  selectedCardId,
  isPlaylistLocked,
  isPodcast,
  isKnownPodcast,
  selectCard,
} = editor
const { addDrawerVideo, closeAddDrawer, goToTab } = chrome
const { showAddedToCard, showError } = useMobileToast()

const picking = ref(false)

const trayOpen = computed({
  get: () => Boolean(addDrawerVideo.value),
  set: (value: boolean) => {
    if (!value) closeAddDrawer()
  },
})

const selectableCards = computed(() => cards.value)

function cardIsPodcast(card: YotoMyoCardType) {
  return isKnownPodcast(card.cardId)
    || (selectedCardId.value === card.cardId && isPodcast.value)
}

async function onPickCard(card: YotoMyoCardType) {
  const video = addDrawerVideo.value
  if (!video || picking.value) return

  if (cardIsPodcast(card)) {
    playEvent('disabled')
    showError('Podcast cards cannot be edited yet.')
    return
  }

  picking.value = true
  try {
    if (selectedCardId.value !== card.cardId) {
      await selectCard(card)
    }

    if (selectedCardId.value !== card.cardId) {
      // Select failed (load error) — draft stash on switch is silent.
      playEvent('disabled')
      showError('Could not open that card. Try again.')
      return
    }

    if (isPlaylistLocked.value || isPodcast.value) {
      playEvent('disabled')
      if (isPodcast.value) {
        showError('Podcast cards cannot be edited yet.')
      }
      return
    }

    const track = pickerVideoToPlaylistTrack(video)
    if (playlist.value.some(item => item.id === track.id)) {
      playEvent('disabled')
      showError('That track is already on this card.')
      closeAddDrawer()
      return
    }

    playlist.value = [...playlist.value, track]
    playEvent('drop')
    closeAddDrawer()
    showAddedToCard(track.title, card.title)
  }
  finally {
    picking.value = false
  }
}

function onGoLibrary() {
  playEvent('buttonClick')
  closeAddDrawer()
  goToTab('library')
}
</script>

<template>
  <MobileTray
    v-model:open="trayOpen"
    title="Add to..."
    height="auto"
  >
    <p
      v-if="!connected || status === 'disconnected'"
      class="empty-state-meta mobile-add-drawer__status"
    >
      Connect Yoto to choose a card.
    </p>
    <p
      v-else-if="status === 'loading'"
      class="empty-state-meta mobile-add-drawer__status"
    >
      Loading cards...
    </p>
    <div
      v-else-if="selectableCards.length === 0"
      class="mobile-add-drawer__status flex flex-col gap-2"
    >
      <p class="empty-state-meta">
        No MYO cards found.
      </p>
      <button
        type="button"
        class="font-maru-medium underline text-left type-title"
        @click="onGoLibrary"
      >
        Go to Library
      </button>
    </div>
    <ul
      v-else
      class="mobile-add-drawer__scroller list-none m-0"
      aria-label="Choose a card"
    >
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
  </MobileTray>
</template>
