<script setup lang="ts">
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'
import HowToModal from '~/components/layout/HowToModal.vue'
import UserPreferencesModal from '~/components/layout/UserPreferencesModal.vue'

const yoto = inject(YOTO_MYO_KEY)
if (!yoto) {
  throw new Error('AppStatusBar requires YOTO_MYO_KEY provider')
}

const { playEvent } = useUiSound()

const { connected, status, refresh, disconnect, hasWriteScope, connect, errorMessage } = yoto

const prefsOpen = ref(false)
const howToOpen = ref(false)

const needsReconnect = computed(
  () => connected.value && !hasWriteScope.value,
)

const authStatusLabel = computed(() => {
  if (status.value === 'unconfigured') return 'Yoto API not configured'
  if (status.value === 'error') return 'Yoto connection error'
  if (status.value === 'disconnected') return 'Not connected to Yoto'
  if (needsReconnect.value) return 'Reconnect to enable saving'
  if (connected.value) return 'Connected to Yoto'
  return ''
})

const statusDotClass = computed(() => {
  if (status.value === 'error') return 'status-dot--error'
  if (status.value === 'disconnected' || status.value === 'unconfigured' || needsReconnect.value) {
    return 'status-dot--warn'
  }
  if (connected.value) return 'status-dot--ok'
  return 'status-dot--warn'
})

function openHowTo() {
  playEvent('buttonClick')
  howToOpen.value = true
}

function openPreferences() {
  playEvent('buttonClick')
  prefsOpen.value = true
}

function onConnect() {
  playEvent('buttonPrimary')
  connect()
}

function onDisconnect() {
  playEvent('buttonClick')
  disconnect()
}

function onRetry() {
  playEvent('buttonClick')
  refresh()
}
</script>

<template>
  <div
    v-if="status !== 'loading'"
    class="status-bar panel-footer-lip panel-footer-lip--short border-maru rounded-maru bg-maru-magenta-lighter text-maru-black w-full px-3 sm:px-4"
  >
    <div class="status-bar__cluster status-bar__cluster--status min-w-0 items-center">
      <span
        class="status-dot shrink-0 self-center"
        :class="statusDotClass"
        aria-hidden="true"
      />
      <span class="status-bar__label font-maru-medium truncate self-center">
        {{ authStatusLabel }}
      </span>
      <span
        v-if="status === 'error' && errorMessage"
        class="status-bar__meta text-maru-red truncate max-w-[12rem] sm:max-w-[20rem]"
        :title="errorMessage"
      >
        {{ errorMessage }}
      </span>
    </div>

    <div class="status-bar__cluster status-bar__cluster--actions shrink-0">
      <button
        type="button"
        class="status-bar__action"
        @click="openHowTo"
      >
        How To
      </button>

      <a
        class="status-bar__action"
        href="https://docs.google.com/forms/d/e/1FAIpQLSccwkdCpYaJjODtpxSrtBIaye045nobwudH1L0VX8S6NzFtjA/viewform?usp=publish-editor"
        target="_blank"
        rel="noopener noreferrer"
      >
        Issue / Feedback
      </a>

      <button
        type="button"
        class="status-bar__action"
        @click="openPreferences"
      >
        Preferences
      </button>

      <button
        v-if="status === 'disconnected' || status === 'unconfigured'"
        type="button"
        class="status-bar__action status-bar__action--emphasis"
        @click="onConnect"
      >
        Connect
      </button>

      <button
        v-if="needsReconnect"
        type="button"
        class="status-bar__action status-bar__action--emphasis"
        @click="onConnect"
      >
        Reconnect
      </button>

      <button
        v-if="connected && status === 'idle'"
        type="button"
        class="status-bar__action"
        @click="onDisconnect"
      >
        Sign out
      </button>

      <button
        v-if="status === 'error'"
        type="button"
        class="status-bar__action status-bar__action--emphasis"
        @click="onRetry"
      >
        Retry
      </button>
    </div>

    <HowToModal v-model:open="howToOpen" />
    <UserPreferencesModal v-model:open="prefsOpen" />
  </div>
</template>
