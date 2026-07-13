<script setup lang="ts">
const colors = [
  { name: 'white', bg: '--color-maru-white', fg: '--color-maru-black' },
  { name: 'black', bg: '--color-maru-black', fg: '--color-maru-white' },
  { name: 'gray', bg: '--color-maru-gray', fg: '--color-maru-white' },
  { name: 'gray-light', bg: '--color-maru-gray-light', fg: '--color-maru-black' },
  { name: 'brown', bg: '--color-maru-brown', fg: '--color-maru-white' },
  { name: 'red-light', bg: '--color-maru-red-light', fg: '--color-maru-black' },
  { name: 'red-lighter', bg: '--color-maru-red-lighter', fg: '--color-maru-black' },
  { name: 'orange', bg: '--color-maru-orange', fg: '--color-maru-black' },
  { name: 'yellow', bg: '--color-maru-yellow', fg: '--color-maru-black' },
  { name: 'yellow-light', bg: '--color-maru-yellow-light', fg: '--color-maru-black' },
  { name: 'green', bg: '--color-maru-green', fg: '--color-maru-white' },
  { name: 'green-light', bg: '--color-maru-green-light', fg: '--color-maru-black' },
  { name: 'green-lighter', bg: '--color-maru-green-lighter', fg: '--color-maru-black' },
  { name: 'turquoise', bg: '--color-maru-turquoise', fg: '--color-maru-white' },
  { name: 'turquoise-light', bg: '--color-maru-turquoise-light', fg: '--color-maru-black' },
  { name: 'turquoise-lighter', bg: '--color-maru-turquoise-lighter', fg: '--color-maru-black' },
  { name: 'blue', bg: '--color-maru-blue', fg: '--color-maru-white' },
  { name: 'blue-light', bg: '--color-maru-blue-light', fg: '--color-maru-black' },
  { name: 'blue-lighter', bg: '--color-maru-blue-lighter', fg: '--color-maru-black' },
  { name: 'magenta', bg: '--color-maru-magenta', fg: '--color-maru-white' },
  { name: 'magenta-light', bg: '--color-maru-magenta-light', fg: '--color-maru-black' },
  { name: 'magenta-lighter', bg: '--color-maru-magenta-lighter', fg: '--color-maru-black' },
]
</script>

<template>
  <section class="px-maru-gutter py-12 sm:py-16 border-maru-bottom">
    <h2 class="font-maru-mega font-maru-mega-midi text-maru-red-light text-[11vw] sm:text-[8vw] leading-none text-balance mb-8">
      Colors
    </h2>
    <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-0 border-maru">
      <div
        v-for="color in colors"
        :key="color.name"
        class="aspect-square flex flex-col justify-end p-3 border-maru"
        :style="{ backgroundColor: `var(${color.bg})`, color: `var(${color.fg})` }"
      >
        <span class="font-maru-mono font-maru-medium text-xs sm:text-sm">{{ color.name }}</span>
        <span class="font-maru-mono font-maru-regular text-xs opacity-80">{{ color.bg }}</span>
      </div>
    </div>
  </section>
</template>
