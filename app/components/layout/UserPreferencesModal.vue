<script setup lang="ts">
import { useUserPreferences } from '~/composables/useUserPreferences'
import { useDesktopHost } from '~/composables/useDesktopHost'
import { usePreferencesShell } from '~/composables/usePreferencesShell'
import DesktopApiKeysFields from '~/components/desktop/DesktopApiKeysFields.vue'
import ToolsUpdateSection from '~/components/layout/ToolsUpdateSection.vue'
import AppFlyout from '~/components/layout/AppFlyout.vue'

type PrefsNav = 'general' | 'advanced'

const open = defineModel<boolean>('open', { default: false })

const { play, playEvent, muted, setMuted } = useUiSound()
const {
  showDebugPanel,
  searchPlaceholdersText,
  setShowDebugPanel,
  setSearchPlaceholdersFromText,
} = useUserPreferences()
const { isDesktop, desktopPrefsDebug, getConfig, setConfig, getRedirectUri } = useDesktopHost()
const { open: shellOpen } = usePreferencesShell()

const runtimeConfig = useRuntimeConfig()
const appVersion = computed(() => String(runtimeConfig.public.appVersion || '0.0.0'))

const prefsNav = ref<PrefsNav>('general')
const placeholdersDraft = ref('')

const yotoClientIdDraft = ref('')
const youtubeApiKeyDraft = ref('')
const ytdlpCookiesDraft = ref('')
const redirectUri = ref('http://127.0.0.1:4010/api/yoto/auth/callback')
const credentialsBaseline = ref({
  yotoClientId: '',
  youtubeApiKey: '',
  ytdlpCookiesFile: '',
})
const credentialsSaving = ref(false)
const credentialsError = ref('')

const headingId = 'user-prefs-heading'
const navId = 'user-prefs-nav'

const formInteractive = computed(() => open.value && !credentialsSaving.value)

const credentialsDirty = computed(() => {
  if (!isDesktop.value) return false
  return (
    yotoClientIdDraft.value.trim() !== credentialsBaseline.value.yotoClientId
    || youtubeApiKeyDraft.value.trim() !== credentialsBaseline.value.youtubeApiKey
    || ytdlpCookiesDraft.value.trim() !== credentialsBaseline.value.ytdlpCookiesFile
  )
})

const doneLabel = computed(() => {
  if (credentialsSaving.value) return 'Saving…'
  if (!credentialsDirty.value) return 'Done'
  return desktopPrefsDebug.value ? 'Save' : 'Save & restart'
})

function syncDraftFromPrefs() {
  placeholdersDraft.value = searchPlaceholdersText.value
}

async function syncDesktopCredentials() {
  if (!isDesktop.value) return
  credentialsError.value = ''
  try {
    const [config, uri] = await Promise.all([getConfig(), getRedirectUri()])
    yotoClientIdDraft.value = config.yotoClientId
    youtubeApiKeyDraft.value = config.youtubeApiKey
    ytdlpCookiesDraft.value = config.ytdlpCookiesFile
    credentialsBaseline.value = {
      yotoClientId: config.yotoClientId,
      youtubeApiKey: config.youtubeApiKey,
      ytdlpCookiesFile: config.ytdlpCookiesFile,
    }
    redirectUri.value = uri
    // First-run / missing keys: land on Advanced where Desktop API keys live.
    if (!config.yotoClientId.trim() || !config.youtubeApiKey.trim()) {
      prefsNav.value = 'advanced'
    }
  }
  catch (err) {
    credentialsError.value = err instanceof Error ? err.message : 'Could not load desktop config'
    prefsNav.value = 'advanced'
  }
}

function setPrefsNav(next: PrefsNav) {
  if (!formInteractive.value || prefsNav.value === next) return
  prefsNav.value = next
  playEvent('buttonClick')
}

function beginOpen() {
  prefsNav.value = 'general'
  syncDraftFromPrefs()
  void syncDesktopCredentials()
  playEvent('toggleOn')
}

function onFlyoutClose() {
  if (credentialsSaving.value) return
  playEvent('buttonClick')
  shellOpen.value = false
}

function finishClose() {
  open.value = false
  shellOpen.value = false
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

async function saveDesktopCredentials(): Promise<boolean> {
  const yoto = yotoClientIdDraft.value.trim()
  const youtube = youtubeApiKeyDraft.value.trim()
  if (!yoto || !youtube) {
    credentialsError.value = 'Yoto client ID and YouTube API key are required.'
    prefsNav.value = 'advanced'
    return false
  }

  credentialsSaving.value = true
  credentialsError.value = ''
  playEvent('buttonPrimary')
  try {
    const saved = await setConfig({
      yotoClientId: yoto,
      youtubeApiKey: youtube,
      ytdlpCookiesFile: ytdlpCookiesDraft.value.trim(),
    })
    credentialsBaseline.value = {
      yotoClientId: saved.yotoClientId,
      youtubeApiKey: saved.youtubeApiKey,
      ytdlpCookiesFile: saved.ytdlpCookiesFile,
    }
    return true
  }
  catch (err) {
    credentialsError.value = err instanceof Error ? err.message : 'Save failed'
    return false
  }
  finally {
    credentialsSaving.value = false
  }
}

/** Done closes; if desktop API keys changed, save first (Electron restarts Nitro). */
async function onDone() {
  if (!formInteractive.value) return
  if (credentialsDirty.value) {
    const ok = await saveDesktopCredentials()
    if (!ok) return
  }
  else {
    playEvent('buttonClick')
  }
  finishClose()
}

watch(open, (isOpen) => {
  if (isOpen) {
    shellOpen.value = true
    beginOpen()
    return
  }
  shellOpen.value = false
})

watch(shellOpen, (isOpen) => {
  if (isOpen && !open.value) open.value = true
})
</script>

<template>
  <AppFlyout
    v-model:open="open"
    title="Settings"
    :heading-id="headingId"
    heading-tone="white"
    header-class="bg-maru-yellow"
    face-class="bg-maru-white"
    size="lg"
    :z-index="130"
    dismiss-label="Close settings"
    :dismiss-disabled="credentialsSaving"
    :pad-body="false"
    :body-scroll="false"
    body-class="prefs-projector__layout-wrap"
    @close="onFlyoutClose"
  >
            <div class="prefs-projector__layout">
              <nav
                :id="navId"
                class="prefs-projector__nav"
                aria-label="Settings sections"
              >
                <button
                  type="button"
                  class="prefs-projector__nav-item"
                  :class="{ 'prefs-projector__nav-item--active': prefsNav === 'general' }"
                  :aria-current="prefsNav === 'general' ? 'page' : undefined"
                  :disabled="!formInteractive"
                  @click="setPrefsNav('general')"
                >
                  General
                </button>
                <button
                  type="button"
                  class="prefs-projector__nav-item"
                  :class="{ 'prefs-projector__nav-item--active': prefsNav === 'advanced' }"
                  :aria-current="prefsNav === 'advanced' ? 'page' : undefined"
                  :disabled="!formInteractive"
                  @click="setPrefsNav('advanced')"
                >
                  Advanced
                </button>
              </nav>

              <div
                class="prefs-projector__pane"
                role="region"
                :aria-label="prefsNav === 'general' ? 'General' : 'Advanced'"
                tabindex="0"
              >
                <div
                  v-show="prefsNav === 'general'"
                  class="prefs-projector__pane-inner"
                >
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
                </div>

                <div
                  v-show="prefsNav === 'advanced'"
                  class="prefs-projector__pane-inner"
                >
                  <div
                    v-if="isDesktop"
                    class="prefs-projector__section"
                  >
                    <p class="prefs-projector__section-title">
                      Desktop API keys
                    </p>
                    <p
                      v-if="desktopPrefsDebug"
                      class="prefs-projector__hint"
                    >
                      Dev preview (<span class="font-maru-mono">?desktopPrefs=1</span>) — changes save when you press Done (sessionStorage mock).
                    </p>
                    <p
                      v-else
                      class="prefs-projector__hint"
                    >
                      Stored in app data (not a checkout <span class="font-maru-mono">.env</span>). Changing keys and pressing Done restarts the local server.
                    </p>

                    <DesktopApiKeysFields
                      v-model:yoto-client-id="yotoClientIdDraft"
                      v-model:youtube-api-key="youtubeApiKeyDraft"
                      v-model:ytdlp-cookies-file="ytdlpCookiesDraft"
                      :redirect-uri="redirectUri"
                      :disabled="!formInteractive"
                      id-prefix="prefs"
                      :error="credentialsError"
                    />
                  </div>

                  <ToolsUpdateSection :disabled="!formInteractive || credentialsSaving" />

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
                </div>
              </div>
            </div>

    <template #footer>
      <p class="prefs-projector__meta-line">
        Louis v{{ appVersion }}
      </p>
      <button
        type="button"
        class="panel-footer-btn panel-footer-btn--short panel-footer-btn--primary shrink-0"
        :disabled="!formInteractive"
        @click="onDone"
      >
        <span class="panel-footer-btn__label">{{ doneLabel }}</span>
      </button>
    </template>
  </AppFlyout>
</template>
