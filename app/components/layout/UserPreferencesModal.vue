<script setup lang="ts">
import { useUserPreferences } from '~/composables/useUserPreferences'

type Phase = 'idle' | 'entering' | 'open' | 'exiting'

const open = defineModel<boolean>('open', { default: false })

const { play, playEvent, muted, setMuted } = useUiSound()
const {
  showDebugPanel,
  searchPlaceholdersText,
  setShowDebugPanel,
  setSearchPlaceholdersFromText,
} = useUserPreferences()

const phase = ref<Phase>('idle')
const prefersReducedMotion = ref(false)
const placeholdersDraft = ref('')

const headingId = 'user-prefs-heading'
const prefsTitleChars = 'Preferences'.split('')
let timers: ReturnType<typeof setTimeout>[] = []

const visible = computed(
  () => phase.value === 'entering' || phase.value === 'open' || phase.value === 'exiting',
)

const formInteractive = computed(() => phase.value === 'open')

const rootClass = computed(() => ({
  'prefs-projector': true,
  'prefs-projector--entering': phase.value === 'entering',
  'prefs-projector--open': phase.value === 'open',
  'prefs-projector--exiting': phase.value === 'exiting',
  'prefs-projector--reduced': prefersReducedMotion.value,
}))

function clearTimers() {
  for (const t of timers) clearTimeout(t)
  timers = []
}

function after(ms: number, fn: () => void) {
  timers.push(setTimeout(fn, ms))
}

function syncDraftFromPrefs() {
  placeholdersDraft.value = searchPlaceholdersText.value
}

function beginOpen() {
  clearTimers()
  syncDraftFromPrefs()
  phase.value = 'entering'
  playEvent('toggleOn')

  if (prefersReducedMotion.value) {
    after(280, () => {
      phase.value = 'open'
    })
    return
  }

  // lights + screen drop + flicker stabilize
  after(1300, () => {
    if (phase.value === 'entering') phase.value = 'open'
  })
}

function beginClose() {
  if (phase.value !== 'open' && phase.value !== 'entering') return
  clearTimers()
  phase.value = 'exiting'
  playEvent('buttonClick')

  if (prefersReducedMotion.value) {
    after(280, () => {
      phase.value = 'idle'
      open.value = false
    })
    return
  }

  // Fast raise + backdrop fade
  after(320, () => {
    phase.value = 'idle'
    open.value = false
  })
}

function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (phase.value === 'open') {
    event.preventDefault()
    beginClose()
  }
}

function toggleSounds() {
  if (muted.value) {
    setMuted(false)
    playEvent('toggleOn')
    return
  }
  play('toggle_off')
  setMuted(true)
}

function onDebugChange(event: Event) {
  const target = event.target as HTMLInputElement
  setShowDebugPanel(target.checked)
  playEvent('toggleOn')
}

function onPlaceholdersInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  placeholdersDraft.value = target.value
  setSearchPlaceholdersFromText(target.value)
}

watch(open, (isOpen) => {
  if (isOpen) {
    if (phase.value === 'idle') beginOpen()
    return
  }
  if (phase.value === 'open' || phase.value === 'entering') {
    beginClose()
  }
})

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.addEventListener('keydown', onEscape)
})

onUnmounted(() => {
  clearTimers()
  window.removeEventListener('keydown', onEscape)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      :class="rootClass"
      role="presentation"
    >
      <div
        class="prefs-projector__backdrop"
        aria-hidden="true"
        @click="phase === 'open' && beginClose()"
      />

      <div class="prefs-projector__stage">
        <div
          class="prefs-projector__screen"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="headingId"
          :aria-hidden="!formInteractive"
        >
          <div
            class="prefs-projector__projected"
            :class="{ 'prefs-projector__projected--live': formInteractive }"
          >
            <h2
              :id="headingId"
              class="prefs-projector__title maru-heading maru-heading--lg maru-heading--left"
              aria-label="Preferences"
            >
              <span
                v-for="(ch, i) in prefsTitleChars"
                :key="`${ch}-${i}`"
                class="prefs-projector__title-char"
                :data-outline-duplicate-text="ch === ' ' ? '\u00a0' : ch"
                aria-hidden="true"
              >{{ ch === ' ' ? '\u00a0' : ch }}</span>
            </h2>

            <div class="prefs-projector__field prefs-projector__field--row prefs-projector__field--switch">
              <span
                id="prefs-sounds-label"
                class="prefs-projector__label"
              >Sounds</span>
              <button
                type="button"
                class="maru-switch"
                :class="{ 'maru-switch--on': !muted, 'maru-switch--off': muted }"
                role="switch"
                :aria-checked="!muted"
                aria-labelledby="prefs-sounds-label"
                :disabled="!formInteractive"
                @click="toggleSounds"
              >
                <span class="maru-switch__track" aria-hidden="true">
                  <span class="maru-switch__label maru-switch__label--on">On</span>
                  <span class="maru-switch__label maru-switch__label--off">Off</span>
                </span>
                <span class="maru-switch__thumb" aria-hidden="true" />
              </button>
            </div>

            <label class="prefs-projector__field prefs-projector__field--row prefs-projector__field--switch">
              <span class="prefs-projector__label">Enable debug panel</span>
              <span class="maru-checkbox">
                <input
                  type="checkbox"
                  class="maru-checkbox__input"
                  :checked="showDebugPanel"
                  :disabled="!formInteractive"
                  @change="onDebugChange"
                >
                <span
                  class="maru-checkbox__box"
                  aria-hidden="true"
                >
                  <span class="maru-checkbox__mark" />
                </span>
              </span>
            </label>

            <div class="prefs-projector__field">
              <label
                class="prefs-projector__label"
                for="prefs-placeholders"
              >Search placeholders</label>
              <div class="maru-legal-pad">
                <div
                  class="maru-legal-pad__head"
                  aria-hidden="true"
                />
                <textarea
                  id="prefs-placeholders"
                  class="maru-legal-pad__sheet font-maru-mono"
                  rows="5"
                  :value="placeholdersDraft"
                  :disabled="!formInteractive"
                  placeholder="Queen, The Beatles, Sesame Street"
                  @input="onPlaceholdersInput"
                />
              </div>
              <p class="prefs-projector__hint">
                Comma-separated. These will create buttons on the search panel. Leave empty for defaults.
              </p>
            </div>

            <button
              type="button"
              class="prefs-projector__done maru-button bg-maru-yellow"
              :disabled="!formInteractive"
              @click="beginClose"
            >
              <span class="maru-button__label">Done</span>
            </button>
          </div>

          <button
            type="button"
            class="prefs-projector__pull"
            aria-label="Close preferences"
            :disabled="!formInteractive"
            @click="beginClose"
          >
            <span class="prefs-projector__string" aria-hidden="true" />
            <span class="prefs-projector__ring" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
