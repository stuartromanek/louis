<script setup lang="ts">
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'
import HowToModal from '~/components/layout/HowToModal.vue'
import Tray from '~/components/ui/Tray.vue'
import MaruEmoji from '~/components/ui/MaruEmoji.vue'
import { MOBILE_EDITOR_CHROME_KEY } from '~/composables/useMobileEditorChrome'
import PlaylistSaveProgress from '~/components/playlist/PlaylistSaveProgress.vue'
import PlaylistUpdatePrompt from '~/components/playlist/PlaylistUpdatePrompt.vue'
import {
  SAVE_PROGRESS_TEST_FIXTURE,
  useSaveProgressTestMode,
} from '~/components/playlist/saveProgressTestFixture'
import { usePreferencesShell } from '~/composables/usePreferencesShell'

const yoto = inject(YOTO_MYO_KEY)
if (!yoto) {
  throw new Error('MobilePhoneHeader requires YOTO_MYO_KEY provider')
}

const editor = inject(MYO_EDITOR_KEY, null)
const chrome = inject(MOBILE_EDITOR_CHROME_KEY, null)
const { playEvent } = useUiSound()
const saveProgressTestMode = useSaveProgressTestMode()
const { openPreferences: openPreferencesShell } = usePreferencesShell()
const {
  showInstallItem,
  canPrompt,
  promptInstall,
} = usePwaInstall()
const { showInstallHelp } = useToast()

const { connected, status, refresh, disconnect, hasWriteScope, connect } = yoto

const howToOpen = ref(false)
const menuOpen = ref(false)
const signOutArmed = ref(false)
const signOutShaking = ref(false)
let signOutShakeTimer: ReturnType<typeof setTimeout> | null = null

const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSccwkdCpYaJjODtpxSrtBIaye045nobwudH1L0VX8S6NzFtjA/viewform?usp=publish-editor'

const needsReconnect = computed(
  () => connected.value && !hasWriteScope.value,
)

const hasActiveSaves = computed(
  () => saveProgressTestMode.value || Boolean(editor?.hasActiveSaves.value),
)

const displayedSaveProgress = computed(() => {
  if (saveProgressTestMode.value) return SAVE_PROGRESS_TEST_FIXTURE
  return editor?.saveProgress.value ?? null
})

/** Selected card (or test fixture) is actively saving — show meters in Update. */
const updateInProgress = computed(
  () => Boolean(displayedSaveProgress.value),
)

const askingUpdatePrompt = computed(
  () => Boolean(editor?.updatePrompt.value) && !editor.saveStarting.value,
)

/**
 * Ready for a new Update only after any in-flight saves finish.
 * Pending drafts can save from Menu without opening a card.
 */
const updateReady = computed(
  () => Boolean(
    !hasActiveSaves.value
    && (editor?.pendingPlaylistUpdateCount.value ?? 0) > 0,
  ),
)

const menuAriaLabel = computed(() => {
  if (updateInProgress.value) return 'Menu, update in progress'
  if (updateReady.value) return 'Menu, Update ready'
  if (hasActiveSaves.value) return 'Menu, update in progress'
  return 'Menu'
})

const pendingPlaylistUpdateCount = computed(
  () => editor?.pendingPlaylistUpdateCount.value ?? 0,
)

const updateButtonLabel = computed(() => {
  if (hasActiveSaves.value && !updateInProgress.value) return 'Updating…'
  const count = pendingPlaylistUpdateCount.value
  if (count <= 0) return 'Playlists are up to date'
  if (count > 1) return `Update ${count} Playlists`
  const title = editor?.pendingUpdateTitle.value?.trim()
  return title ? `Update ${title}` : 'Update playlist'
})

const menuTriggerEmoji = computed(() => {
  if (hasActiveSaves.value) return 'IndexPointingUp' as const
  if (updateReady.value) return 'Bell' as const
  return 'CardFileBox' as const
})

/** Overall save completion for the Menu tab progress fill. */
const menuUpdateProgress = computed(() => {
  if (saveProgressTestMode.value) {
    return Math.min(100, Math.max(0, SAVE_PROGRESS_TEST_FIXTURE.progress))
  }
  const p = editor?.activeSaveProgress.value
  if (typeof p === 'number') return Math.min(100, Math.max(0, p))
  return 0
})

const menuTriggerStyle = computed(() => {
  if (!hasActiveSaves.value) return undefined
  return {
    '--menu-update-progress': `${menuUpdateProgress.value}%`,
  }
})

function openHowTo() {
  playEvent('buttonClick')
  menuOpen.value = false
  howToOpen.value = true
}

function openPreferences() {
  playEvent('buttonClick')
  menuOpen.value = false
  openPreferencesShell()
}

function onAddToHomeScreen() {
  playEvent('buttonClick')
  menuOpen.value = false
  if (canPrompt.value) {
    void promptInstall()
    return
  }
  showInstallHelp()
}

function onConnect() {
  playEvent('buttonPrimary')
  menuOpen.value = false
  connect()
}

function onDisconnect() {
  if (!signOutArmed.value) {
    signOutArmed.value = true
    playEvent('disabled')
    signOutShaking.value = false
    // Retrigger shake if already mid-animation.
    requestAnimationFrame(() => {
      signOutShaking.value = true
    })
    if (signOutShakeTimer) clearTimeout(signOutShakeTimer)
    signOutShakeTimer = setTimeout(() => {
      signOutShaking.value = false
      signOutShakeTimer = null
    }, 540)
    return
  }

  playEvent('buttonClick')
  signOutArmed.value = false
  menuOpen.value = false
  disconnect()
}

function onRetry() {
  playEvent('buttonClick')
  menuOpen.value = false
  refresh()
}

function onFeedback() {
  playEvent('buttonClick')
  menuOpen.value = false
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function onUpdate() {
  if (!updateReady.value || !editor) {
    playEvent('disabled')
    return
  }
  playEvent('buttonPrimary')
  editor.requestUpdatePending('dialog')
}

function onPromptCancel() {
  editor?.cancelUpdatePrompt()
}

function onPromptKeep() {
  editor?.keepVolumeAsIs()
}

function onPromptConfirm() {
  editor?.confirmUpdatePrompt()
}

watch(menuOpen, (open) => {
  if (!open) {
    signOutArmed.value = false
    signOutShaking.value = false
    if (signOutShakeTimer) {
      clearTimeout(signOutShakeTimer)
      signOutShakeTimer = null
    }
  }
})

watch(() => chrome?.isPhone.value, (phone) => {
  if (phone === false) {
    menuOpen.value = false
    signOutArmed.value = false
  }
})

watch(
  () => editor?.updatePrompt.value,
  (prompt, prev) => {
    if (!chrome?.isPhone.value) return
    if (prompt === 'normalize' || prompt === 'capacity') {
      menuOpen.value = true
      return
    }
    // After a prompt resolves into a save, reopen so Update morphs into progress.
    if (prev && !prompt && editor?.hasActiveSaves.value) {
      menuOpen.value = true
    }
  },
)

onBeforeUnmount(() => {
  if (signOutShakeTimer) clearTimeout(signOutShakeTimer)
})
</script>

<template>
  <div
    class="mobile-overflow-menu"
  >
    <button
      type="button"
      class="mobile-editor-tabs__tab mobile-overflow-menu__trigger"
      :class="{
        'mobile-overflow-menu__trigger--ready': updateReady,
        'mobile-overflow-menu__trigger--busy': hasActiveSaves,
      }"
      :style="menuTriggerStyle"
      :aria-expanded="menuOpen"
      aria-haspopup="dialog"
      :aria-label="menuAriaLabel"
      @click="toggleMenu"
    >
      <MaruEmoji
        :key="menuTriggerEmoji"
        :name="menuTriggerEmoji"
        :size-rem="1.4"
        class="mobile-overflow-menu__trigger-emoji"
      />
      <span class="mobile-editor-tabs__label">Menu</span>
    </button>

    <Tray
      v-model:open="menuOpen"
      role="menu"
      aria-label="Menu"
      height="auto"
    >
      <div class="mobile-overflow-menu__list">
        <button
          v-if="connected"
          type="button"
          class="mobile-overflow-menu__item mobile-overflow-menu__item--signout"
          :class="{
            'mobile-overflow-menu__item--signout-armed': signOutArmed,
            'mobile-overflow-menu__item--signout-shake': signOutShaking,
          }"
          role="menuitem"
          @click="onDisconnect"
        >
          <MaruEmoji
            name="CallMeHand"
            size="md"
            class="mobile-overflow-menu__item-emoji"
          />
          <span class="mobile-overflow-menu__item-label">
            {{ signOutArmed ? 'Are you sure you want to sign out?' : 'Sign out' }}
          </span>
        </button>
        <button
          type="button"
          class="mobile-overflow-menu__item mobile-overflow-menu__item--howto"
          role="menuitem"
          @click="openHowTo"
        >
          <MaruEmoji
            name="LightBulb"
            size="md"
            class="mobile-overflow-menu__item-emoji"
          />
          <span class="mobile-overflow-menu__item-label">Help</span>
        </button>
        <a
          class="mobile-overflow-menu__item mobile-overflow-menu__item--feedback"
          role="menuitem"
          :href="FEEDBACK_URL"
          target="_blank"
          rel="noopener noreferrer"
          @click="onFeedback"
        >
          <MaruEmoji
            name="Ear"
            size="md"
            class="mobile-overflow-menu__item-emoji"
          />
          <span class="mobile-overflow-menu__item-label">Report Issues</span>
        </a>
        <button
          type="button"
          class="mobile-overflow-menu__item mobile-overflow-menu__item--prefs"
          role="menuitem"
          @click="openPreferences"
        >
          <MaruEmoji
            name="LevelSlider"
            size="md"
            class="mobile-overflow-menu__item-emoji"
          />
          <span class="mobile-overflow-menu__item-label">Settings</span>
        </button>
        <button
          v-if="showInstallItem"
          type="button"
          class="mobile-overflow-menu__item mobile-overflow-menu__item--install"
          role="menuitem"
          @click="onAddToHomeScreen"
        >
          <MaruEmoji
            name="CardIndex"
            size="md"
            class="mobile-overflow-menu__item-emoji"
          />
          <span class="mobile-overflow-menu__item-label">Add to Home</span>
        </button>
        <button
          v-if="status === 'disconnected' || status === 'unconfigured'"
          type="button"
          class="mobile-overflow-menu__item mobile-overflow-menu__item--connect"
          role="menuitem"
          @click="onConnect"
        >
          <MaruEmoji
            name="ElectricPlugRed"
            size="md"
            class="mobile-overflow-menu__item-emoji"
          />
          <span class="mobile-overflow-menu__item-label">Connect</span>
        </button>
        <button
          v-if="needsReconnect"
          type="button"
          class="mobile-overflow-menu__item mobile-overflow-menu__item--reconnect"
          role="menuitem"
          @click="onConnect"
        >
          <MaruEmoji
            name="FlyingSaucer"
            size="md"
            class="mobile-overflow-menu__item-emoji"
          />
          <span class="mobile-overflow-menu__item-label">Reconnect</span>
        </button>
        <button
          v-if="status === 'error'"
          type="button"
          class="mobile-overflow-menu__item mobile-overflow-menu__item--retry"
          role="menuitem"
          @click="onRetry"
        >
          <MaruEmoji
            name="Fire"
            size="md"
            class="mobile-overflow-menu__item-emoji"
          />
          <span class="mobile-overflow-menu__item-label">Retry</span>
        </button>
        <div
          v-if="askingUpdatePrompt && editor?.updatePrompt.value"
          class="mobile-overflow-menu__item mobile-overflow-menu__item--update-normalize"
          role="group"
          :aria-label="editor.updatePrompt.value === 'capacity' ? 'Over MYO limit' : 'Normalize new track levels'"
        >
          <PlaylistUpdatePrompt
            :kind="editor.updatePrompt.value"
            surface="menu"
            id-prefix="menu-update"
            :card-count="editor.updatePromptCardCount.value"
            :busy="Boolean(editor.saveStarting.value)"
            @cancel="onPromptCancel"
            @keep="onPromptKeep"
            @confirm="onPromptConfirm"
          />
        </div>
        <button
          v-else
          type="button"
          class="mobile-overflow-menu__item mobile-overflow-menu__item--update"
          :class="{
            'mobile-overflow-menu__item--update-ready': updateReady,
            'mobile-overflow-menu__item--update-busy': hasActiveSaves,
          }"
          role="menuitem"
          :aria-disabled="!updateReady"
          :disabled="!updateReady && !hasActiveSaves"
          @click="onUpdate"
        >
          <PlaylistSaveProgress
            v-if="displayedSaveProgress"
            class="mobile-overflow-menu__update-progress"
            :progress="displayedSaveProgress"
            variant="mobile"
          />
          <template v-else>
            <MaruEmoji
              :name="hasActiveSaves ? 'Construction' : 'FloppyDisk'"
              size="md"
              class="mobile-overflow-menu__item-emoji"
              :class="{ 'mobile-overflow-menu__item-emoji--spin': updateReady }"
            />
            <span
              class="mobile-overflow-menu__item-label"
              :class="{ 'mobile-overflow-menu__item-label--count': updateReady && pendingPlaylistUpdateCount > 1 }"
            >{{ updateButtonLabel }}</span>
          </template>
        </button>
      </div>
    </Tray>

    <HowToModal v-model:open="howToOpen" />
  </div>
</template>
