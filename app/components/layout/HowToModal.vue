<script setup lang="ts">
import HowToYoutubeMock from '~/components/layout/howto/HowToYoutubeMock.vue'
import HowToCardsMock from '~/components/layout/howto/HowToCardsMock.vue'
import HowToPlaylistMock from '~/components/layout/howto/HowToPlaylistMock.vue'
import MaruHeading from '~/components/layout/MaruHeading.vue'
import AppFlyout from '~/components/layout/AppFlyout.vue'

const open = defineModel<boolean>('open', { default: false })

const { playEvent } = useUiSound()

const headingId = 'howto-heading'

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
      'The playlist menu can set Artwork (generated covers), Rename (saves the name to Yoto now), or Delete the loaded playlist',
    ],
  },
] as const

watch(open, (isOpen) => {
  if (isOpen) playEvent('toggleOn')
})

function onClose() {
  playEvent('buttonClick')
}
</script>

<template>
  <AppFlyout
    v-model:open="open"
    title="Help"
    :heading-id="headingId"
    heading-tone="white"
    header-class="bg-maru-yellow"
    face-class="bg-maru-white"
    size="lg"
    dismiss-label="Close Help"
    :pad-body="false"
    body-class="howto-modal__body"
    @close="onClose"
  >
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
  </AppFlyout>
</template>
