<script setup lang="ts">
import Tray from '~/components/ui/Tray.vue'
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'
import { defaultToastPlacement } from '~/composables/useToast'

const { open, payload, persistent, dismiss, showError } = useToast()
const { platform } = usePwaInstall()
const { playEvent } = useUiSound()
const editor = inject(MYO_EDITOR_KEY, null)
const yoto = inject(YOTO_MYO_KEY, null)

const trayOpen = computed({
  get: () => open.value,
  set: (value: boolean) => {
    if (!value) dismiss()
  },
})

const isErrorToast = computed(() => payload.value?.kind === 'error')
const isDuplicateToast = computed(() => payload.value?.kind === 'duplicate')
const isInstallHelp = computed(() => payload.value?.kind === 'install-help')

const trayFallback = defaultToastPlacement()
const trayPlacement = computed(() => payload.value?.edge ?? trayFallback.edge)
const trayAlign = computed(() => payload.value?.align ?? trayFallback.align)
const trayTitle = computed(() => {
  if (isInstallHelp.value) return 'Add to Home Screen'
  if (isDuplicateToast.value) return 'Duplicate Track added'
  return undefined
})

const message = computed(() => {
  const data = payload.value
  if (!data) return ''
  if (data.kind === 'error') return data.message
  if (data.kind === 'install-help') return 'Add to Home Screen'
  if (data.kind === 'duplicate') {
    return `${data.trackTitle} is already on this playlist. It will not be added again.`
  }
  return `${data.trackTitle} successfully added to ${data.cardTitle}`
})

const canUpdatePlaylists = computed(() => Boolean(
  editor?.selectedCardId.value
  && editor?.isDirty.value
  && !editor?.loading.value
  && !editor?.isPodcast.value
  && !editor?.hasActiveSaves.value,
))

function onUpdatePlaylists() {
  if (!editor || !canUpdatePlaylists.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonPrimary')
  dismiss()
  editor.requestUpdate('dialog')
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
    playEvent(isErrorToast.value ? 'saveError' : isDuplicateToast.value ? 'disabled' : 'notification')
    return
  }
  if (wasOpen && persistent.value) playEvent('toastDismiss')
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
      v-else-if="payload?.kind === 'duplicate'"
      class="toast__stack"
    >
      <p class="toast__message type-title m-0">
        <span class="toast__emphasis font-maru-bold">{{ payload.trackTitle }}</span>
        is already on this playlist. It will not be added again.
      </p>
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
</template>
