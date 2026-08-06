<script setup lang="ts">
import MaruHeading from '~/components/layout/MaruHeading.vue'
import MobileTray from '~/components/ui/MobileTray.vue'
import { YOTO_MYO_KEY } from './keys'

const GATE_DELAY_MS = 2000
const TV_BOOT_MS = 1100
const PHONE_MQ = '(max-width: 599px)'

type BlockedReason = 'disconnected' | 'needsReconnect' | 'unconfigured' | 'error'
type GatePhase = 'hidden' | 'waiting' | 'animating' | 'visible'

const props = withDefaults(defineProps<{
  /** Hold the connect gate until splash (or other boot UI) finishes. */
  paused?: boolean
}>(), {
  paused: false,
})

const emit = defineEmits<{
  'update:blocking': [value: boolean]
}>()

const yoto = inject(YOTO_MYO_KEY)
if (!yoto) {
  throw new Error('YotoAuthGate requires YOTO_MYO_KEY provider')
}

const { playEvent } = useUiSound()
const { isDesktop } = useDesktopHost()
const { openPreferences } = usePreferencesShell()

const {
  status,
  connected,
  hasWriteScope,
  errorMessage,
  connect,
  refresh,
} = yoto

const phase = ref<GatePhase>('hidden')
const headingId = 'yoto-auth-gate-heading'
const isPhone = ref(false)

const prefersReducedMotion = ref(false)

const blockedReason = computed((): BlockedReason | null => {
  if (status.value === 'loading') return null
  if (status.value === 'unconfigured') return 'unconfigured'
  if (status.value === 'error') return 'error'
  if (status.value === 'disconnected') return 'disconnected'
  if (connected.value && !hasWriteScope.value) return 'needsReconnect'
  return null
})

const copy = computed(() => {
  switch (blockedReason.value) {
    case 'needsReconnect':
      return {
        heading: 'Reconnect Yoto',
        body: 'Your session needs a fresh login to save changes.',
        cta: 'Reconnect',
        action: 'connect' as const,
      }
    case 'unconfigured':
      return {
        heading: 'Yoto not configured',
        body: isDesktop.value
          ? 'Add your Yoto client ID in Preferences (Desktop API keys). Register the redirect URI shown there on yoto.dev.'
          : 'This server is missing a Yoto API client ID. Ask the host to set NUXT_YOTO_CLIENT_ID.',
        cta: isDesktop.value ? 'Open Preferences' : null,
        action: isDesktop.value ? 'preferences' as const : null,
      }
    case 'error':
      return {
        heading: 'Connection problem',
        body: errorMessage.value || 'Could not reach Yoto. Try again.',
        cta: 'Retry',
        action: 'refresh' as const,
      }
    case 'disconnected':
    default:
      return {
        heading: 'Connect Louis to Yoto',
        body: 'Link your account to load MYO cards and build playlists.',
        cta: 'Connect to Yoto',
        action: 'connect' as const,
      }
  }
})

const showScreen = computed(
  () => phase.value === 'animating' || phase.value === 'visible',
)

const showPhoneTray = computed(() => isPhone.value && showScreen.value)

const showDesktopGate = computed(() => !isPhone.value && showScreen.value)

const bodyWraps = computed(
  () => blockedReason.value === 'unconfigured' || blockedReason.value === 'error',
)

const gateClass = computed(() => ({
  'yoto-auth-gate--animating': phase.value === 'animating',
  'yoto-auth-gate--visible': phase.value === 'visible',
  'yoto-auth-gate--reduced': prefersReducedMotion.value,
}))

const trayOpen = computed({
  get: () => showPhoneTray.value,
  set: (_value: boolean) => {
    // Blocking gate — ignore user dismiss; open state follows showPhoneTray.
  },
})

let delayTimer: ReturnType<typeof setTimeout> | null = null
let bootFallbackTimer: ReturnType<typeof setTimeout> | null = null
let phoneMq: MediaQueryList | null = null

function clearTimers() {
  if (delayTimer) clearTimeout(delayTimer)
  if (bootFallbackTimer) clearTimeout(bootFallbackTimer)
  delayTimer = null
  bootFallbackTimer = null
}

function setBlocking(value: boolean) {
  emit('update:blocking', value)
}

function hideGate() {
  clearTimers()
  phase.value = 'hidden'
  setBlocking(false)
}

function showGateWithDim() {
  phase.value = 'visible'
  setBlocking(true)
  playEvent('authGateShow')
}

function onScreenAnimationEnd(event: AnimationEvent) {
  if (event.animationName !== 'yoto-auth-tv-boot') return
  if (phase.value !== 'animating') return
  clearTimers()
  showGateWithDim()
}

function beginBoot() {
  if (!blockedReason.value) return

  // Phone drawer skips the TV boot animation.
  if (prefersReducedMotion.value || isPhone.value) {
    showGateWithDim()
    return
  }

  phase.value = 'animating'
  setBlocking(false)

  bootFallbackTimer = setTimeout(() => {
    if (phase.value === 'animating') {
      clearTimers()
      showGateWithDim()
    }
  }, TV_BOOT_MS + 100)
}

function startGateSequence() {
  clearTimers()
  phase.value = 'waiting'
  setBlocking(false)

  delayTimer = setTimeout(() => {
    delayTimer = null
    beginBoot()
  }, GATE_DELAY_MS)
}

function onPrimaryAction() {
  if (copy.value.action === 'connect') {
    playEvent('toggleOn')
    connect()
    return
  }
  if (copy.value.action === 'refresh') {
    playEvent('buttonClick')
    refresh()
    return
  }
  if (copy.value.action === 'preferences') {
    playEvent('buttonClick')
    openPreferences()
  }
}

watch(
  [blockedReason, () => props.paused],
  ([reason, paused]) => {
    if (!reason) {
      hideGate()
      return
    }
    if (paused) {
      clearTimers()
      if (phase.value === 'animating' || phase.value === 'visible') {
        return
      }
      phase.value = 'waiting'
      setBlocking(false)
      return
    }
    if (phase.value === 'hidden' || phase.value === 'waiting') {
      startGateSequence()
    }
  },
  { immediate: true },
)

function onPhoneChange() {
  if (!phoneMq) return
  const wasPhone = isPhone.value
  isPhone.value = phoneMq.matches
  // Crossing to desktop mid-gate: finish TV path if still blocked.
  if (wasPhone && !isPhone.value && blockedReason.value && phase.value === 'visible') {
    setBlocking(true)
  }
}

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  phoneMq = window.matchMedia(PHONE_MQ)
  isPhone.value = phoneMq.matches
  phoneMq.addEventListener('change', onPhoneChange)
})

onUnmounted(() => {
  clearTimers()
  phoneMq?.removeEventListener('change', onPhoneChange)
  phoneMq = null
})
</script>

<template>
  <!-- Phone: mobile tray with Louis inside the Yoto frame -->
  <MobileTray
    v-model:open="trayOpen"
    :dismissible="false"
    :close-on-backdrop="false"
    role="dialog"
    :aria-label="copy.heading"
    height="75svh"
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
          :text="copy.heading"
          as="h2"
          tone="black"
          size="lg"
          align="center"
          class="yoto-auth-gate__heading yoto-auth-gate-phone__heading"
        />
      </div>
      <p
        class="yoto-auth-gate__body yoto-auth-gate-phone__body"
        :class="{ 'yoto-auth-gate__body--wrap': bodyWraps }"
      >
        {{ copy.body }}
      </p>
    </div>
    <button
      v-if="copy.cta"
      type="button"
      class="maru-button yoto-auth-gate-phone__cta yoto-auth-gate-phone__cta--candy"
      :autofocus="phase === 'visible' && isPhone"
      @click="onPrimaryAction"
    >
      <span class="maru-button__label">{{ copy.cta }}</span>
    </button>
  </MobileTray>

  <!-- Desktop: TV frame gate -->
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
            <img
              src="/images/louis.svg"
              alt=""
              aria-hidden="true"
              class="maru-emoji yoto-auth-gate__emoji"
              style="width: 5.6rem; height: 5.6rem;"
            >
            <div :id="`${headingId}-desktop`">
              <MaruHeading
                :text="copy.heading"
                as="h2"
                tone="black"
                size="md"
                align="center"
                class="yoto-auth-gate__heading"
              />
            </div>
            <p
              class="yoto-auth-gate__body"
              :class="{ 'yoto-auth-gate__body--wrap': bodyWraps }"
            >
              {{ copy.body }}
            </p>
            <button
              v-if="copy.cta"
              type="button"
              class="maru-button bg-maru-blue text-maru-white yoto-auth-gate__cta"
              :autofocus="phase === 'visible' && !isPhone"
              @click="onPrimaryAction"
            >
              <span class="maru-button__label">{{ copy.cta }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
