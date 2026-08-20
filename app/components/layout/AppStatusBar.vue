<script setup lang="ts">
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'
import HowToModal from '~/components/layout/HowToModal.vue'
import { usePreferencesShell } from '~/composables/usePreferencesShell'
import { useDesktopHost } from '~/composables/useDesktopHost'

const yoto = inject(YOTO_MYO_KEY)
if (!yoto) {
  throw new Error('AppStatusBar requires YOTO_MYO_KEY provider')
}

const { playEvent } = useUiSound()
const { openPreferences } = usePreferencesShell()
const { isDesktop } = useDesktopHost()
const {
  showInstallItem,
  canPrompt,
  promptInstall,
} = usePwaInstall()
const { showInstallHelp } = useToast()

const { connected, status, refresh, disconnect, hasWriteScope, connect, errorMessage } = yoto

const howToOpen = ref(false)

const needsReconnect = computed(
  () => connected.value && !hasWriteScope.value,
)

const authStatusLabel = computed(() => {
  if (status.value === 'loading') return 'Checking Yoto…'
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

function onOpenPreferences() {
  playEvent('buttonClick')
  openPreferences()
}

function onInstall() {
  playEvent('buttonClick')
  if (canPrompt.value) {
    void promptInstall()
    return
  }
  showInstallHelp()
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
    class="status-bar panel-footer-lip panel-footer-lip--short border-maru rounded-maru bg-maru-magenta-lighter text-maru-black w-full px-3 sm:px-4"
  >
    <div class="status-bar__cluster status-bar__cluster--status min-w-0 items-center">
      <span
        class="status-dot shrink-0 self-center"
        :class="statusDotClass"
        aria-hidden="true"
      />
      <span class="status-bar__label truncate self-center">
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
        Help
      </button>

      <a
        class="status-bar__action"
        href="https://docs.google.com/forms/d/e/1FAIpQLSccwkdCpYaJjODtpxSrtBIaye045nobwudH1L0VX8S6NzFtjA/viewform?usp=publish-editor"
        target="_blank"
        rel="noopener noreferrer"
      >
        Report Issues
      </a>

      <button
        type="button"
        class="status-bar__action"
        @click="onOpenPreferences"
      >
        Settings
      </button>

      <button
        v-if="showInstallItem"
        type="button"
        class="status-bar__action"
        @click="onInstall"
      >
        Add to Home
      </button>

      <button
        v-if="status === 'unconfigured'"
        type="button"
        class="status-bar__action status-bar__action--emphasis"
        @click="onOpenPreferences"
      >
        {{ isDesktop ? 'Add API keys' : 'Settings' }}
      </button>

      <button
        v-if="status === 'disconnected'"
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
        v-if="connected"
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
  </div>
</template>
