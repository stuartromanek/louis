<script setup lang="ts">
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'
import HowToModal from '~/components/layout/HowToModal.vue'
import Tray from '~/components/ui/Tray.vue'
import MaruEmoji from '~/components/ui/MaruEmoji.vue'
import { MOBILE_EDITOR_CHROME_KEY } from '~/composables/useMobileEditorChrome'
import PlaylistSaveProgress from '~/components/playlist/PlaylistSaveProgress.vue'
import {
  SAVE_PROGRESS_TEST_FIXTURE,
  useSaveProgressTestMode,
} from '~/components/playlist/saveProgressTestFixture'
import {
  getPlaylistCapacitySnapshot,
} from '#shared/myo-editor/yotoMyoLimits'
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
const showCapacityConfirm = ref(false)
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

/**
 * Ready for a new Update only after any in-flight saves finish.
 * Keeps Menu / Update UI from jumping to “next steps” mid-job.
 */
const updateReady = computed(
  () => Boolean(
    editor?.selectedCardId.value
    && editor?.isDirty.value
    && !editor?.loading.value
    && !editor?.isPodcast.value
    && !hasActiveSaves.value,
  ),
)

const capacity = computed(() => getPlaylistCapacitySnapshot(editor?.playlist.value ?? []))

const overCapacity = computed(() => {
  const { trackCount, trackMax, knownDurationSeconds, durationMax } = capacity.value
  const overTracks = trackMax > 0 && trackCount / trackMax >= 1
  const overTime = durationMax > 0 && knownDurationSeconds / durationMax >= 1
  return overTracks || overTime
})

const menuAriaLabel = computed(() => {
  if (updateInProgress.value) return 'Menu, update in progress'
  if (updateReady.value) return 'Menu, Update ready'
  if (hasActiveSaves.value) return 'Menu, update in progress'
  return 'Menu'
})

const pendingPlaylistUpdateCount = computed(
  () => editor?.pendingPlaylistUpdateCount.value ?? (updateReady.value ? 1 : 0),
)

const updateButtonLabel = computed(() => {
  if (hasActiveSaves.value && !updateInProgress.value) return 'Updating…'
  const count = pendingPlaylistUpdateCount.value
  if (!updateReady.value) {
    if (count > 0) {
      return count === 1
        ? 'Open a card to update'
        : `Open cards to update (${count})`
    }
    return 'Playlists are up to date'
  }
  if (count > 1) return `Update ${count} Playlists`
  const title = editor?.cardTitle.value?.trim()
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
  if (!updateReady.value) {
    playEvent('disabled')
    return
  }
  if (overCapacity.value) {
    menuOpen.value = false
    playEvent('buttonPrimary')
    showCapacityConfirm.value = true
    return
  }
  playEvent('buttonPrimary')
  // Keep the tray open so Update morphs into progress meters.
  void editor?.updateCard()
}

function onConfirmRiskyUpdate() {
  if (!updateReady.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonPrimary')
  showCapacityConfirm.value = false
  menuOpen.value = true
  void editor?.updateCard({ acknowledgeCapacityRisk: true })
}

function onCancelRiskyUpdate() {
  playEvent('resetPlaylist')
  showCapacityConfirm.value = false
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
    showCapacityConfirm.value = false
    signOutArmed.value = false
  }
})

onBeforeUnmount(() => {
  if (signOutShakeTimer) clearTimeout(signOutShakeTimer)
})
</script>

<template>
  <div
    v-if="status !== 'loading'"
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
          v-if="connected && status === 'idle'"
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
        <button
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

    <Teleport to="body">
      <div
        v-if="showCapacityConfirm"
        class="mobile-overflow-menu__confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-menu-capacity-title"
      >
        <div class="mobile-overflow-menu__confirm-card border-maru rounded-maru">
          <p
            id="mobile-menu-capacity-title"
            class="type-body text-pretty m-0"
          >
            Over MYO limit — update may fail.
          </p>
          <div class="mobile-overflow-menu__confirm-actions">
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
    </Teleport>

    <HowToModal v-model:open="howToOpen" />
  </div>
</template>
