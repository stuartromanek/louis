<script setup lang="ts">
import HowToYoutubeMock from '~/components/layout/howto/HowToYoutubeMock.vue'
import HowToCardsMock from '~/components/layout/howto/HowToCardsMock.vue'
import HowToPlaylistMock from '~/components/layout/howto/HowToPlaylistMock.vue'

type Phase = 'idle' | 'entering' | 'open' | 'exiting'

const open = defineModel<boolean>('open', { default: false })

const { playEvent } = useUiSound()

const phase = ref<Phase>('idle')
const prefersReducedMotion = ref(false)
const headingId = 'howto-heading'
let timers: ReturnType<typeof setTimeout>[] = []

const visible = computed(
  () => phase.value === 'entering' || phase.value === 'open' || phase.value === 'exiting',
)

const interactive = computed(() => phase.value === 'open')

const rootClass = computed(() => ({
  'howto-modal': true,
  'howto-modal--entering': phase.value === 'entering',
  'howto-modal--open': phase.value === 'open',
  'howto-modal--exiting': phase.value === 'exiting',
  'howto-modal--reduced': prefersReducedMotion.value,
}))

const sections = [
  {
    id: 'youtube',
    title: 'YouTube Search',
    body: 'Type a song, show, or artist to find videos. Preview audio right in the results, then drag a track into your playlist.',
    bullets: [
      'Search and browse YouTube results',
      'Preview tracks before adding them',
      'Drag results into the playlist panel',
    ],
  },
  {
    id: 'cards',
    title: 'My Cards',
    body: '',
    bullets: [
      'Sign in with Connect in the status bar',
      'Choose the MYO card you want to edit',
      'Selected cards stay highlighted so you know the target',
    ],
  },
  {
    id: 'playlist',
    title: 'Playlist',
    body: '',
    bullets: [
      'Drag to reorder tracks',
      'Watch capacity meters for track count and length',
      'Update can take a few minutes while tracks download and process',
    ],
  },
] as const

function clearTimers() {
  for (const t of timers) clearTimeout(t)
  timers = []
}

function after(ms: number, fn: () => void) {
  timers.push(setTimeout(fn, ms))
}

function beginOpen() {
  clearTimers()
  phase.value = 'entering'
  playEvent('toggleOn')

  after(prefersReducedMotion.value ? 40 : 240, () => {
    if (phase.value === 'entering') phase.value = 'open'
  })
}

function beginClose() {
  if (phase.value !== 'open' && phase.value !== 'entering') return
  clearTimers()
  phase.value = 'exiting'
  playEvent('buttonClick')

  after(prefersReducedMotion.value ? 40 : 220, () => {
    phase.value = 'idle'
    open.value = false
  })
}

function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (phase.value === 'open') {
    event.preventDefault()
    beginClose()
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    if (phase.value === 'idle') beginOpen()
    return
  }
  if (phase.value === 'open' || phase.value === 'entering') {
    beginClose()
  }
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
        class="howto-modal__backdrop"
        aria-hidden="true"
        @click="interactive && beginClose()"
      />

      <div
        class="howto-modal__window border-maru rounded-maru bg-maru-white"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="headingId"
        :aria-hidden="!interactive"
      >
        <header class="howto-modal__header border-maru-bottom">
          <h2
            :id="headingId"
            class="howto-modal__title font-maru-bold m-0"
          >
            How To
          </h2>
          <button
            type="button"
            class="howto-modal__close font-maru-mono"
            :disabled="!interactive"
            aria-label="Close How To"
            @click="beginClose"
          >
            Close
          </button>
        </header>

        <div class="howto-modal__body">
          <p class="howto-modal__intro font-maru-mono text-pretty m-0">
            This app helps you build Yoto Make Your Own playlists from YouTube.
            Search for videos, preview the audio, pick one of your MYO cards, arrange
            tracks in a playlist, then save the finished set back to your card so it
            plays on your Yoto player.
          </p>

          <section
            v-for="section in sections"
            :id="`howto-${section.id}`"
            :key="section.id"
            class="howto-section"
          >
            <div class="howto-section__mock">
              <HowToYoutubeMock v-if="section.id === 'youtube'" />
              <HowToCardsMock v-else-if="section.id === 'cards'" />
              <div
                v-else
                class="howto-mock-stack"
              >
                <HowToPlaylistMock />
                <HowToPlaylistMock variant="updating" />
              </div>
            </div>

            <div class="howto-section__copy">
              <h3 class="howto-section__heading font-maru-bold m-0">
                {{ section.title }}
              </h3>
              <p class="howto-section__body font-maru-mono text-pretty m-0">
                <template v-if="section.id === 'cards'">
                  Connect your Yoto account, then pick a
                  <a
                    class="howto-section__link"
                    href="https://my.yotoplay.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >Make Your Own</a>
                  card. The selected card is what the playlist will update.
                </template>
                <template v-else-if="section.id === 'playlist'">
                  Arrange tracks in the order you want, remove anything you don’t need, then tap Update to save the playlist onto the selected card.
                  <strong class="font-maru-bold">Saving downloads and processes each track, so it can take a while—especially on longer playlists.</strong>
                </template>
                <template v-else>
                  {{ section.body }}
                </template>
              </p>
              <ul class="howto-section__bullets font-maru-mono m-0">
                <li
                  v-for="bullet in section.bullets"
                  :key="bullet"
                >
                  {{ bullet }}
                </li>
              </ul>
            </div>
          </section>

          <p class="howto-modal__footer-note font-maru-mono text-pretty m-0">
            Stuck or found a bug? Use
            <a
              class="howto-section__link"
              href="https://docs.google.com/forms/d/e/1FAIpQLSccwkdCpYaJjODtpxSrtBIaye045nobwudH1L0VX8S6NzFtjA/viewform?usp=publish-editor"
              target="_blank"
              rel="noopener noreferrer"
            >Issue / Feedback</a>
            in the status bar.
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
