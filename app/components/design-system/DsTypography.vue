<script setup lang="ts">
const weights = [
  { label: 'Light', class: 'font-maru-light', wght: '300' },
  { label: 'Regular', class: 'font-maru-regular', wght: '400' },
  { label: 'Medium', class: 'font-maru-medium', wght: '400' },
  { label: 'Bold', class: 'font-maru-bold', wght: '700' },
  { label: 'Black', class: 'font-maru-black', wght: '700' },
]

const displaySizes = [
  { label: 'Small', class: 'text-3xl sm:text-4xl' },
  { label: 'Medium', class: 'text-4xl sm:text-6xl' },
  { label: 'Large', class: 'text-[10vw] sm:text-[8vw]' },
]
</script>

<template>
  <section class="px-maru-gutter py-12 sm:py-16 border-maru-bottom">
    <h2 class="font-maru-mega font-maru-mega-midi text-maru-orange text-[11vw] sm:text-[8vw] leading-none text-balance mb-8">
      Typography
    </h2>

    <div class="mb-maru-m">
      <h3 class="font-maru-mono font-maru-medium text-maru-gray mb-4">Dongle — Weight Scale</h3>
      <div class="border-maru">
        <div
          v-for="w in weights"
          :key="w.label"
          class="flex items-baseline justify-between border-maru-bottom last:border-b-0 px-4 py-3"
        >
          <span class="font-maru-mono font-maru-regular text-sm text-maru-gray w-20">{{ w.label }}</span>
          <span
            class="font-maru text-2xl sm:text-4xl lg:text-5xl inline-flex items-center gap-2"
            :class="w.class"
          >
            Futomaki
            <MaruEmoji name="PotOfFood" size="sm" />
          </span>
          <span class="font-maru-mono font-maru-regular text-xs text-maru-gray w-16 text-right">{{ w.wght }}</span>
        </div>
      </div>
    </div>

    <div class="mb-maru-m">
      <h3 class="font-maru-mono font-maru-medium text-maru-gray mb-4">Dongle — Secondary</h3>
      <p class="font-maru-mono text-base sm:text-lg lg:text-xl border-maru rounded-maru p-4 text-pretty leading-relaxed">
        Sometimes also called Maki Sushi. The diameter is about 5–6cm with lotus root, unagi, and anago.
      </p>
    </div>

    <div>
      <h3 class="font-maru-mono font-maru-medium text-maru-gray mb-4">Dongle — Display Sizes</h3>
      <div class="space-y-4">
        <div
          v-for="size in displaySizes"
          :key="size.label"
          class="border-maru rounded-maru p-4 bg-maru-yellow-light"
        >
          <span class="font-maru-mono font-maru-regular text-xs text-maru-gray">{{ size.label }}</span>
          <p
            class="font-maru-mega leading-none"
            :class="size.class"
          >
            Go Big
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
