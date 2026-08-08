<script setup lang="ts">
import MaruTooltip from '~/components/ui/MaruTooltip.vue'
import { useDesktopHost } from '~/composables/useDesktopHost'

const YOTO_DEV_URL = 'https://yoto.dev/get-started/start-here/'
const YOUTUBE_API_URL = 'https://console.cloud.google.com/apis/library/youtube.googleapis.com'
const YTDLP_COOKIES_URL = 'https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies'

const props = withDefaults(defineProps<{
  redirectUri: string
  disabled?: boolean
  /** Prefix for input ids so prefs + setup can coexist. */
  idPrefix?: string
  error?: string
  /** When true, wrap each field in staggered enter fieldsets. */
  stagger?: boolean
  /** Start stagger after mount (setup screen). */
  animateIn?: boolean
  /** Show a single field (wizard step). Omit to show all. */
  only?: 'yoto' | 'youtube' | 'cookies' | 'redirect' | null
}>(), {
  disabled: false,
  idPrefix: 'desktop-api',
  error: '',
  stagger: false,
  animateIn: false,
  only: null,
})

const yotoClientId = defineModel<string>('yotoClientId', { default: '' })
const youtubeApiKey = defineModel<string>('youtubeApiKey', { default: '' })
const ytdlpCookiesFile = defineModel<string>('ytdlpCookiesFile', { default: '' })

const { pickCookiesFile } = useDesktopHost()
const { playEvent } = useUiSound()

const prefersReducedMotion = ref(false)
const entered = ref(false)
const redirectCopied = ref(false)
let redirectCopiedTimer: ReturnType<typeof setTimeout> | null = null
let focusTimer: ReturnType<typeof setTimeout> | null = null

const yotoInputEl = ref<HTMLInputElement | null>(null)
const youtubeInputEl = ref<HTMLInputElement | null>(null)
const cookiesInputEl = ref<HTMLInputElement | null>(null)
const redirectCopyEl = ref<HTMLButtonElement | null>(null)

const yotoId = computed(() => `${props.idPrefix}-yoto-client-id`)
const youtubeId = computed(() => `${props.idPrefix}-youtube-api-key`)
const cookiesId = computed(() => `${props.idPrefix}-ytdlp-cookies`)

const redirectCopyLabel = computed(() => (redirectCopied.value ? 'Copied' : 'Copy'))

function showField(id: 'yoto' | 'youtube' | 'cookies' | 'redirect') {
  return !props.only || props.only === id
}

function fieldsetClass(_index: number) {
  if (!props.stagger) return undefined
  return {
    'desktop-api-keys__fieldset': true,
    'desktop-api-keys__fieldset--animate': props.animateIn && !prefersReducedMotion.value,
    'desktop-api-keys__fieldset--in': entered.value || prefersReducedMotion.value,
  }
}

function fieldsetStyle(index: number) {
  if (!props.stagger || prefersReducedMotion.value) return undefined
  return { '--desktop-api-keys-stagger': String(index) }
}

function clearRedirectCopiedTimer() {
  if (redirectCopiedTimer) {
    clearTimeout(redirectCopiedTimer)
    redirectCopiedTimer = null
  }
}

function clearFocusTimer() {
  if (focusTimer) {
    clearTimeout(focusTimer)
    focusTimer = null
  }
}

function focusActiveField() {
  if (props.disabled || !props.only) return
  const el
    = props.only === 'yoto' ? yotoInputEl.value
      : props.only === 'youtube' ? youtubeInputEl.value
        : props.only === 'cookies' ? cookiesInputEl.value
          : props.only === 'redirect' ? redirectCopyEl.value
            : null
  el?.focus({ preventScroll: true })
}

function scheduleFocus() {
  if (!props.only) return
  clearFocusTimer()
  // Wait for mount + enter paint so focus isn't stolen mid-FLIP.
  void nextTick(() => {
    focusTimer = setTimeout(() => {
      focusTimer = null
      focusActiveField()
    }, prefersReducedMotion.value ? 0 : 80)
  })
}

async function onCopyRedirect() {
  if (props.disabled || !props.redirectUri) return
  playEvent('select')
  try {
    await navigator.clipboard.writeText(props.redirectUri)
  }
  catch {
    // Fallback for older / restricted contexts.
    const ta = document.createElement('textarea')
    ta.value = props.redirectUri
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  clearRedirectCopiedTimer()
  redirectCopied.value = true
  redirectCopiedTimer = setTimeout(() => {
    redirectCopied.value = false
    redirectCopiedTimer = null
  }, 1400)
}

async function onPickCookies() {
  if (props.disabled) return
  playEvent('buttonClick')
  const picked = await pickCookiesFile()
  if (picked) ytdlpCookiesFile.value = picked
}

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (props.animateIn) {
    requestAnimationFrame(() => {
      entered.value = true
    })
  }
  else {
    entered.value = true
  }
  scheduleFocus()
})

onUnmounted(() => {
  clearRedirectCopiedTimer()
  clearFocusTimer()
})

watch(
  () => props.only,
  () => {
    if (!props.animateIn || prefersReducedMotion.value) {
      entered.value = true
      scheduleFocus()
      return
    }
    entered.value = false
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        entered.value = true
        scheduleFocus()
      })
    })
  },
)
</script>

<template>
  <div class="desktop-api-keys">
    <div
      v-if="showField('yoto')"
      :class="fieldsetClass(0)"
      :style="fieldsetStyle(0)"
    >
      <div class="prefs-projector__field">
        <div class="prefs-projector__label-row">
          <label
            class="prefs-projector__label"
            :for="yotoId"
          >Yoto client ID</label>
          <MaruTooltip
            placement="bottom"
            text="Public PKCE client ID from your Yoto developer app. Leave the client secret empty."
          >
            <button
              type="button"
              class="prefs-projector__help"
              aria-label="About Yoto client ID"
              :disabled="disabled"
            >?</button>
          </MaruTooltip>
        </div>
        <input
          :id="yotoId"
          ref="yotoInputEl"
          v-model="yotoClientId"
          class="prefs-projector__input font-maru-mono"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :disabled="disabled"
          placeholder="Public PKCE client from yoto.dev"
        >
        <p class="prefs-projector__hint">
          Create a <strong>public</strong> (PKCE) app at
          <a
            class="prefs-projector__hint-link"
            :href="YOTO_DEV_URL"
            target="_blank"
            rel="noopener noreferrer"
          >yoto.dev</a>
          and paste the client ID here. No client secret needed.
        </p>
      </div>
    </div>

    <div
      v-if="showField('youtube')"
      :class="fieldsetClass(1)"
      :style="fieldsetStyle(1)"
    >
      <div class="prefs-projector__field">
        <div class="prefs-projector__label-row">
          <label
            class="prefs-projector__label"
            :for="youtubeId"
          >YouTube Data API key</label>
          <MaruTooltip
            placement="bottom"
            text="Server-side key for YouTube Data API v3 search. Restrict it by API in Google Cloud if you can."
          >
            <button
              type="button"
              class="prefs-projector__help"
              aria-label="About YouTube Data API key"
              :disabled="disabled"
            >?</button>
          </MaruTooltip>
        </div>
        <input
          :id="youtubeId"
          ref="youtubeInputEl"
          v-model="youtubeApiKey"
          class="prefs-projector__input font-maru-mono"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :disabled="disabled"
          placeholder="Google Cloud Console key"
        >
        <p class="prefs-projector__hint">
          Enable YouTube Data API v3 in
          <a
            class="prefs-projector__hint-link"
            :href="YOUTUBE_API_URL"
            target="_blank"
            rel="noopener noreferrer"
          >Google Cloud Console</a>,
          create an API key, and paste it here.
        </p>
      </div>
    </div>

    <div
      v-if="showField('cookies')"
      :class="fieldsetClass(2)"
      :style="fieldsetStyle(2)"
    >
      <div class="prefs-projector__field">
        <div class="prefs-projector__label-row">
          <label
            class="prefs-projector__label"
            :for="cookiesId"
          >yt-dlp cookies.txt (optional)</label>
          <MaruTooltip
            placement="bottom"
            text="Netscape cookies.txt from a throwaway Google account. Used only if YouTube blocks anonymous downloads."
          >
            <button
              type="button"
              class="prefs-projector__help"
              aria-label="About yt-dlp cookies"
              :disabled="disabled"
            >?</button>
          </MaruTooltip>
        </div>
        <div class="prefs-projector__file-row">
          <input
            :id="cookiesId"
            ref="cookiesInputEl"
            v-model="ytdlpCookiesFile"
            class="prefs-projector__input font-maru-mono"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :disabled="disabled"
            placeholder="/path/to/cookies.txt"
          >
          <button
            type="button"
            class="prefs-projector__browse maru-button"
            :disabled="disabled"
            @click="onPickCookies"
          >
            <span class="maru-button__label">Browse</span>
          </button>
        </div>
        <p class="prefs-projector__hint">
          Optional. Prefer a burner Google account.
          <a
            class="prefs-projector__hint-link"
            :href="YTDLP_COOKIES_URL"
            target="_blank"
            rel="noopener noreferrer"
          >How to export cookies</a>
          (yt-dlp wiki). Never share or commit this file.
        </p>
      </div>
    </div>

    <div
      v-if="showField('redirect')"
      :class="fieldsetClass(3)"
      :style="fieldsetStyle(3)"
    >
      <div class="prefs-projector__field">
        <div class="prefs-projector__label-row">
          <span class="prefs-projector__label">OAuth redirect URI</span>
          <MaruTooltip
            placement="bottom"
            text="Louis always uses this loopback URI for desktop OAuth. It must match your Yoto app settings exactly."
          >
            <button
              type="button"
              class="prefs-projector__help"
              aria-label="About OAuth redirect URI"
              :disabled="disabled"
            >?</button>
          </MaruTooltip>
        </div>
        <div class="prefs-projector__code-row">
          <code class="prefs-projector__code font-maru-mono">{{ redirectUri }}</code>
          <button
            ref="redirectCopyEl"
            type="button"
            class="prefs-projector__browse prefs-projector__copy maru-button"
            :disabled="disabled"
            :aria-label="redirectCopied ? 'Redirect URI copied' : 'Copy redirect URI'"
            @click="onCopyRedirect"
          >
            <Transition
              name="prefs-copy-label"
              mode="out-in"
            >
              <span
                :key="redirectCopyLabel"
                class="maru-button__label prefs-projector__copy-label"
              >{{ redirectCopyLabel }}</span>
            </Transition>
          </button>
        </div>
        <p class="prefs-projector__hint">
          Add this exact URI on your Yoto developer app at
          <a
            class="prefs-projector__hint-link"
            :href="YOTO_DEV_URL"
            target="_blank"
            rel="noopener noreferrer"
          >yoto.dev</a>
          (port <span class="font-maru-mono">4010</span>, host <span class="font-maru-mono">127.0.0.1</span>).
        </p>
      </div>
    </div>

    <p
      v-if="error"
      class="prefs-projector__error"
      :class="fieldsetClass(4)"
      :style="fieldsetStyle(4)"
    >
      {{ error }}
    </p>
  </div>
</template>
