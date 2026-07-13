<script setup lang="ts">
const spacings = [
  { label: 'xs', mb: 'mb-maru-xs', formula: '100vmax / 56' },
  { label: 's', mb: 'mb-maru-s', formula: '100vmax / 42' },
  { label: 'm', mb: 'mb-maru-m', formula: '100vmax / 28' },
  { label: 'l', mb: 'mb-maru-l', formula: '100vmax / 14' },
]
</script>

<template>
  <section class="px-maru-gutter py-12 sm:py-16 border-maru-bottom">
    <h2 class="font-maru-mega font-maru-mega-midi text-maru-blue text-[11vw] sm:text-[8vw] leading-none text-balance mb-8">
      Spacing
    </h2>

    <p class="font-maru-regular text-base sm:text-lg text-maru-gray mb-8 text-pretty max-w-xl">
      Viewport-relative spacing scale from the source site. Each step uses
      <code class="font-maru-mono text-sm bg-maru-gray-light px-1 rounded">calc(100vmax / N)</code>.
    </p>

    <div class="border-maru">
      <div
        v-for="space in spacings"
        :key="space.label"
        class="border-maru-bottom last:border-b-0"
      >
        <div class="flex items-center gap-4 px-4 py-3 bg-maru-white">
          <span class="font-maru-mono font-maru-bold text-sm w-8">{{ space.label }}</span>
          <span class="font-maru-mono font-maru-regular text-xs text-maru-gray">calc({{ space.formula }})</span>
        </div>
        <div class="px-4 pb-4">
          <div class="bg-maru-blue-light border-maru rounded-maru h-12" />
          <div :class="space.mb">
            <div class="bg-maru-blue border-maru rounded-maru h-12" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
