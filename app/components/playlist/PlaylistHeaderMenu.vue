<script setup lang="ts">
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import PlaylistArtworkEditor from './PlaylistArtworkEditor.vue'
import AppFlyout from '~/components/layout/AppFlyout.vue'
import type { PlaylistArtworkSpec } from '#shared/myo-editor/playlistArtwork'

const editor = inject(MYO_EDITOR_KEY, null)
const { playEvent } = useUiSound()

const open = ref(false)
const triggerEl = ref<HTMLButtonElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const flyoutRef = ref<{ panelRef?: HTMLElement | null } | null>(null)
const artworkEditorRef = ref<{
  commit: () => void
  upload: () => void
  saveLabel: string
  commitDisabled: boolean
  uploadDisabled: boolean
} | null>(null)
const menuPos = ref({ top: '0px', right: '0px' })

const visible = computed(() =>
  Boolean(editor?.selectedCardId.value && !editor.isNewPlaylist.value),
)

const artworkOpen = computed(() => Boolean(editor?.playlistArtworkOpen.value))

const disabled = computed(() => Boolean(
  !editor
  || editor.loading.value
  || editor.isPlaylistLocked.value
  || editor.saveStarting.value
  || editor.playlistManageBusy.value
  || editor.playlistManagePrompt.value,
))

function positionMenu() {
  const rect = triggerEl.value?.getBoundingClientRect()
  if (!rect) return
  menuPos.value = {
    top: `${rect.bottom + 6}px`,
    right: `${Math.max(window.innerWidth - rect.right, 8)}px`,
  }
}

function close() {
  open.value = false
}

function toggle() {
  if (!visible.value || disabled.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonClick')
  if (artworkOpen.value) {
    editor?.closeArtwork()
    return
  }
  if (!open.value) positionMenu()
  open.value = !open.value
}

function onArtwork() {
  playEvent('buttonClick')
  close()
  editor?.startArtwork()
}

function onRename() {
  playEvent('buttonClick')
  close()
  editor?.startRename()
}

function onDelete() {
  playEvent('buttonClick')
  close()
  editor?.startDelete()
}

async function onSaveArtwork(spec: PlaylistArtworkSpec) {
  await editor?.confirmArtwork(spec)
}

async function onSaveArtworkUpload(file: Blob) {
  await editor?.confirmArtworkUpload(file)
}

function onArtworkDismiss() {
  if (editor?.playlistManageBusy.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonClick')
  editor?.closeArtwork()
}

function onPointerDown(event: PointerEvent) {
  const target = event.target as Node | null
  if (triggerEl.value?.contains(target)) return
  if (open.value && menuEl.value?.contains(target)) return
  if (artworkOpen.value && flyoutRef.value?.panelRef?.contains(target)) return
  if (open.value) close()
  if (artworkOpen.value) editor?.closeArtwork()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (artworkOpen.value) return
  if (!open.value) return
  event.preventDefault()
  close()
}

function closePopovers() {
  close()
  editor?.closeArtwork()
}

watch(visible, (show) => {
  if (!show) closePopovers()
})

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', close)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', close)
})
</script>

<template>
  <div
    v-if="visible"
    class="playlist-header-menu-host"
  >
    <button
      ref="triggerEl"
      type="button"
      class="playlist-header-menu__trigger"
      aria-label="Playlist menu"
      aria-haspopup="menu"
      :aria-expanded="open || artworkOpen"
      :disabled="disabled"
      @click="toggle"
    >
      <MaruEmoji
        name="CardFileBox"
        :size-rem="1.2"
      />
    </button>
    <Teleport to="body">
      <Transition name="playlist-header-menu">
        <div
          v-if="open"
          ref="menuEl"
          class="playlist-header-menu border-maru"
          role="menu"
          aria-label="Playlist actions"
          :style="menuPos"
        >
          <div class="mobile-overflow-menu__list playlist-header-menu__list">
            <button
              type="button"
              class="mobile-overflow-menu__item"
              role="menuitem"
              @click="onArtwork"
            >
              <MaruEmoji
                name="ArtistPalette"
                size="md"
                class="mobile-overflow-menu__item-emoji"
              />
              <span class="mobile-overflow-menu__item-label">Artwork</span>
            </button>
            <button
              type="button"
              class="mobile-overflow-menu__item"
              role="menuitem"
              @click="onRename"
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
              @click="onDelete"
            >
              <MaruEmoji
                name="Fire"
                size="md"
                class="mobile-overflow-menu__item-emoji"
              />
              <span class="mobile-overflow-menu__item-label">Delete</span>
            </button>
          </div>
        </div>
      </Transition>
      <AppFlyout
        ref="flyoutRef"
        :open="artworkOpen"
        title="Artwork"
        heading-id="playlist-artwork-heading"
        heading-tone="white"
        header-class="bg-maru-blue"
        face-class="bg-maru-red-lighter"
        size="sm"
        :dismiss-disabled="Boolean(editor?.playlistManageBusy.value)"
        @close="onArtworkDismiss"
      >
        <PlaylistArtworkEditor
          ref="artworkEditorRef"
          hide-commit
          :card-id="editor?.selectedCardId.value ?? null"
          :cover-url="editor?.playlistCoverUrl.value ?? null"
          :busy="Boolean(editor?.playlistManageBusy.value)"
          :disabled="disabled && !editor?.playlistManageBusy.value"
          @save="onSaveArtwork"
          @save-upload="onSaveArtworkUpload"
        />
        <template #footer>
          <div class="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              class="panel-footer-btn panel-footer-btn--short panel-footer-btn--secondary shrink-0"
              :disabled="Boolean(artworkEditorRef?.uploadDisabled)"
              @click="artworkEditorRef?.upload()"
            >
              <span class="panel-footer-btn__label">Upload</span>
            </button>
            <button
              type="button"
              class="panel-footer-btn panel-footer-btn--short bg-maru-red-lighter text-maru-black shrink-0"
              :disabled="Boolean(artworkEditorRef?.commitDisabled)"
              @click="artworkEditorRef?.commit()"
            >
              <span class="panel-footer-btn__label">{{ artworkEditorRef?.saveLabel ?? 'Save' }}</span>
            </button>
          </div>
        </template>
      </AppFlyout>
    </Teleport>
  </div>
</template>
