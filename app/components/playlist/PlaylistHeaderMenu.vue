<script setup lang="ts">
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'

const editor = inject(MYO_EDITOR_KEY, null)
const { playEvent } = useUiSound()

const open = ref(false)
const triggerEl = ref<HTMLButtonElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const menuPos = ref({ top: '0px', right: '0px' })

const visible = computed(() =>
  Boolean(editor?.selectedCardId.value && !editor.isNewPlaylist.value),
)

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
  if (!open.value) positionMenu()
  open.value = !open.value
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

function onPointerDown(event: PointerEvent) {
  if (!open.value) return
  const target = event.target as Node | null
  if (triggerEl.value?.contains(target) || menuEl.value?.contains(target)) return
  close()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !open.value) return
  event.preventDefault()
  close()
}

watch(visible, (show) => {
  if (!show) close()
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
      :aria-expanded="open"
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
    </Teleport>
  </div>
</template>
