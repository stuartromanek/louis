<script setup lang="ts">
import MaruHeading from '~/components/layout/MaruHeading.vue'
import Tray from '~/components/ui/Tray.vue'

const TV_BOOT_MS = 1100
const PHONE_MQ = '(max-width: 599px)'

const FEATURES = [
  'Search YouTube for stories, songs, and more',
  'Paste a video, playlist, or channel link in Search',
  'Drag tracks into a playlist',
  'Save playlists to Yoto',
  'Reopen, rename, and update playlists you\'ve already made',
] as const

type Phase = 'hidden' | 'animating' | 'visible'

const props = withDefaults(defineProps<{
  open?: boolean
  /** Hold until splash (or other boot UI) finishes. */
  paused?: boolean
}>(), {
  open: false,
  paused: false,
})

const emit = defineEmits<{
  'update:blocking': [value: boolean]
  dismiss: []
}>()

const { playEvent } = useUiSound()

const phase = ref<Phase>('hidden')
const headingId = 'yoto-connected-heading'
const isPhone = ref(false)
const prefersReducedMotion = ref(false)
let bootFallbackTimer: ReturnType<typeof setTimeout> | null = null
let celebrationPlayed = false
let phoneMq: MediaQueryList | null = null

const showScreen = computed(
  () => phase.value === 'animating' || phase.value === 'visible',
)

const showPhoneTray = computed(() => isPhone.value && phase.value === 'visible')

const showDesktopGate = computed(() => !isPhone.value && showScreen.value)

/** True only while the welcome overlay is interactively covering the app. */
const blocksApp = computed(
  () => phase.value === 'visible' && (showDesktopGate.value || showPhoneTray.value),
)

const gateClass = computed(() => ({
  'yoto-auth-gate--animating': phase.value === 'animating',
  'yoto-auth-gate--visible': phase.value === 'visible',
  'yoto-auth-gate--reduced': prefersReducedMotion.value,
  'yoto-auth-gate--welcome': true,
}))

const trayOpen = computed({
  get: () => showPhoneTray.value,
  set: (value: boolean) => {
    if (!value && phase.value === 'visible') {
      onDismiss()
    }
  },
})

function clearBootTimer() {
  if (bootFallbackTimer) {
    clearTimeout(bootFallbackTimer)
    bootFallbackTimer = null
  }
}

function hide() {
  clearBootTimer()
  phase.value = 'hidden'
  celebrationPlayed = false
}

function showVisible() {
  phase.value = 'visible'
  if (!celebrationPlayed) {
    celebrationPlayed = true
    playEvent('authConnected')
  }
}

function beginBoot() {
  // Phone drawer skips the TV boot animation.
  if (prefersReducedMotion.value || isPhone.value) {
    showVisible()
    return
  }

  phase.value = 'animating'

  bootFallbackTimer = setTimeout(() => {
    if (phase.value === 'animating') {
      clearBootTimer()
      showVisible()
    }
  }, TV_BOOT_MS + 100)
}

function onScreenAnimationEnd(event: AnimationEvent) {
  if (event.animationName !== 'yoto-auth-tv-boot') return
  if (phase.value !== 'animating') return
  clearBootTimer()
  showVisible()
}

function onDismiss() {
  playEvent('select')
  hide()
  emit('dismiss')
}

watch(blocksApp, (value) => {
  emit('update:blocking', value)
}, { immediate: true })

watch(
  [() => props.open, () => props.paused],
  ([open, paused]) => {
    if (!open) {
      hide()
      return
    }
    if (paused) {
      clearBootTimer()
      if (phase.value === 'animating' || phase.value === 'visible') return
      phase.value = 'hidden'
      return
    }
    if (phase.value === 'hidden') {
      beginBoot()
    }
  },
  { immediate: true },
)

function onPhoneChange() {
  if (!phoneMq) return
  isPhone.value = phoneMq.matches
}

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  phoneMq = window.matchMedia(PHONE_MQ)
  isPhone.value = phoneMq.matches
  phoneMq.addEventListener('change', onPhoneChange)
})

onUnmounted(() => {
  clearBootTimer()
  phoneMq?.removeEventListener('change', onPhoneChange)
  phoneMq = null
})
</script>

<template>
  <!-- Phone: welcome tray (Louis in Yoto frame) -->
  <Tray
    v-model:open="trayOpen"
    role="dialog"
    aria-label="You're connected"
    :labelled-by="headingId"
    height="85svh"
  >
    <div
      class="yoto-auth-gate-phone__player"
      aria-hidden="true"
    >
      <img
        class="yoto-auth-gate-phone__frame"
        src="/images/yoto-on.svg"
        alt=""
        draggable="false"
      >
      <div class="yoto-auth-gate-phone__screen">
        <img
          src="/images/louis.svg"
          alt=""
          class="yoto-auth-gate-phone__louis"
          draggable="false"
        >
      </div>
    </div>
    <div class="yoto-auth-gate-phone__copy">
      <div
        :id="headingId"
        class="yoto-auth-gate-phone__heading-wrap"
      >
        <MaruHeading
          text="You're connected"
          as="h2"
          tone="black"
          size="lg"
          align="center"
          class="yoto-auth-gate__heading yoto-auth-gate-phone__heading"
        />
      </div>
      <p class="yoto-auth-gate__body yoto-auth-gate-phone__body yoto-auth-gate__body--wrap">
        Louis is your Yoto MYO client — find YouTube audio, build a playlist, and save it to your player.
      </p>
    </div>
    <ul class="yoto-auth-gate__features yoto-auth-gate-phone__features">
      <li
        v-for="feature in FEATURES"
        :key="feature"
      >
        {{ feature }}
      </li>
    </ul>
    <button
      type="button"
      class="maru-button yoto-auth-gate-phone__cta yoto-auth-gate-phone__cta--candy"
      :autofocus="phase === 'visible' && isPhone"
      @click="onDismiss"
    >
      <span class="maru-button__label">Let's go</span>
    </button>
  </Tray>

  <!-- Desktop: TV frame welcome -->
  <Teleport to="body">
    <div
      v-if="showDesktopGate"
      class="yoto-auth-gate"
      :class="gateClass"
    >
      <div
        class="yoto-auth-gate__backdrop"
        aria-hidden="true"
      />

      <div class="yoto-auth-gate__stage">
        <div
          class="yoto-auth-gate__screen"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`${headingId}-desktop`"
          @animationend="onScreenAnimationEnd"
        >
          <img
            class="yoto-auth-gate__frame"
            src="/images/yoto-on.svg"
            alt=""
            aria-hidden="true"
            draggable="false"
          >
          <div class="yoto-auth-gate__content">
            <div :id="`${headingId}-desktop`">
              <MaruHeading
                text="You're connected"
                as="h2"
                tone="black"
                size="md"
                align="center"
                class="yoto-auth-gate__heading"
              />
            </div>
            <p class="yoto-auth-gate__body yoto-auth-gate__body--wrap">
              Louis is your Yoto MYO client — find YouTube audio, build a playlist, and save it to your player.
            </p>
            <ul class="yoto-auth-gate__features">
              <li
                v-for="feature in FEATURES"
                :key="feature"
              >
                {{ feature }}
              </li>
            </ul>
            <button
              type="button"
              class="maru-button bg-maru-blue text-maru-white yoto-auth-gate__cta"
              :autofocus="phase === 'visible' && !isPhone"
              @click="onDismiss"
            >
              <span class="maru-button__label">Let's go</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
