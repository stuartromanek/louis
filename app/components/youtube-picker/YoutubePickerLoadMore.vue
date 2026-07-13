<script setup lang="ts">
import { shuffleEmojis, type EmojiId } from '~/utils/emojiCatalog'

const EMOJIS_PER_SIDE = 5

defineProps<{
  loading?: boolean
}>()

const emit = defineEmits<{
  click: []
}>()

const leftEmojis = ref<EmojiId[]>([])
const rightEmojis = ref<EmojiId[]>([])
const dancing = ref(false)

function assignEmojiSides() {
  const picked = shuffleEmojis(EMOJIS_PER_SIDE * 2)
  leftEmojis.value = picked.slice(0, EMOJIS_PER_SIDE)
  rightEmojis.value = picked.slice(EMOJIS_PER_SIDE)
}

onMounted(assignEmojiSides)

const { playEvent } = useUiSound()

function onClick() {
  playEvent('loadMoreClick')
  dancing.value = true
  emit('click')
  window.setTimeout(() => {
    dancing.value = false
  }, 900)
}
</script>

<template>
  <button
    type="button"
    class="load-more-btn mt-2 mb-2 sm:mb-3 border-maru rounded-maru bg-maru-turquoise-lighter text-maru-black font-maru-bold px-4 py-3 w-full transition-[scale,opacity] active:scale-[0.96] disabled:opacity-60"
    :class="{ 'load-more-btn--dancing': dancing }"
    :disabled="loading"
    @click="onClick"
  >
    <span class="load-more-side load-more-side--left" aria-hidden="true">
      <span
        v-for="(emoji, index) in leftEmojis"
        :key="`l-${emoji}-${index}`"
        class="load-more-emoji"
        :style="{ '--dance-delay': `${index * 90}ms` }"
      >
        <MaruEmoji :name="emoji" size="md" />
      </span>
    </span>

    <span class="load-more-label">
      {{ loading ? 'Loading...' : 'Load more' }}
    </span>

    <span class="load-more-side load-more-side--right" aria-hidden="true">
      <span
        v-for="(emoji, index) in rightEmojis"
        :key="`r-${emoji}-${index}`"
        class="load-more-emoji"
        :style="{ '--dance-delay': `${index * 90}ms` }"
      >
        <MaruEmoji :name="emoji" size="md" />
      </span>
    </span>
  </button>
</template>

<style scoped>
.load-more-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 4rem;
  line-height: 1;
}

.load-more-side {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 5.5rem;
}

.load-more-side--left {
  justify-content: flex-start;
}

.load-more-side--right {
  justify-content: flex-end;
}

.load-more-label {
  position: relative;
  top: 3px;
  flex: 1;
  text-align: center;
  font-size: 1.75rem;
  line-height: 0.9;
}

@media (width >= 600px) {
  .load-more-label {
    font-size: 2.25rem;
  }
}

.load-more-emoji {
  display: inline-flex;
  animation-delay: var(--dance-delay, 0ms);
}

.load-more-btn:hover:not(:disabled) .load-more-emoji,
.load-more-btn--dancing .load-more-emoji {
  animation: load-more-emoji-dance 0.45s ease-in-out infinite;
  animation-delay: var(--dance-delay, 0ms);
}

@keyframes load-more-emoji-dance {
  0%, 100% {
    transform: translateY(0) rotate(0deg);
  }
  25% {
    transform: translateY(-4px) rotate(-8deg);
  }
  75% {
    transform: translateY(-2px) rotate(8deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .load-more-btn:hover:not(:disabled) .load-more-emoji,
  .load-more-btn--dancing .load-more-emoji {
    animation: none;
  }
}
</style>
