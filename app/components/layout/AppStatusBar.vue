<script setup lang="ts">
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'

const yoto = inject(YOTO_MYO_KEY)
if (!yoto) {
  throw new Error('AppStatusBar requires YOTO_MYO_KEY provider')
}

const { play, playEvent, muted, setMuted } = useUiSound()

const { connected, status, refresh, disconnect, hasWriteScope, connect, errorMessage } = yoto

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

function toggleSounds() {
  if (muted.value) {
    setMuted(false)
    playEvent('toggleOn')
    return
  }
  play('toggle_off')
  setMuted(true)
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
        :class="{ 'status-bar__action--muted': muted }"
        @click="toggleSounds"
      >
        {{ muted ? 'Sounds off' : 'Sounds on' }}
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
  </div>
</template>
