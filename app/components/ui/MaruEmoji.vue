<script setup lang="ts">
import { emojiPath, type EmojiId } from '~/utils/emojiCatalog'

const SIZE_REM = {
  xs: 1,
  sm: 1.25,
  md: 1.75,
  lg: 2.8125,
  xl: 3.375,
  empty: 4,
} as const

const props = withDefaults(defineProps<{
  name: EmojiId
  size?: keyof typeof SIZE_REM
  /** Custom size in rem (overrides size preset). */
  sizeRem?: number
}>(), {
  size: 'md',
  sizeRem: undefined,
})

const inlineStyle = computed(() => {
  const rem = props.sizeRem ?? SIZE_REM[props.size]
  return { width: `${rem}rem`, height: `${rem}rem` }
})
</script>

<template>
  <img
    :src="emojiPath(name)"
    alt=""
    aria-hidden="true"
    class="maru-emoji"
    :style="inlineStyle"
  >
</template>
