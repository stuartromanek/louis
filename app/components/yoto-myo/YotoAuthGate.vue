<script setup lang="ts">
import MaruHeading from '~/components/layout/MaruHeading.vue'
import { YOTO_MYO_KEY } from './keys'

const GATE_DELAY_MS = 2000
const TV_BOOT_MS = 1100

type BlockedReason = 'disconnected' | 'needsReconnect' | 'unconfigured' | 'error'
type GatePhase = 'hidden' | 'waiting' | 'animating' | 'visible'

const emit = defineEmits<{
  'update:blocking': [value: boolean]
}>()

const yoto = inject(YOTO_MYO_KEY)
if (!yoto) {
  throw new Error('YotoAuthGate requires YOTO_MYO_KEY provider')
}

const { playEvent } = useUiSound()

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
        body: 'This server is missing a Yoto API client ID. Ask the host to set NUXT_YOTO_CLIENT_ID.',
        cta: null,
        action: null,
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
        heading: 'Connect Yoto',
        body: 'Link your account to load MYO cards and build playlists.',
        cta: 'Connect to Yoto',
        action: 'connect' as const,
      }
  }
})

const showScreen = computed(
  () => phase.value === 'animating' || phase.value === 'visible',
)

const bodyWraps = computed(
  () => blockedReason.value === 'unconfigured' || blockedReason.value === 'error',
)

const gateClass = computed(() => ({
  'yoto-auth-gate--animating': phase.value === 'animating',
  'yoto-auth-gate--visible': phase.value === 'visible',
  'yoto-auth-gate--reduced': prefersReducedMotion.value,
}))

let delayTimer: ReturnType<typeof setTimeout> | null = null
let bootFallbackTimer: ReturnType<typeof setTimeout> | null = null

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

  if (prefersReducedMotion.value) {
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
    playEvent('buttonPrimary')
    connect()
    return
  }
  if (copy.value.action === 'refresh') {
    playEvent('buttonClick')
    refresh()
  }
}

watch(blockedReason, (reason) => {
  if (reason) {
    startGateSequence()
  }
  else {
    hideGate()
  }
}, { immediate: true })

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

onUnmounted(() => {
  clearTimers()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="showScreen"
      class="yoto-auth-gate"
      :class="gateClass"
    >
      <div
        class="yoto-auth-gate__backdrop"
        aria-hidden="true"
      />

      <div class="yoto-auth-gate__stage">
        <div
          v-if="showScreen"
          class="yoto-auth-gate__screen"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="headingId"
          @animationend="onScreenAnimationEnd"
        >
          <div class="yoto-auth-gate__content">
            <MaruEmoji
              name="Duck"
              :size-rem="4"
              class="yoto-auth-gate__emoji"
            />
            <div :id="headingId">
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
              :autofocus="phase === 'visible'"
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
