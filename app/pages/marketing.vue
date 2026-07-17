<script setup lang="ts">
useHead({
  title: 'Marketing motion — yoto-cards',
})

/** Prototype stages — stack these for layered marketing animations. */
const layers = [
  { id: 'bg', label: 'Background' },
  { id: 'mid', label: 'Midground' },
  { id: 'fg', label: 'Foreground' },
] as const

const yotoIn = ref(false)
const sceneReady = ref(true)
let playToken = 0

async function playScene() {
  const token = ++playToken
  sceneReady.value = false
  yotoIn.value = false

  // Let the reset frame paint without transitioning out.
  await nextTick()
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  if (token !== playToken) return

  sceneReady.value = true

  // Beat of empty stage before the Yoto pop.
  await new Promise<void>(resolve => setTimeout(resolve, 2500))
  if (token !== playToken) return

  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  if (token !== playToken) return

  yotoIn.value = true
}

onMounted(() => {
  playScene()
})
</script>

<template>
  <div class="marketing-motion min-h-screen bg-maru-gray-light text-maru-black">
    <header class="border-b-2 border-maru-black bg-maru-white px-4 py-4 sm:px-6">
      <p class="font-maru-mono text-sm text-maru-gray mb-1">
        <NuxtLink
          to="/"
          class="underline underline-offset-2 hover:text-maru-blue"
        >
          ← App
        </NuxtLink>
        <span class="mx-2">·</span>
        Prototype
      </p>
      <h1 class="font-maru-bold text-3xl sm:text-4xl leading-none text-balance">
        Marketing motion
      </h1>
      <p class="mt-2 max-w-2xl font-maru-mono text-base sm:text-lg leading-snug text-pretty">
        16×9 canvas layers sized like a computer screen — stack animation passes here.
      </p>
    </header>

    <main class="px-4 py-8 sm:px-6 sm:py-10 flex flex-col items-center gap-6">
      <div
        class="marketing-motion__stage"
        aria-label="Marketing animation stage"
      >
        <div
          v-for="(layer, index) in layers"
          :key="layer.id"
          class="marketing-motion__canvas"
          :style="{ zIndex: index + 1 }"
          :data-layer="layer.id"
        >
          <div class="marketing-motion__canvas-label">
            {{ layer.label }}
            <span>· 16:9</span>
          </div>

          <div
            v-if="layer.id === 'fg'"
            class="marketing-motion__subject"
          >
            <img
              src="/marketing/yoto.svg"
              alt="Yoto pixel player"
              class="marketing-motion__monitor"
              :class="{
                'marketing-motion__monitor--ready': sceneReady,
                'marketing-motion__monitor--in': yotoIn,
              }"
              width="640"
              height="620"
              draggable="false"
            >
            <img
              src="/marketing/louis.svg"
              alt="Louis the swan mascot"
              class="marketing-motion__louis"
              width="384"
              height="354"
              draggable="false"
            >
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <button
          type="button"
          class="marketing-motion__play"
          aria-label="Play scene"
          @click="playScene"
        >
          <span class="marketing-motion__play-icon" aria-hidden="true" />
          Play
        </button>
      </div>

      <p class="font-maru-mono text-sm text-maru-gray text-center max-w-xl text-pretty">
        Stage is 1440×810 (16:9). Assets in
        <code class="text-maru-black">public/marketing/</code>:
        <code class="text-maru-black">louis.svg</code>
        ·
        <code class="text-maru-black">yoto.svg</code>.
      </p>
    </main>
  </div>
</template>

<style scoped>
.marketing-motion__stage {
  position: relative;
  width: min(100%, 1440px);
  aspect-ratio: 16 / 9;
}

.marketing-motion__canvas {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #e8e8e8;
}

.marketing-motion__canvas[data-layer='mid'],
.marketing-motion__canvas[data-layer='fg'] {
  background: transparent;
}

.marketing-motion__canvas-label {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 2;
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  color: #888;
  pointer-events: none;
}

.marketing-motion__canvas[data-layer='mid'] .marketing-motion__canvas-label,
.marketing-motion__canvas[data-layer='fg'] .marketing-motion__canvas-label {
  display: none;
}

.marketing-motion__subject {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.marketing-motion__monitor {
  width: min(100%, 200px);
  height: auto;
  user-select: none;
  opacity: 0;
  transform: rotate(-3.5deg);
  will-change: opacity, transform;
}

.marketing-motion__monitor--ready {
  transition:
    opacity 70ms linear,
    transform 90ms cubic-bezier(0.2, 0, 0, 1);
}

.marketing-motion__monitor--in {
  opacity: 1;
  transform: rotate(0deg);
}

.marketing-motion__louis {
  position: absolute;
  right: 8%;
  bottom: 6%;
  width: min(22%, 200px);
  height: auto;
  user-select: none;
  z-index: 1;
}

.marketing-motion__play {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0;
  padding: 0.55rem 1.1rem 0.5rem;
  border: 2px solid #111;
  border-radius: 999px;
  background: #111;
  color: #fff;
  font-family: ui-monospace, monospace;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
  cursor: pointer;
}

.marketing-motion__play:hover {
  background: #333;
}

.marketing-motion__play:active {
  transform: scale(0.97);
}

.marketing-motion__play-icon {
  display: block;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0.4rem 0 0.4rem 0.65rem;
  border-color: transparent transparent transparent currentColor;
}

@media (min-width: 600px) {
  .marketing-motion__louis {
    width: min(20%, 240px);
  }
}
</style>
