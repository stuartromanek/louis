<script setup lang="ts">
import MaruEmoji from '~/components/ui/MaruEmoji.vue'
import type { EmojiId } from '~/utils/emojiCatalog'

withDefaults(defineProps<{
  text: string
  emoji?: EmojiId
  as?: 'h1' | 'h2' | 'h3'
  tone?: 'blue' | 'white' | 'black' | 'red' | 'green-lighter' | 'blue-lighter' | 'yellow-light' | 'magenta-light'
  size?: 'sm' | 'md' | 'lg'
  align?: 'left' | 'center'
}>(), {
  emoji: undefined,
  as: 'h2',
  tone: 'blue',
  size: 'sm',
  align: 'left',
})
</script>

<template>
  <component
    :is="as"
    class="maru-heading"
    :class="[
      `maru-heading--${tone}`,
      `maru-heading--${size}`,
      `maru-heading--${align}`,
      emoji ? 'maru-heading--with-emoji' : '',
    ]"
  >
    <MaruEmoji
      v-if="emoji"
      :name="emoji"
      class="maru-heading__emoji"
    />
    <span
      class="maru-heading__label"
      :data-outline-duplicate-text="text"
    >{{ text }}</span>
  </component>
</template>
