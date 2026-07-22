<script setup lang="ts">
import MaruHeading from '~/components/layout/MaruHeading.vue'

const TV_BOOT_MS = 1100

const FEATURES = [
  'Search YouTube for stories, songs, and more',
  'Preview tracks before you add them',
  'Drag tracks into a playlist',
  'Save playlists to your MYO cards',
  'Reopen and update cards you\'ve already made',
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
const prefersReducedMotion = ref(false)
let bootFallbackTimer: ReturnType<typeof setTimeout> | null = null
let celebrationPlayed = false

const showScreen = computed(
  () => phase.value === 'animating' || phase.value === 'visible',
)

const gateClass = computed(() => ({
  'yoto-auth-gate--animating': phase.value === 'animating',
  'yoto-auth-gate--visible': phase.value === 'visible',
  'yoto-auth-gate--reduced': prefersReducedMotion.value,
  'yoto-auth-gate--welcome': true,
}))

function clearBootTimer() {
  if (bootFallbackTimer) {
    clearTimeout(bootFallbackTimer)
    bootFallbackTimer = null
  }
}

function setBlocking(value: boolean) {
  emit('update:blocking', value)
}

function hide() {
  clearBootTimer()
  phase.value = 'hidden'
  setBlocking(false)
  celebrationPlayed = false
}

function showVisible() {
  phase.value = 'visible'
  setBlocking(true)
  if (!celebrationPlayed) {
    celebrationPlayed = true
    playEvent('authConnected')
  }
}

function beginBoot() {
  if (prefersReducedMotion.value) {
    showVisible()
    return
  }

  phase.value = 'animating'
  setBlocking(false)

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
      setBlocking(false)
      return
    }
    if (phase.value === 'hidden') {
      beginBoot()
    }
  },
  { immediate: true },
)

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

onUnmounted(() => {
  clearBootTimer()
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
          class="yoto-auth-gate__screen"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="headingId"
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
            <div :id="headingId">
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
              :autofocus="phase === 'visible'"
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
