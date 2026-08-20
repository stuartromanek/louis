<script setup lang="ts">
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import type { EmojiId } from '~/utils/emojiCatalog'
import { useSelectedResultTracks } from '~/components/youtube-picker/useYoutubePicker'
import { PLAYLIST_NOT_ON_YOTO_YET_MESSAGE } from '#shared/myo-editor/standalonePlaylist'

withDefaults(defineProps<{
  fill?: boolean
}>(), {
  fill: false,
})

const editor = inject(MYO_EDITOR_KEY, null)
const { playEvent } = useUiSound()
const { clear: clearResultSelection } = useYoutubeResultSelection()
const selectedResultTracks = useSelectedResultTracks()

const isEditing = computed(() => editor?.isEditing.value ?? false)
const isNaming = computed(() =>
  Boolean(editor?.isNewPlaylist.value && !editor.cardTitle.value.trim()),
)
const isRenaming = computed(() => editor?.playlistManagePrompt.value === 'rename')
const isIdle = computed(() => !isNaming.value && !isRenaming.value && !isEditing.value)

const draftTitle = ref('')
const titleInput = ref<HTMLInputElement | null>(null)

const canConfirm = computed(() => {
  const name = draftTitle.value.trim()
  if (!name) return false
  if (isRenaming.value) return name !== (editor?.cardTitle.value.trim() ?? '')
  return true
})
const namingBusy = computed(() =>
  Boolean(
    editor?.isPlaylistLocked.value
    || editor?.saveStarting.value
    || editor?.playlistManageBusy.value,
  ),
)

const inboundCount = computed(() => editor?.pendingCreateTrackCount?.value ?? 0)

const content = computed((): { emoji: EmojiId | null, title: string, description: string } => {
  if (isRenaming.value) {
    return {
      emoji: null,
      title: 'Rename this playlist',
      description: 'The new name is saved to Yoto right away.',
    }
  }

  if (isNaming.value) {
    const count = inboundCount.value
    return {
      emoji: null,
      title: 'Name this playlist',
      description: count === 0
        ? 'Name it to create the playlist on Yoto, then add tracks from Search.'
        : count === 1
          ? 'Name it to create the playlist and add the selected track from Search.'
          : `Name it to create the playlist and add ${count} tracks from Search.`,
    }
  }

  if (isEditing.value) {
    return {
      emoji: 'MusicalNotes',
      title: 'Drop videos here',
      description: editor?.isNewPlaylist?.value
        ? `${PLAYLIST_NOT_ON_YOTO_YET_MESSAGE} Drag tracks from YouTube Search, or paste a video, playlist, or channel URL in Search.`
        : 'Drag tracks from YouTube Search, or paste a video, playlist, or channel URL in Search.',
    }
  }

  return {
    emoji: 'BilledCap',
    title: 'Open a playlist',
    description: '',
  }
})

function focusTitleIfDesktop() {
  if (typeof window === 'undefined') return
  if (!window.matchMedia('(min-width: 600px)').matches) return
  titleInput.value?.focus()
}

async function onConfirm() {
  const name = draftTitle.value.trim()
  if (!name || !editor || namingBusy.value || !canConfirm.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonClick')
  if (isRenaming.value) {
    await editor.confirmRename(name)
    return
  }
  const inbound = inboundCount.value
  const ok = await editor.confirmNewPlaylistName(name)
  if (ok && inbound > 0) clearResultSelection()
}

function onCancelRename() {
  if (namingBusy.value) {
    playEvent('disabled')
    return
  }
  playEvent('resetPlaylist')
  editor?.cancelPlaylistManage()
}

function onStartNewPlaylist() {
  if (!editor || editor.isPlaylistLocked.value) {
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

watch(isNaming, async (naming) => {
  if (!naming) return
  draftTitle.value = ''
  await nextTick()
  focusTitleIfDesktop()
}, { immediate: true })

watch(isRenaming, async (renaming) => {
  if (!renaming) return
  draftTitle.value = editor?.cardTitle.value ?? ''
  await nextTick()
  focusTitleIfDesktop()
}, { immediate: true })
</script>

<template>
  <div
    class="empty-state"
    :class="[
      fill ? 'flex-1 min-h-0 m-auto w-full' : (isNaming || isRenaming ? 'w-full' : 'min-h-32 py-10 px-4'),
      isIdle ? 'pointer-events-auto' : '',
    ]"
  >
    <MaruEmoji
      v-if="content.emoji"
      :name="content.emoji"
      size="empty"
    />

    <p class="empty-state-title">
      {{ content.title }}
    </p>

    <p
      v-if="isIdle"
      class="empty-state-meta max-w-xs"
    >
      Choose a playlist from Playlists, or start a
      <button
        type="button"
        class="playlist-empty-new-link"
        :disabled="editor?.isPlaylistLocked.value"
        @click="onStartNewPlaylist"
      >New playlist</button>.
    </p>
    <p
      v-else-if="content.description"
      class="empty-state-meta max-w-xs"
    >
      {{ content.description }}
    </p>

    <form
      v-if="isNaming || isRenaming"
      class="playlist-empty-name"
      @submit.prevent="onConfirm"
    >
      <label class="playlist-new-title playlist-new-title--body">
        <input
          ref="titleInput"
          v-model="draftTitle"
          type="text"
          class="prefs-projector__input font-maru"
          placeholder="Playlist title"
          maxlength="80"
          aria-label="Playlist title"
          :disabled="editor?.isPlaylistLocked.value || namingBusy"
        >
      </label>
      <button
        type="submit"
        class="playlist-empty-name__submit"
        :disabled="!canConfirm || namingBusy"
      >
        <span class="playlist-empty-name__submit-label">{{
          namingBusy
            ? (isRenaming ? 'Saving…' : 'Creating…')
            : 'Confirm'
        }}</span>
      </button>
      <button
        v-if="isRenaming"
        type="button"
        class="panel-footer-btn panel-footer-btn--short panel-footer-btn--secondary playlist-empty-name__cancel"
        :disabled="namingBusy"
        @click="onCancelRename"
      >
        <span class="panel-footer-btn__label">Cancel</span>
      </button>
    </form>
  </div>
</template>
