<script setup lang="ts">
import { useUserPreferences } from '~/composables/useUserPreferences'
import { useDesktopHost } from '~/composables/useDesktopHost'
import { usePreferencesShell } from '~/composables/usePreferencesShell'

type Phase = 'idle' | 'entering' | 'open' | 'exiting'

const open = defineModel<boolean>('open', { default: false })

const { play, playEvent, muted, setMuted } = useUiSound()
const {
  showDebugPanel,
  searchPlaceholdersText,
  setShowDebugPanel,
  setSearchPlaceholdersFromText,
} = useUserPreferences()
const { isDesktop, getConfig, setConfig, pickCookiesFile, getRedirectUri } = useDesktopHost()
const { open: shellOpen } = usePreferencesShell()

const runtimeConfig = useRuntimeConfig()
const demoMode = computed(() => Boolean(runtimeConfig.public.demoMode))
const appVersion = computed(() => String(runtimeConfig.public.appVersion || '0.0.0'))

const phase = ref<Phase>('idle')
const prefersReducedMotion = ref(false)
const placeholdersDraft = ref('')

const yotoClientIdDraft = ref('')
const youtubeApiKeyDraft = ref('')
const ytdlpCookiesDraft = ref('')
const redirectUri = ref('http://127.0.0.1:4010/api/yoto/auth/callback')
const credentialsSaving = ref(false)
const credentialsError = ref('')
const credentialsSavedFlash = ref(false)

const headingId = 'user-prefs-heading'
const prefsTitleChars = 'Preferences'.split('')
let timers: ReturnType<typeof setTimeout>[] = []

const visible = computed(
  () => phase.value === 'entering' || phase.value === 'open' || phase.value === 'exiting',
)

const formInteractive = computed(() => phase.value === 'open' && !credentialsSaving.value)

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

async function syncDesktopCredentials() {
  if (!isDesktop.value) return
  credentialsError.value = ''
  credentialsSavedFlash.value = false
  try {
    const [config, uri] = await Promise.all([getConfig(), getRedirectUri()])
    yotoClientIdDraft.value = config.yotoClientId
    youtubeApiKeyDraft.value = config.youtubeApiKey
    ytdlpCookiesDraft.value = config.ytdlpCookiesFile
    redirectUri.value = uri
  }
  catch (err) {
    credentialsError.value = err instanceof Error ? err.message : 'Could not load desktop config'
  }
}

function beginOpen() {
  clearTimers()
  syncDraftFromPrefs()
  void syncDesktopCredentials()
  phase.value = 'entering'
  playEvent('toggleOn')

  if (prefersReducedMotion.value) {
    after(280, () => {
      phase.value = 'open'
    })
    return
  }

  after(1300, () => {
    if (phase.value === 'entering') phase.value = 'open'
  })
}

function beginClose() {
  if (phase.value !== 'open' && phase.value !== 'entering') return
  if (credentialsSaving.value) return
  clearTimers()
  phase.value = 'exiting'
  playEvent('buttonClick')

  if (prefersReducedMotion.value) {
    after(280, () => {
      phase.value = 'idle'
      open.value = false
      shellOpen.value = false
    })
    return
  }

  after(320, () => {
    phase.value = 'idle'
    open.value = false
    shellOpen.value = false
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

async function onPickCookies() {
  if (!formInteractive.value) return
  playEvent('buttonClick')
  const picked = await pickCookiesFile()
  if (picked) ytdlpCookiesDraft.value = picked
}

async function onSaveCredentials() {
  if (!isDesktop.value || !formInteractive.value) return
  credentialsSaving.value = true
  credentialsError.value = ''
  credentialsSavedFlash.value = false
  playEvent('buttonPrimary')
  try {
    await setConfig({
      yotoClientId: yotoClientIdDraft.value.trim(),
      youtubeApiKey: youtubeApiKeyDraft.value.trim(),
      ytdlpCookiesFile: ytdlpCookiesDraft.value.trim(),
      yotoClientSecret: '',
    })
    credentialsSavedFlash.value = true
  }
  catch (err) {
    credentialsError.value = err instanceof Error ? err.message : 'Save failed'
    credentialsSaving.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    shellOpen.value = true
    if (phase.value === 'idle') beginOpen()
    return
  }
  if (phase.value === 'open' || phase.value === 'entering') {
    beginClose()
  }
})

watch(shellOpen, (isOpen) => {
  if (isOpen && !open.value) open.value = true
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

            <div
              v-if="isDesktop"
              class="prefs-projector__section"
            >
              <p class="prefs-projector__section-title">
                Desktop API keys
              </p>
              <p class="prefs-projector__hint">
                Stored in app data (not a checkout <span class="font-maru-mono">.env</span>). Saving restarts the local server.
              </p>

              <div class="prefs-projector__field">
                <label
                  class="prefs-projector__label"
                  for="prefs-yoto-client-id"
                >Yoto client ID</label>
                <input
                  id="prefs-yoto-client-id"
                  v-model="yotoClientIdDraft"
                  class="prefs-projector__input font-maru-mono"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  :disabled="!formInteractive"
                  placeholder="Public PKCE client from yoto.dev"
                >
              </div>

              <div class="prefs-projector__field">
                <label
                  class="prefs-projector__label"
                  for="prefs-youtube-api-key"
                >YouTube Data API key</label>
                <input
                  id="prefs-youtube-api-key"
                  v-model="youtubeApiKeyDraft"
                  class="prefs-projector__input font-maru-mono"
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  :disabled="!formInteractive"
                  placeholder="Google Cloud Console key"
                >
              </div>

              <div class="prefs-projector__field">
                <label
                  class="prefs-projector__label"
                  for="prefs-ytdlp-cookies"
                >yt-dlp cookies.txt (optional)</label>
                <div class="prefs-projector__file-row">
                  <input
                    id="prefs-ytdlp-cookies"
                    v-model="ytdlpCookiesDraft"
                    class="prefs-projector__input font-maru-mono"
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    :disabled="!formInteractive"
                    placeholder="/path/to/cookies.txt"
                  >
                  <button
                    type="button"
                    class="prefs-projector__browse maru-button"
                    :disabled="!formInteractive"
                    @click="onPickCookies"
                  >
                    <span class="maru-button__label">Browse</span>
                  </button>
                </div>
              </div>

              <div class="prefs-projector__field">
                <span class="prefs-projector__label">OAuth redirect URI</span>
                <code class="prefs-projector__code font-maru-mono">{{ redirectUri }}</code>
                <p class="prefs-projector__hint">
                  Register this exact URI on your Yoto developer app.
                </p>
              </div>

              <p
                v-if="credentialsError"
                class="prefs-projector__error"
              >
                {{ credentialsError }}
              </p>
              <p
                v-else-if="credentialsSavedFlash"
                class="prefs-projector__hint"
              >
                Saved.
              </p>

              <button
                type="button"
                class="prefs-projector__done maru-button bg-maru-green-light"
                :disabled="!formInteractive"
                @click="onSaveCredentials"
              >
                <span class="maru-button__label">{{ credentialsSaving ? 'Saving…' : 'Save & restart' }}</span>
              </button>
            </div>

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

            <footer class="prefs-projector__meta">
              <p class="prefs-projector__meta-line">
                Louis v{{ appVersion }}
              </p>
              <p
                v-if="demoMode"
                class="prefs-projector__meta-line"
              >
                Demo instance — connect Yoto at your own risk. Downloads use a shared identity; self-host for production.
              </p>
            </footer>
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
