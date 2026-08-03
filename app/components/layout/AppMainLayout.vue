<script setup lang="ts">
import AppPanel from '~/components/layout/AppPanel.vue'
import MaruHeading from '~/components/layout/MaruHeading.vue'
import MobilePhoneHeader from '~/components/layout/MobilePhoneHeader.vue'
import MaruEmoji from '~/components/ui/MaruEmoji.vue'
import {
  MOBILE_EDITOR_CHROME_KEY,
  type MobileEditorTab,
} from '~/composables/useMobileEditorChrome'
import type { EmojiId } from '~/utils/emojiCatalog'

defineProps<{
  playlistTitle?: string
  myoCount?: string
}>()

const { playEvent } = useUiSound()
const chrome = inject(MOBILE_EDITOR_CHROME_KEY, null)

const activeTab = computed(() => chrome?.activeTab.value ?? 'search')
const libraryMode = computed(() => chrome?.libraryMode.value ?? 'grid')

const tabs: { id: MobileEditorTab, label: string, emoji: EmojiId }[] = [
  { id: 'search', label: 'Search', emoji: 'Videocassette' },
  { id: 'library', label: 'Library', emoji: 'Books' },
]

function onTab(tab: MobileEditorTab) {
  if (activeTab.value === tab) return
  playEvent('buttonClick')
  chrome?.goToTab(tab)
}

function onBackToCards() {
  playEvent('buttonClick')
  chrome?.backToLibrary()
}
</script>

<template>
  <div class="h-full flex flex-col gap-2 sm:gap-3 p-2 sm:p-3 min-h-0 bg-maru-gray-light">
    <div
      v-if="$slots.toolbar"
      class="desktop-only-block shrink-0 w-full"
    >
      <slot name="toolbar" />
    </div>

    <div class="flex-1 min-h-0 flex flex-col sm:grid sm:grid-cols-[55fr_45fr] sm:gap-3">
      <AppPanel
        title="YouTube Search"
        title-emoji="Videocassette"
        heading-tone="blue-lighter"
        header-bg="bg-maru-blue"
        body-bg="bg-maru-blue-lighter"
        header-text-class="text-maru-white"
        class="mobile-stage sm:min-h-0 sm:h-full"
        :class="activeTab === 'search' ? 'mobile-stage--search-on' : 'mobile-stage--search-off'"
        fill-body
      >
        <slot name="youtube" />
      </AppPanel>

      <div class="desktop-right-col sm:flex sm:flex-col sm:gap-3 sm:min-h-0 sm:h-full sm:overflow-hidden">
        <AppPanel
          title="My Cards"
          title-emoji="Books"
          heading-tone="yellow-light"
          header-bg="bg-maru-magenta"
          body-bg="bg-maru-yellow-light"
          header-text-class="text-maru-white"
          class="flex-[2] min-h-0"
          :count="myoCount"
          fill-body
          scroll-body
          :body-padding="false"
        >
          <slot name="myo" />
        </AppPanel>

        <AppPanel
          :title="playlistTitle || 'Playlist'"
          title-emoji="Doughnut"
          heading-tone="green-lighter"
          header-bg="bg-maru-orange"
          body-bg="bg-maru-green-lighter"
          header-text-class="text-maru-black"
          class="flex-[3] min-h-0"
          fill-body
        >
          <template
            v-if="$slots['playlist-header']"
            #header-actions
          >
            <slot name="playlist-header" />
          </template>
          <slot name="playlist" />
          <template
            v-if="$slots['playlist-footer']"
            #footer
          >
            <slot name="playlist-footer" />
          </template>
        </AppPanel>
      </div>

      <div
        class="mobile-library-stage min-h-0"
        :class="activeTab === 'library' ? 'mobile-library-stage--on' : 'mobile-library-stage--off'"
      >
        <div class="mobile-library-panel border-maru rounded-maru bg-maru-yellow-light flex flex-col overflow-hidden min-h-0 h-full">
          <header class="mobile-library-panel__header border-maru-bottom shrink-0 flex items-center gap-2 px-2.5 py-1.5 bg-maru-magenta">
            <button
              v-if="libraryMode === 'card'"
              type="button"
              class="mobile-library-panel__back"
              @click="onBackToCards"
            >
              <MaruEmoji
                name="HighSpeedTrain"
                :size-rem="1.35"
                class="mobile-library-panel__back-emoji"
              />
              <span class="mobile-library-panel__back-label">Back to cards</span>
            </button>
            <MaruHeading
              v-else
              text="Library"
              emoji="Bear"
              tone="yellow-light"
              size="sm"
            />
          </header>
          <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
            <slot name="phone-library" />
          </div>
        </div>
      </div>
    </div>

    <nav
      class="mobile-editor-tabs"
      aria-label="Editor panels"
    >
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="mobile-editor-tabs__tab"
        :class="{ 'mobile-editor-tabs__tab--active': activeTab === tab.id }"
        :aria-current="activeTab === tab.id ? 'page' : undefined"
        @click="onTab(tab.id)"
      >
        <MaruEmoji
          :name="tab.emoji"
          :size-rem="1.4"
        />
        <span class="mobile-editor-tabs__label">{{ tab.label }}</span>
      </button>
      <MobilePhoneHeader />
    </nav>

    <div
      v-if="$slots.footer"
      class="desktop-only-block shrink-0 w-full"
    >
      <slot name="footer" />
    </div>
  </div>
</template>
