<script setup lang="ts">
import AppPanel from '~/components/layout/AppPanel.vue'

const cards = [
  { title: 'Bedtime Mix', meta: '12 min · 4 tracks', selected: true, art: 'blue' },
  { title: 'Car Songs', meta: '28 min · 8 tracks', selected: false, art: 'orange' },
  { title: 'Quiet Time', meta: '19 min · 5 tracks', selected: false, art: 'green' },
] as const
</script>

<template>
  <div
    class="howto-mock"
    aria-hidden="true"
  >
    <AppPanel
      title="My Cards"
      title-emoji="Bear"
      heading-tone="yellow-light"
      header-bg="bg-maru-magenta"
      body-bg="bg-maru-yellow-light"
      header-text-class="text-maru-white"
      count="3"
      class="howto-mock__panel"
      :body-padding="false"
    >
      <div class="howto-mock__cards p-3 sm:p-4">
        <div
          v-for="(card, index) in cards"
          :key="card.title"
          class="howto-mock__card border-maru rounded-maru bg-maru-white overflow-hidden"
          :class="{ 'howto-mock__card--selected': card.selected }"
          :style="{ '--card-tilt': `${(index - 1) * 2.5}deg` }"
        >
          <div
            class="howto-mock__card-art"
            :class="`howto-mock__card-art--${card.art}`"
          >
            <span class="howto-mock__card-art-label font-maru-mono">MYO</span>
          </div>
          <div class="howto-mock__card-footer border-maru-top">
            <p class="howto-mock__card-title font-maru-medium m-0">
              {{ card.title }}
            </p>
            <p class="howto-mock__card-meta font-maru-mono m-0">
              {{ card.meta }}
            </p>
          </div>
        </div>
      </div>
    </AppPanel>
  </div>
</template>
