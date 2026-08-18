<script setup lang="ts">
import Tray from '~/components/ui/Tray.vue'
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'
import { MOBILE_EDITOR_CHROME_KEY } from '~/composables/useMobileEditorChrome'
import {
  getPlaylistCapacitySnapshot,
} from '#shared/myo-editor/yotoMyoLimits'

const { open, payload, persistent, dismiss, showError } = useToast()
const { platform } = usePwaInstall()
const { playEvent } = useUiSound()
const editor = inject(MYO_EDITOR_KEY, null)
const yoto = inject(YOTO_MYO_KEY, null)
const chrome = inject(MOBILE_EDITOR_CHROME_KEY, null)

const showCapacityConfirm = ref(false)

const trayOpen = computed({
  get: () => open.value,
  set: (value: boolean) => {
    if (!value) dismiss()
  },
})

const isErrorToast = computed(() => payload.value?.kind === 'error')
const isInstallHelp = computed(() => payload.value?.kind === 'install-help')

const trayPlacement = computed(() => payload.value?.edge ?? 'top')
const trayAlign = computed(() => payload.value?.align ?? 'end')
const trayTitle = computed(() => (
  isInstallHelp.value ? 'Add to Home Screen' : undefined
))

const message = computed(() => {
  const data = payload.value
  if (!data) return ''
  if (data.kind === 'error') return data.message
  if (data.kind === 'install-help') return 'Add to Home Screen'
  return `${data.trackTitle} successfully added to ${data.cardTitle}`
})

const canUpdatePlaylists = computed(() => Boolean(
  editor?.selectedCardId.value
  && editor?.isDirty.value
  && !editor?.loading.value
  && !editor?.isPodcast.value
  && !editor?.hasActiveSaves.value,
))

const overCapacity = computed(() => {
  const snapshot = getPlaylistCapacitySnapshot(editor?.playlist.value ?? [])
  const { trackCount, trackMax, knownDurationSeconds, durationMax } = snapshot
  const overTracks = trackMax > 0 && trackCount / trackMax >= 1
  const overTime = durationMax > 0 && knownDurationSeconds / durationMax >= 1
  return overTracks || overTime
})

function onUpdatePlaylists() {
  if (!editor || !canUpdatePlaylists.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonPrimary')
  if (overCapacity.value) {
    dismiss()
    showCapacityConfirm.value = true
    return
  }
  dismiss()
  void editor.updateCard()
}

function onConfirmRiskyUpdate() {
  if (!editor || !canUpdatePlaylists.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonPrimary')
  showCapacityConfirm.value = false
  void editor.updateCard({ acknowledgeCapacityRisk: true })
}

function onCancelRiskyUpdate() {
  playEvent('resetPlaylist')
  showCapacityConfirm.value = false
}

function onDismiss() {
  dismiss()
}

function toastError(msg: string, prev: string) {
  if (!msg || msg === prev) return
  showError(msg)
}

watch(
  () => editor?.errorMessage.value ?? '',
  (msg, prev) => toastError(msg, prev ?? ''),
)

watch(
  () => yoto?.errorMessage.value ?? '',
  (msg, prev) => toastError(msg, prev ?? ''),
)

watch(open, (isOpen, wasOpen) => {
  if (isOpen) {
    playEvent(isErrorToast.value ? 'saveError' : 'notification')
    return
  }
  if (wasOpen && persistent.value) playEvent('toastDismiss')
})

watch(() => chrome?.isPhone.value, (phone) => {
  if (phone === false) {
    showCapacityConfirm.value = false
  }
})
</script>

<template>
  <Tray
    v-model:open="trayOpen"
    :placement="trayPlacement"
    :align="trayAlign"
    :title="trayTitle"
    variant="toast"
    height="auto"
    :show-backdrop="false"
    :play-sounds="false"
    :role="isErrorToast ? 'alert' : 'status'"
    :aria-label="message"
  >
    <template
      v-if="persistent || isErrorToast"
      #badge
    >
      <button
        type="button"
        class="toast__dismiss"
        aria-label="Dismiss"
        @click="onDismiss"
      >
        <span
          class="toast__dismiss-mark"
          aria-hidden="true"
        >×</span>
      </button>
    </template>
    <div
      v-if="payload?.kind === 'added'"
      class="toast__stack"
    >
      <p class="toast__message type-body m-0">
        <span class="toast__emphasis font-maru-medium">{{ payload.trackTitle }}</span>
        successfully added to
        <span class="toast__emphasis font-maru-medium">{{ payload.cardTitle }}</span>
      </p>
      <button
        type="button"
        class="toast__update"
        :disabled="!canUpdatePlaylists"
        @click="onUpdatePlaylists"
      >
        <span class="toast__update-label">Update Playlists</span>
      </button>
    </div>

    <div
      v-else-if="payload?.kind === 'error'"
      class="toast__stack toast__stack--error"
    >
      <p class="toast__message type-body m-0">
        {{ payload.message }}
      </p>
    </div>

    <p
      v-else-if="payload?.kind === 'install-help'"
      class="pwa-install-help__steps type-title m-0"
    >
      <template v-if="platform === 'ios'">
        Tap
        <strong class="font-maru-bold">Share</strong>
        in the browser toolbar, then
        <strong class="font-maru-bold">Add to Home Screen</strong>, then
        <strong class="font-maru-bold">Add</strong>.
      </template>
      <template v-else>
        Open the browser menu, then tap
        <strong class="font-maru-bold">Install app</strong>
        or
        <strong class="font-maru-bold">Add to Home Screen</strong>.
      </template>
    </p>
  </Tray>

  <Teleport to="body">
    <div
      v-if="showCapacityConfirm"
      class="mobile-overflow-menu__confirm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="toast-capacity-title"
    >
      <div class="mobile-overflow-menu__confirm-card border-maru rounded-maru">
        <p
          id="toast-capacity-title"
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
</template>
