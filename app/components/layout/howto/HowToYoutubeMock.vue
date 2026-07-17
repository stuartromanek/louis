<script setup lang="ts">
import AppPanel from '~/components/layout/AppPanel.vue'
</script>

<template>
  <div
    class="howto-mock"
    aria-hidden="true"
  >
    <AppPanel
      title="YouTube Search"
      title-emoji="Videocassette"
      heading-tone="blue-lighter"
      header-bg="bg-maru-blue"
      body-bg="bg-maru-blue-lighter"
      header-text-class="text-maru-white"
      class="howto-mock__panel"
    >
      <div class="howto-mock__search border-maru rounded-maru bg-maru-white">
        <span class="howto-mock__search-icon">
          <MaruEmoji
            name="MagnifyingGlass"
            size="md"
          />
        </span>
        <p class="howto-mock__search-query font-maru-mono truncate m-0">
          Sesame Street
        </p>
        <span class="howto-mock__search-btn font-maru-mono">Search</span>
      </div>
      <ul class="howto-mock__list howto-mock__list--inset">
        <li
          v-for="item in [
            { title: 'Elmo’s Song', channel: 'Sesame Street', time: '2:14' },
            { title: 'Rubber Duckie', channel: 'Sesame Street', time: '1:48' },
            { title: 'C is for Cookie', channel: 'Sesame Street', time: '3:02' },
          ]"
          :key="item.title"
          class="howto-mock__result border-maru rounded-maru bg-maru-white"
        >
          <span class="playlist-handle playlist-handle--sm shrink-0 bg-maru-gray-light">
            <span /><span /><span />
          </span>
          <div class="howto-mock__thumb bg-maru-gray-light" />
          <div class="howto-mock__result-body min-w-0">
            <p class="howto-mock__result-title font-maru-medium m-0 truncate">
              {{ item.title }}
            </p>
            <p class="howto-mock__result-meta font-maru-mono m-0 truncate">
              {{ item.channel }} · {{ item.time }}
            </p>
          </div>
        </li>
      </ul>
    </AppPanel>
  </div>
</template>
