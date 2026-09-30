<script setup lang="ts">
const props = defineProps<{
  disabled?: boolean
}>()

const { playEvent } = useUiSound()
const {
  status,
  showUpdateControls,
  openUpdate,
} = useDesktopAppUpdate()

const openError = ref('')

const updateAvailable = computed(() => status.value?.state === 'available')

const statusMessage = computed(() => {
  const current = status.value
  if (!current || current.state === 'available') return ''
  if (current.state === 'checking') return 'Checking GitHub for a newer Louis release…'
  if (current.state === 'current') return `Louis v${current.currentVersion} is up to date.`
  if (current.state === 'unsupported') return current.message || 'No installer is available for this platform.'
  if (current.state === 'error') return current.message || 'Could not check for Louis updates.'
  return ''
})

const showActions = computed(() =>
  updateAvailable.value || Boolean(status.value?.releaseUrl),
)

const isError = computed(() =>
  Boolean(openError.value) || status.value?.state === 'error',
)

async function onOpen(target: 'installer' | 'release') {
  if (props.disabled) return
  playEvent(target === 'installer' ? 'buttonPrimary' : 'buttonClick')
  openError.value = ''
  try {
    await openUpdate(target)
  }
  catch {
    openError.value = 'Could not open the Louis download page.'
  }
}
</script>

<template>
  <div
    v-if="showUpdateControls"
    class="prefs-projector__section"
  >
    <p class="prefs-projector__section-title">
      Louis updates
    </p>
    <p class="prefs-projector__hint">
      Louis checks the latest stable GitHub release. Updates download in your browser and install normally.
    </p>

    <p
      v-if="updateAvailable"
      class="desktop-app-update__notice"
      role="status"
    >
      <span class="desktop-app-update__kicker">Update Available</span>
      Louis v{{ status?.latestVersion }} is available.
    </p>

    <p
      v-if="statusMessage || openError"
      class="prefs-projector__hint"
      :class="{ 'prefs-projector__error': isError }"
      role="status"
    >
      {{ openError || statusMessage }}
    </p>

    <div
      v-if="showActions"
      class="prefs-projector__file-row"
    >
      <button
        v-if="updateAvailable"
        type="button"
        class="prefs-projector__browse maru-button maru-button--sm bg-maru-blue text-maru-white"
        :disabled="disabled"
        @click="onOpen('installer')"
      >
        <span class="maru-button__label">Download v{{ status?.latestVersion }}</span>
      </button>
      <button
        v-if="status?.releaseUrl"
        type="button"
        class="prefs-projector__browse maru-button maru-button--sm bg-maru-white text-maru-black"
        :disabled="disabled"
        @click="onOpen('release')"
      >
        <span class="maru-button__label">Release notes</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.desktop-app-update__notice {
  margin: 0;
  font-size: var(--text-maru-label);
  line-height: 1.35;
  letter-spacing: 0.01em;
  font-weight: 400;
  color: var(--color-maru-gray);
  font-variant-numeric: tabular-nums;
}

.desktop-app-update__kicker {
  display: block;
  width: fit-content;
  margin: 0 0 0.3rem;
  /* Saeada caps sit high in the em box — extra top padding centers the ink. */
  padding: 0.28em 0.42em 0.16em 0.5em;
  border: 2px solid var(--color-maru-black);
  background: var(--color-maru-yellow);
  box-shadow: 2px 2px 0 var(--color-maru-black);
  font-family: var(--font-maru);
  font-size: var(--text-maru-caption);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-maru-black);
}
</style>
