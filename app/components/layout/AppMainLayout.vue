<script setup lang="ts">
import AppPanel from '~/components/layout/AppPanel.vue'

defineProps<{
  playlistTitle?: string
  myoCount?: string
}>()
</script>

<template>
  <div class="h-full flex flex-col gap-3 p-3 min-h-0 bg-maru-gray-light">
    <div v-if="$slots.toolbar" class="shrink-0 w-full">
      <slot name="toolbar" />
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-[55fr_45fr] gap-3">
      <AppPanel
        title="YouTube Search"
        title-emoji="Videocassette"
        heading-tone="blue-lighter"
        header-bg="bg-maru-blue"
        body-bg="bg-maru-blue-lighter"
        header-text-class="text-maru-white"
        class="min-h-0 h-full"
        fill-body
      >
        <slot name="youtube" />
      </AppPanel>

      <div class="flex flex-col gap-3 min-h-0 h-full overflow-hidden">
        <AppPanel
          title="My Cards"
          title-emoji="Bear"
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
          <template v-if="$slots['playlist-footer']" #footer>
            <slot name="playlist-footer" />
          </template>
        </AppPanel>
      </div>
    </div>

    <div v-if="$slots.footer" class="shrink-0 w-full">
      <slot name="footer" />
    </div>
  </div>
</template>
