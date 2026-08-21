<script setup lang="ts">
import HowToYoutubeMock from '~/components/layout/howto/HowToYoutubeMock.vue'
import HowToCardsMock from '~/components/layout/howto/HowToCardsMock.vue'
import HowToPlaylistMock from '~/components/layout/howto/HowToPlaylistMock.vue'
import MaruHeading from '~/components/layout/MaruHeading.vue'

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
    body: 'Type a song, show, or artist to find videos. Paste a YouTube video, Shorts, playlist, or channel URL to load it in Search. Check rows to group them, then drag the group into a playlist — or on a phone, tap Add and pick a playlist.',
    bullets: [
      'Search and browse YouTube results',
      'Paste a video or Shorts URL to open that track, ready to add',
      'Paste a playlist or channel URL to load those videos, pre-checked',
      'On desktop, drag into the playlist; on a phone, tap Add and pick a playlist',
    ],
  },
  {
    id: 'cards',
    title: 'Playlists',
    body: '',
    bullets: [
      'Sign in with Connect in the status bar (desktop) or Menu (phone)',
      'Open a playlist to edit it, or start New from the Playlists header, the empty playlist panel, or Add → New playlist on a phone',
      'Selected playlists stay highlighted so you know what you are editing',
    ],
  },
  {
    id: 'playlist',
    title: 'Playlist',
    body: '',
    bullets: [
      'New names the playlist and creates it on Yoto — checked Search results (desktop) or Add → New playlist (phone) are uploaded with that create',
      'On desktop, drag to reorder; on a phone, use the track menu to move or remove',
      'Watch capacity meters for track count and length',
      'Tap Update to save tracks to Yoto — long videos become multiple tracks and can take a while',
      'If the save downloads YouTube audio, you can normalize those new tracks; existing playlist tracks stay as they are',
      'The playlist menu can Rename (saves the name to Yoto now) or Delete the loaded playlist',
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
          <MaruHeading
            :id="headingId"
            text="Help"
            tone="white"
            size="sm"
            as="h2"
          />
          <button
            type="button"
            class="howto-modal__close"
            :disabled="!interactive"
            aria-label="Close Help"
            @click="beginClose"
          >
            Close
          </button>
        </header>

        <div class="howto-modal__body">
          <p class="howto-modal__intro text-pretty m-0">
            This app helps you build Yoto playlists from YouTube.
            Search for videos, preview the audio, open a playlist (or start a New one and name it), arrange
            tracks, then save the finished set back to Yoto so it
            plays on your player.
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
              <MaruHeading
                class="howto-section__heading"
                :text="section.title"
                tone="blue"
                size="lg"
                as="h3"
              />
              <p class="howto-section__body text-pretty m-0">
                <template v-if="section.id === 'cards'">
                  Connect your Yoto account, then open a
                  <a
                    class="howto-section__link"
                    href="https://my.yotoplay.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >Make Your Own</a>
                  playlist. Use New in the Playlists header (or New playlist when the playlist panel is empty) if you do not have one yet. The selected playlist is what you edit.
                </template>
                <template v-else-if="section.id === 'playlist'">
                  Confirming the name creates the playlist on Yoto and lists it in Playlists. If you already picked tracks (checked results on desktop, or Add → New playlist on a phone), those upload with the create. Otherwise add tracks after, then tap Update. The playlist menu Renames or Deletes a loaded playlist.
                  <strong class="font-maru-bold">Saving downloads and processes each track, so it can take a while—especially on longer playlists.</strong>
                </template>
                <template v-else>
                  {{ section.body }}
                </template>
              </p>
              <ul class="howto-section__bullets m-0">
                <li
                  v-for="bullet in section.bullets"
                  :key="bullet"
                >
                  {{ bullet }}
                </li>
              </ul>
            </div>
          </section>

          <p class="howto-modal__footer-note text-pretty m-0">
            Stuck or found a bug? Use
            <a
              class="howto-section__link"
              href="https://docs.google.com/forms/d/e/1FAIpQLSccwkdCpYaJjODtpxSrtBIaye045nobwudH1L0VX8S6NzFtjA/viewform?usp=publish-editor"
              target="_blank"
              rel="noopener noreferrer"
            >Report Issues</a>
            in the status bar (desktop) or Menu (phone).
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
