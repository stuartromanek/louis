<script setup lang="ts">
import MaruHeading from '~/components/layout/MaruHeading.vue'

const weights = [
  { label: 'Regular', class: 'font-maru-regular', wght: '400' },
  { label: 'Medium', class: 'font-maru-medium', wght: '500' },
  { label: 'Bold', class: 'font-maru-bold', wght: '700' },
]

const roles = [
  { label: 'nav', class: 'type-nav', sample: 'Connected to Yoto' },
  { label: 'meter-title', class: 'type-meter-title', sample: 'tracks' },
  { label: 'window-meta', class: 'type-window-meta', sample: '8 playlists' },
  { label: 'caption', class: 'type-caption', sample: 'Footer lip / tip' },
  { label: 'label', class: 'type-label', sample: 'Sounds' },
  { label: 'body', class: 'type-body', sample: 'Modal and page prose sits here.' },
  { label: 'meta', class: 'type-meta', sample: 'Channel · 3 min' },
  { label: 'meta-sm', class: 'type-meta-sm', sample: 'Taylor Swift · 3 min' },
  { label: 'button', class: 'type-button', sample: 'Connect to Yoto' },
  { label: 'button-secondary', class: 'type-button-secondary', sample: 'Reset' },
  { label: 'title', class: 'type-title font-maru-medium', sample: 'Cube Card' },
  { label: 'title-sm', class: 'type-title-sm font-maru-medium', sample: 'Playlist row title' },
  { label: 'search-placeholder', class: 'type-search-placeholder', sample: 'K Pop Demon Hunters' },
  { label: 'empty-title', class: 'type-empty-title', sample: 'Search YouTube' },
  { label: 'empty-body', class: 'type-empty-body', sample: 'Type a song, show, or artist…' },
  { label: 'display', class: 'type-display font-maru-bold', sample: 'Go Big' },
]
</script>

<template>
  <section class="px-maru-gutter py-12 sm:py-16 border-maru-bottom">
    <h2 class="type-display font-maru-bold text-maru-orange text-balance mb-8">
      Typography
    </h2>

    <div class="mb-maru-m">
      <h3 class="type-label text-maru-gray mb-4">Do not invent one-off sizes</h3>
      <p class="type-body text-pretty max-w-2xl mb-4">
        Map UI copy to a named role below (or <code class="font-maru-mono">MaruHeading</code> sm/md).
        Approximate the closest fit, or ask how a new role should be named before adding tokens.
        Settings title is the only approved product one-off.
      </p>
    </div>

    <div class="mb-maru-m">
      <h3 class="type-label text-maru-gray mb-4">Saeada — Weight Scale</h3>
      <div class="border-maru">
        <div
          v-for="w in weights"
          :key="w.label"
          class="flex items-baseline justify-between border-maru-bottom last:border-b-0 px-4 py-3"
        >
          <span class="type-caption text-maru-gray w-20">{{ w.label }}</span>
          <span
            class="type-title inline-flex items-center gap-2"
            :class="w.class"
          >
            Futomaki
            <MaruEmoji name="PotOfFood" size="sm" />
          </span>
          <span class="type-caption text-maru-gray w-16 text-right">{{ w.wght }}</span>
        </div>
      </div>
    </div>

    <div class="mb-maru-m">
      <h3 class="type-label text-maru-gray mb-4">Named type roles</h3>
      <div class="border-maru">
        <div
          v-for="role in roles"
          :key="role.label"
          class="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-6 border-maru-bottom last:border-b-0 px-4 py-3"
        >
          <code class="type-caption text-maru-gray shrink-0 sm:w-44">type-{{ role.label }}</code>
          <span :class="role.class">{{ role.sample }}</span>
        </div>
      </div>
    </div>

    <div>
      <h3 class="type-label text-maru-gray mb-4">MaruHeading sizes</h3>
      <div class="space-y-4">
        <div class="border-maru rounded-maru p-4 bg-maru-yellow-light">
          <span class="type-caption text-maru-gray">sm — window title</span>
          <MaruHeading
            text="YouTube Search"
            tone="black"
            size="sm"
            class="mt-2"
          />
        </div>
        <div class="border-maru rounded-maru p-4 bg-maru-blue-lighter">
          <span class="type-caption text-maru-gray">md — modal title</span>
          <MaruHeading
            text="Connect Louis to Yoto"
            tone="black"
            size="md"
            class="mt-2"
          />
        </div>
      </div>
    </div>
  </section>
</template>
