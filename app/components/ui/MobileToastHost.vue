<script setup lang="ts">
import MobileTray from '~/components/ui/MobileTray.vue'
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'
import { MOBILE_EDITOR_CHROME_KEY } from '~/composables/useMobileEditorChrome'
import {
  getPlaylistCapacitySnapshot,
} from '#shared/myo-editor/yotoMyoLimits'

const { open, payload, dismiss, showError } = useMobileToast()
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

const message = computed(() => {
  const data = payload.value
  if (!data) return ''
  if (data.kind === 'error') return data.message
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

function toastPhoneError(msg: string, prev: string) {
  if (!chrome?.isPhone.value) return
  if (!msg || msg === prev) return
  showError(msg)
}

watch(
  () => editor?.errorMessage.value ?? '',
  (msg, prev) => toastPhoneError(msg, prev ?? ''),
)

watch(
  () => yoto?.errorMessage.value ?? '',
  (msg, prev) => toastPhoneError(msg, prev ?? ''),
)

watch(open, (isOpen) => {
  if (!isOpen) return
  playEvent(isErrorToast.value ? 'saveError' : 'notification')
})

watch(() => chrome?.isPhone.value, (phone) => {
  if (phone === false) {
    dismiss()
    showCapacityConfirm.value = false
  }
})
</script>

<template>
  <MobileTray
    v-model:open="trayOpen"
    placement="top"
    variant="toast"
    height="auto"
    :show-backdrop="false"
    :play-sounds="false"
    :role="isErrorToast ? 'alert' : 'status'"
    :aria-label="message"
  >
    <div
      v-if="payload?.kind === 'added'"
      class="mobile-toast__stack"
    >
      <p class="mobile-toast__message type-body m-0">
        <span class="mobile-toast__emphasis font-maru-medium">{{ payload.trackTitle }}</span>
        successfully added to
        <span class="mobile-toast__emphasis font-maru-medium">{{ payload.cardTitle }}</span>
      </p>
      <button
        type="button"
        class="mobile-toast__update"
        :disabled="!canUpdatePlaylists"
        @click="onUpdatePlaylists"
      >
        <span class="mobile-toast__update-label">Update Playlists</span>
      </button>
    </div>

    <div
      v-else-if="payload?.kind === 'error'"
      class="mobile-toast__stack mobile-toast__stack--error"
    >
      <p class="mobile-toast__message type-body m-0">
        {{ payload.message }}
      </p>
    </div>
  </MobileTray>

  <Teleport to="body">
    <div
      v-if="showCapacityConfirm"
      class="mobile-overflow-menu__confirm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-toast-capacity-title"
    >
      <div class="mobile-overflow-menu__confirm-card border-maru rounded-maru">
        <p
          id="mobile-toast-capacity-title"
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
