<script setup lang="ts">
import DesktopApiKeysFields from '~/components/desktop/DesktopApiKeysFields.vue'
import { useDesktopHost } from '~/composables/useDesktopHost'
import { colorForIndex } from '~/utils/howtoBeats'

type SetupStep = 'intro' | 'yoto' | 'youtube' | 'redirect' | 'ready'

const ALL_STEPS: SetupStep[] = ['intro', 'yoto', 'youtube', 'redirect', 'ready']
const FLIP_MS = 340
const FLIP_EASE = 'cubic-bezier(0.2, 0, 0, 1)'
const LEAVE_MS = 320

const emit = defineEmits<{
  /** Fired after save when Electron reload will not happen (or after leave in mock). */
  complete: []
}>()

const { getConfig, setConfig, getRedirectUri, desktopPrefsDebug } = useDesktopHost()
const { playEvent } = useUiSound()

const yotoClientId = ref('')
const youtubeApiKey = ref('')
const redirectUri = ref('http://127.0.0.1:4010/api/yoto/auth/callback')
const bundledYotoClientId = ref('')
const saving = ref(false)
const leaving = ref(false)
const error = ref('')
const ready = ref(false)
const stepIndex = ref(0)
const chromeEntered = ref(false)
const prefersReducedMotion = ref(false)

const louisEl = ref<HTMLElement | null>(null)
const brandEl = ref<HTMLElement | null>(null)
const titleEl = ref<HTMLElement | null>(null)
const ledeEl = ref<HTMLElement | null>(null)
const actionsEl = ref<HTMLElement | null>(null)
const confirmEl = ref<HTMLButtonElement | null>(null)

const usingBundledClient = computed(
  () => Boolean(bundledYotoClientId.value)
    && yotoClientId.value.trim() === bundledYotoClientId.value,
)

/** Default client already has the desktop redirect registered — skip that step. */
const activeSteps = computed(() => (
  usingBundledClient.value
    ? ALL_STEPS.filter(s => s !== 'redirect')
    : ALL_STEPS
))

/** Form field steps after intro (excludes ready confirm). */
const fieldTotal = computed(() => (usingBundledClient.value ? 2 : 3))

const step = computed(() => activeSteps.value[stepIndex.value] ?? 'intro')
const isFirst = computed(() => stepIndex.value === 0)
const isLast = computed(() => stepIndex.value === activeSteps.value.length - 1)
const isReadyStep = computed(() => step.value === 'ready')

/** Progress through form fields; intro is 0; ready stays at fieldTotal. */
const fieldsDone = computed(() => Math.min(stepIndex.value, fieldTotal.value))

const stepCountColor = computed(() => colorForIndex(fieldsDone.value))

const fieldOnly = computed((): 'yoto' | 'youtube' | 'redirect' | null => {
  if (step.value === 'intro' || step.value === 'ready') return null
  return step.value
})

const showUseDefaultClient = computed(
  () => step.value === 'yoto' && Boolean(bundledYotoClientId.value),
)

const canAdvance = computed(() => {
  if (saving.value || leaving.value) return false
  if (step.value === 'yoto') return Boolean(yotoClientId.value.trim())
  if (step.value === 'youtube') return Boolean(youtubeApiKey.value.trim())
  return true
})

const showSkipYoutube = computed(() => step.value === 'youtube')

const primaryLabel = computed(() => {
  if (saving.value) return 'Saving…'
  if (leaving.value) return 'Starting…'
  if (isReadyStep.value) return "Let's go"
  return 'Next'
})

const heading = computed(() => {
  switch (step.value) {
    case 'intro':
      return 'Set up Louis'
    case 'yoto':
      return 'Yoto client ID'
    case 'youtube':
      return 'YouTube API key'
    case 'redirect':
      return 'OAuth redirect URI'
    case 'ready':
      return "You're ready"
    default:
      return 'Set up Louis'
  }
})

const lede = computed(() => {
  switch (step.value) {
    case 'intro':
      return 'A Yoto client so Louis can connect, then you’ll choose how YouTube search works. Your credentials stay on this computer — use Louis’s bundled Yoto client or your own.'
    case 'ready':
      if (!youtubeApiKey.value.trim()) {
        return desktopPrefsDebug.value
          ? 'Search uses bundled yt-dlp. Add a Data API key later in Settings for safer, faster search. Confirm to open Louis and connect to Yoto.'
          : 'Search uses bundled yt-dlp. Add a Data API key later in Settings for safer, faster search. Confirm to save, restart the local server, and connect to Yoto.'
      }
      return desktopPrefsDebug.value
        ? 'Confirm to open Louis and connect to Yoto.'
        : 'Confirm to save, restart the local server, and connect to Yoto.'
    default:
      // Field steps fold this into DesktopApiKeysFields hints.
      return ''
  }
})

const showHeaderLede = computed(() => Boolean(lede.value))

function sharedEls(): HTMLElement[] {
  return [brandEl.value, titleEl.value, ledeEl.value, actionsEl.value].filter(
    (el): el is HTMLElement => Boolean(el),
  )
}

function captureRects(els: HTMLElement[]) {
  return els.map(el => el.getBoundingClientRect())
}

function flipFrom(els: HTMLElement[], first: DOMRect[]) {
  if (prefersReducedMotion.value || els.length === 0) return

  els.forEach((el, i) => {
    const prev = first[i]
    if (!prev) return
    const next = el.getBoundingClientRect()
    const dx = prev.left - next.left
    const dy = prev.top - next.top
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return

    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: 'translate(0, 0)' },
      ],
      {
        duration: FLIP_MS,
        easing: FLIP_EASE,
        fill: 'none',
      },
    )
  })
}

async function moveToStep(nextIndex: number) {
  const els = sharedEls()
  const first = captureRects(els)
  stepIndex.value = nextIndex
  await nextTick()
  await nextTick()
  flipFrom(sharedEls(), first)
  if (activeSteps.value[nextIndex] === 'ready') {
    await nextTick()
    confirmEl.value?.focus({ preventScroll: true })
  }
}

function bumpChromeEnter() {
  if (prefersReducedMotion.value) {
    chromeEntered.value = true
    return
  }
  chromeEntered.value = false
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      chromeEntered.value = true
    })
  })
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function playLeave() {
  if (prefersReducedMotion.value) {
    leaving.value = true
    return
  }
  leaving.value = true
  await wait(LEAVE_MS)
}

async function load() {
  error.value = ''
  try {
    const [config, uri] = await Promise.all([getConfig(), getRedirectUri()])
    yotoClientId.value = config.yotoClientId
    youtubeApiKey.value = config.youtubeApiKey
    bundledYotoClientId.value = config.bundledYotoClientId
    redirectUri.value = uri
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load desktop config'
  }
  finally {
    ready.value = true
    bumpChromeEnter()
  }
}

async function goBack() {
  if (isFirst.value || saving.value || leaving.value) return
  error.value = ''
  playEvent('buttonClick')
  await moveToStep(stepIndex.value - 1)
}

function onUseDefaultClient() {
  if (saving.value || leaving.value || !bundledYotoClientId.value || usingBundledClient.value) return
  playEvent('select')
  yotoClientId.value = bundledYotoClientId.value
}

async function skipYoutube() {
  if (!showSkipYoutube.value || saving.value || leaving.value) return
  youtubeApiKey.value = ''
  error.value = ''
  playEvent('buttonClick')
  await moveToStep(stepIndex.value + 1)
}

async function goNext() {
  if (!canAdvance.value) return
  error.value = ''
  if (!isLast.value) {
    playEvent('buttonClick')
    await moveToStep(stepIndex.value + 1)
    return
  }
  await onConfirm()
}

async function onConfirm() {
  const yoto = yotoClientId.value.trim()
  const youtube = youtubeApiKey.value.trim()
  if (!yoto || saving.value || leaving.value) return
  saving.value = true
  error.value = ''
  playEvent('buttonPrimary')
  try {
    // Omit cookies path so prefs / prior config.json values are preserved on merge.
    await setConfig({
      yotoClientId: yoto,
      youtubeApiKey: youtube,
    })
    saving.value = false
    await playLeave()
    // Electron reloads the window after setConfig; mock/HMR needs complete.
    emit('complete')
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Save failed'
    saving.value = false
  }
}

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  void load()
})
</script>

<template>
  <div
    class="desktop-setup"
    :class="{ 'desktop-setup--leaving': leaving }"
    role="dialog"
    aria-modal="true"
    aria-labelledby="desktop-setup-heading"
  >
    <div class="desktop-setup__column">
      <header
        class="desktop-setup__header desktop-api-keys__fieldset"
        :class="{
          'desktop-api-keys__fieldset--animate': !prefersReducedMotion,
          'desktop-api-keys__fieldset--in': chromeEntered,
        }"
        style="--desktop-api-keys-stagger: 0"
      >
        <div
          ref="brandEl"
          class="desktop-setup__brand"
        >
          <img
            ref="louisEl"
            src="/images/louis.svg"
            alt=""
            aria-hidden="true"
            class="desktop-setup__louis"
            draggable="false"
          >
        </div>
        <div
          ref="titleEl"
          class="desktop-setup__title-row"
        >
          <h1
            id="desktop-setup-heading"
            class="desktop-setup__title maru-heading maru-heading--lg"
          >
            {{ heading }}
          </h1>
          <Transition name="desktop-setup-step-count">
            <p
              v-if="!isFirst && !isReadyStep"
              class="desktop-setup__step-count"
              :class="[stepCountColor.bg, stepCountColor.text]"
              aria-live="polite"
              :aria-label="`${fieldsDone} of ${fieldTotal} fields`"
            >
              <span class="desktop-setup__step-n" aria-hidden="true">{{ fieldsDone }}</span>
              <span class="desktop-setup__step-sep" aria-hidden="true">of</span>
              <span class="desktop-setup__step-x" aria-hidden="true">{{ fieldTotal }}</span>
            </p>
          </Transition>
        </div>
        <p
          v-if="showHeaderLede"
          ref="ledeEl"
          class="desktop-setup__lede prefs-projector__hint"
        >
          {{ lede }}
        </p>
      </header>

      <div class="desktop-setup__body">
        <DesktopApiKeysFields
          v-if="ready && fieldOnly"
          :key="fieldOnly"
          v-model:yoto-client-id="yotoClientId"
          v-model:youtube-api-key="youtubeApiKey"
          :redirect-uri="redirectUri"
          :disabled="saving || leaving"
          id-prefix="desktop-setup"
          :error="error"
          :only="fieldOnly"
          :using-bundled-client="usingBundledClient"
          stagger
          animate-in
        />

        <p
          v-else-if="error"
          class="prefs-projector__error"
        >
          {{ error }}
        </p>
      </div>

      <div
        ref="actionsEl"
        class="desktop-setup__actions desktop-api-keys__fieldset"
        :class="{
          'desktop-api-keys__fieldset--animate': !prefersReducedMotion,
          'desktop-api-keys__fieldset--in': chromeEntered,
        }"
        style="--desktop-api-keys-stagger: 1"
      >
        <div class="desktop-setup__nav">
          <div
            v-if="!isFirst"
            class="desktop-setup__nav-leading"
          >
            <button
              type="button"
              class="desktop-setup__back"
              :disabled="saving || leaving"
              @click="goBack"
            >
              ← Back
            </button>
          </div>
          <button
            v-if="showUseDefaultClient"
            type="button"
            class="prefs-projector__done desktop-setup__use-default maru-button bg-maru-blue-light"
            :disabled="saving || leaving || usingBundledClient"
            :aria-pressed="usingBundledClient"
            @click="onUseDefaultClient"
          >
            <span class="maru-button__label">{{ usingBundledClient ? 'Using default client' : 'Use default client' }}</span>
          </button>
          <div class="desktop-setup__nav-trailing">
            <button
              v-if="showSkipYoutube"
              type="button"
              class="prefs-projector__done desktop-setup__skip maru-button bg-maru-blue-light"
              :disabled="saving || leaving"
              @click="skipYoutube"
            >
              <span class="maru-button__label">Skip</span>
            </button>
            <button
              ref="confirmEl"
              type="button"
              class="prefs-projector__done maru-button"
              :class="isReadyStep ? 'bg-maru-green-light' : 'bg-maru-yellow'"
              :disabled="!canAdvance"
              @click="goNext"
            >
              <span class="maru-button__label">{{ primaryLabel }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
