<script setup lang="ts">
import lottie, { type AnimationItem } from 'lottie-web'
import { resolveUiSoundEvent } from '~/utils/uiSoundRegistry'

/** Tunable: fire splashCue when the playhead reaches this frame (30fps). */
const SPLASH_SOUND_AT_FRAME = 50
/** Tunable: start Louis! inflate when the playhead reaches this frame (30fps). */
const SPLASH_WORDMARK_AT_FRAME = 32
const ANIM_START_DELAY_MS = 1000
const FADE_MS = 200
const LOTTIE_PATH = '/splash/louis.json'

const props = withDefaults(defineProps<{
  /** Loop forever; never dismiss — for timing/visual refine. */
  debug?: boolean
}>(), {
  debug: false,
})

const emit = defineEmits<{
  done: []
}>()

const { tryPlayEvent, unlockAudio, preload, stopAll } = useUiSound()

const stageEl = ref<HTMLElement | null>(null)
const leaving = ref(false)
const debugFrame = ref(0)
const audioLocked = ref(true)
const paused = ref(false)
/** Bump to remount wordmark/chips so CSS intro replays (debug restart). */
const typeKey = ref(0)
/** True once the playhead has reached SPLASH_WORDMARK_AT_FRAME this cycle. */
const typeIn = ref(false)

let anim: AnimationItem | null = null
let soundFired = false
let cuePending = false
let finished = false
let fadeTimer: ReturnType<typeof setTimeout> | null = null
let startDelayTimer: ReturnType<typeof setTimeout> | null = null

function finish() {
  if (finished) return
  finished = true
  clearFadeTimer()
  clearStartDelay()
  destroyAnim()
  emit('done')
}

function clearFadeTimer() {
  if (fadeTimer) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }
}

function clearStartDelay() {
  if (startDelayTimer) {
    clearTimeout(startDelayTimer)
    startDelayTimer = null
  }
}

function destroyAnim() {
  if (!anim) return
  anim.destroy()
  anim = null
}

function replayType() {
  typeIn.value = false
  typeKey.value += 1
}

function restartLoop() {
  stopAll()
  soundFired = false
  cuePending = false
  paused.value = false
  replayType()
  if (!anim) return
  anim.goToAndPlay(0, true)
}

function togglePause() {
  if (!props.debug || !anim) return
  if (paused.value) {
    anim.play()
    paused.value = false
    return
  }
  anim.pause()
  stopAll()
  paused.value = true
}

/** Play louis.wav via the shared UI sound player at the cue frame. */
async function fireSplashCue() {
  if (soundFired || finished || leaving.value) return
  const ok = await tryPlayEvent('splashCue')
  if (ok) {
    soundFired = true
    cuePending = false
    audioLocked.value = false
    return
  }
  // Browser blocked autoplay — retry after the next user gesture.
  cuePending = true
  audioLocked.value = true
}

async function onUserGesture() {
  const cueId = resolveUiSoundEvent('splashCue').id
  const unlocked = await unlockAudio(cueId)
  if (!unlocked) return
  audioLocked.value = false

  const frame = anim?.currentFrame ?? debugFrame.value
  if (cuePending || (!soundFired && frame >= SPLASH_SOUND_AT_FRAME)) {
    cuePending = false
    if (!soundFired) {
      await fireSplashCue()
    }
  }
}

function dismiss(options: { stopSound?: boolean } = {}) {
  if (props.debug) {
    if (audioLocked.value) {
      void onUserGesture()
      return
    }
    restartLoop()
    return
  }
  if (finished || leaving.value) return
  if (options.stopSound) {
    stopAll()
  }
  if (anim) {
    anim.pause()
  }

  leaving.value = true
  fadeTimer = setTimeout(() => {
    fadeTimer = null
    finish()
  }, FADE_MS)
}

function onEnterFrame(event: { currentTime?: number }) {
  if (finished || leaving.value) return
  const frame = event.currentTime ?? 0
  if (props.debug) {
    debugFrame.value = Math.floor(frame)
  }
  if (frame < SPLASH_WORDMARK_AT_FRAME) {
    if (typeIn.value) typeIn.value = false
  } else if (!typeIn.value) {
    typeIn.value = true
  }
  if (soundFired || cuePending) return
  if (frame < SPLASH_SOUND_AT_FRAME) return
  void fireSplashCue()
}

function onComplete() {
  if (props.debug) {
    soundFired = false
    cuePending = false
    return
  }
  if (finished || leaving.value) return
  dismiss()
}

function onLoopComplete() {
  if (!props.debug) return
  soundFired = false
  cuePending = false
  replayType()
}

function onKeydown(event: KeyboardEvent) {
  if (props.debug && (event.key === ' ' || event.code === 'Space')) {
    event.preventDefault()
    void onUserGesture()
    togglePause()
    return
  }
  void onUserGesture()
}

function onSplashClick() {
  if (!props.debug) return
  dismiss({ stopSound: true })
}

function onPointerDown() {
  if (props.debug) return
  void onUserGesture()
}

onMounted(() => {
  preload(resolveUiSoundEvent('splashCue').id)

  window.addEventListener('keydown', onKeydown)
  window.addEventListener('pointerdown', onPointerDown, { capture: true })

  if (!stageEl.value) {
    if (!props.debug) finish()
    return
  }

  anim = lottie.loadAnimation({
    container: stageEl.value,
    renderer: 'svg',
    loop: props.debug,
    autoplay: false,
    path: LOTTIE_PATH,
  })

  anim.addEventListener('DOMLoaded', () => {
    if (!anim || finished) return
    anim.goToAndStop(0, true)
    clearStartDelay()
    startDelayTimer = setTimeout(() => {
      startDelayTimer = null
      if (!anim || finished || leaving.value) return
      anim.play()
    }, ANIM_START_DELAY_MS)
  })

  anim.addEventListener('enterFrame', onEnterFrame)
  anim.addEventListener('complete', onComplete)
  anim.addEventListener('loopComplete', onLoopComplete)
  anim.addEventListener('data_failed', () => {
    if (!props.debug) finish()
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('pointerdown', onPointerDown, { capture: true })
  clearFadeTimer()
  clearStartDelay()
  destroyAnim()
})
</script>

<template>
  <Teleport to="body">
    <div
      class="app-splash"
      :class="{
        'app-splash--leaving': leaving,
        'app-splash--debug': debug,
        'app-splash--type-in': typeIn,
      }"
      role="dialog"
      aria-modal="true"
      aria-label="Louis intro"
      @click="onSplashClick"
    >
      <div class="app-splash__stack">
        <div class="app-splash__visual">
          <p
            :key="`wordmark-${typeKey}`"
            class="app-splash__wordmark"
            aria-label="Louis!"
          >
            <span class="app-splash__letter app-splash__letter--l" style="--i: 0; --tilt: -4deg" aria-hidden="true">L</span>
            <span class="app-splash__letter app-splash__letter--o" style="--i: 1; --tilt: 3deg" aria-hidden="true">o</span>
            <span class="app-splash__letter app-splash__letter--u" style="--i: 2; --tilt: -2deg" aria-hidden="true">u</span>
            <span class="app-splash__letter app-splash__letter--i" style="--i: 3; --tilt: 4deg" aria-hidden="true">i</span>
            <span class="app-splash__letter app-splash__letter--s" style="--i: 4; --tilt: -3deg" aria-hidden="true">s</span>
            <span class="app-splash__letter app-splash__letter--bang" style="--i: 5; --tilt: 6deg" aria-hidden="true">!</span>
          </p>
          <div
            ref="stageEl"
            class="app-splash__stage"
            aria-hidden="true"
          />
        </div>
        <p
          :key="`chips-${typeKey}`"
          class="app-splash__chips"
          aria-label="Yoto, meet YouTube"
        >
          <span class="app-splash__chip app-splash__chip--blue" style="--i: 0; --tilt: -3deg">Yoto,</span>
          <span class="app-splash__chip app-splash__chip--pink" style="--i: 1; --tilt: 2.5deg">meet</span>
          <span class="app-splash__chip app-splash__chip--orange" style="--i: 2; --tilt: -1.5deg">YouTube</span>
        </p>
      </div>
      <p
        v-if="debug"
        class="app-splash__debug"
      >
        debug · frame {{ debugFrame }} / type {{ SPLASH_WORDMARK_AT_FRAME }} / cue {{ SPLASH_SOUND_AT_FRAME }}
        ·
        <button
          type="button"
          class="app-splash__debug-toggle"
          @click.stop="togglePause"
        >
          {{ paused ? 'paused' : 'playing' }}
        </button>
        ·
        <template v-if="audioLocked">click once to unlock audio</template>
        <template v-else>audio unlocked · click restarts</template>
        · space toggles
      </p>
    </div>
  </Teleport>
</template>
