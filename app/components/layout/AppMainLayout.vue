<script setup lang="ts">
import AppPanel from '~/components/layout/AppPanel.vue'
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

const tabs: { id: MobileEditorTab, label: string, emoji: EmojiId }[] = [
  { id: 'search', label: 'Search', emoji: 'Videocassette' },
  { id: 'cards', label: 'Cards', emoji: 'Bear' },
  { id: 'playlist', label: 'Playlist', emoji: 'Doughnut' },
]

function onTab(tab: MobileEditorTab) {
  if (activeTab.value === tab) return
  playEvent('buttonClick')
  chrome?.goToTab(tab)
}

function stageClass(tab: MobileEditorTab, desktopExtra = '') {
  const onPhone = activeTab.value === tab
  return onPhone
    ? `flex-1 min-h-0 h-full ${desktopExtra}`
    : `max-sm:hidden sm:min-h-0 sm:h-full ${desktopExtra}`
}
</script>

<template>
  <div class="h-full flex flex-col gap-2 sm:gap-3 p-2 sm:p-3 min-h-0 bg-maru-gray-light">
    <div
      v-if="$slots.toolbar"
      class="shrink-0 w-full"
    >
      <slot name="toolbar" />
    </div>

    <div class="flex-1 min-h-0 flex flex-col gap-2 sm:grid sm:grid-cols-[55fr_45fr] sm:gap-3">
      <AppPanel
        title="YouTube Search"
        title-emoji="Videocassette"
        heading-tone="blue-lighter"
        header-bg="bg-maru-blue"
        body-bg="bg-maru-blue-lighter"
        header-text-class="text-maru-white"
        :class="stageClass('search')"
        fill-body
      >
        <slot name="youtube" />
      </AppPanel>

      <div class="contents sm:flex sm:flex-col sm:gap-3 sm:min-h-0 sm:h-full sm:overflow-hidden">
        <AppPanel
          title="My Cards"
          title-emoji="Bear"
          heading-tone="yellow-light"
          header-bg="bg-maru-magenta"
          body-bg="bg-maru-yellow-light"
          header-text-class="text-maru-white"
          :class="stageClass('cards', 'sm:flex-[2]')"
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
          :class="stageClass('playlist', 'sm:flex-[3]')"
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
    </div>

    <nav
      class="mobile-editor-tabs sm:hidden shrink-0"
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
          size="sm"
        />
        <span class="mobile-editor-tabs__label font-maru-medium">{{ tab.label }}</span>
      </button>
    </nav>

    <div
      v-if="$slots.footer"
      class="hidden sm:block shrink-0 w-full"
    >
      <slot name="footer" />
    </div>
  </div>
</template>
