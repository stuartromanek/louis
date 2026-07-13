<script setup lang="ts">
const PLACEHOLDER_COLORS = [
  { bg: 'bg-maru-yellow', text: 'text-maru-black' },
  { bg: 'bg-maru-blue-light', text: 'text-maru-black' },
  { bg: 'bg-maru-green-light', text: 'text-maru-black' },
  { bg: 'bg-maru-magenta-light', text: 'text-maru-black' },
  { bg: 'bg-maru-orange', text: 'text-maru-black' },
  { bg: 'bg-maru-turquoise-light', text: 'text-maru-black' },
] as const

withDefaults(defineProps<{
  variant?: 'initial' | 'no-results'
  query?: string
  placeholders?: string[]
  fill?: boolean
  bare?: boolean
}>(), {
  variant: 'initial',
  query: '',
  placeholders: () => [],
  fill: false,
  bare: false,
})

const emit = defineEmits<{
  search: [query: string]
}>()

const { playEvent } = useUiSound()

function onChipHover() {
  playEvent('chipHover')
}

function onChipClick(placeholder: string) {
  playEvent('toggleOn')
  emit('search', placeholder)
}

function colorForIndex(index: number) {
  return PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length]!
}

function hashLabel(label: string): number {
  let hash = 0
  for (let i = 0; i < label.length; i++) {
    hash = ((hash << 5) - hash) + label.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function chipStyle(label: string) {
  const rotation = ((hashLabel(label) % 17) - 8) * 0.85
  return { '--chip-rotate': `${rotation.toFixed(1)}deg` }
}
</script>

<template>
  <div
    class="empty-state youtube-empty-state"
    :class="[
      bare ? '' : 'border-maru rounded-maru bg-maru-red-lighter p-4 sm:p-6',
      !bare && fill ? 'flex-1 min-h-0' : '',
      !bare && !fill ? 'min-h-32' : '',
      bare && fill ? 'flex-1 min-h-0 w-full' : '',
      bare && !fill ? 'py-2 w-full' : '',
    ]"
  >
    <div class="youtube-empty-state__header shrink-0">
      <MaruEmoji
        :name="variant === 'no-results' ? 'AnguishedFace' : 'MagnifyingGlass'"
        size="empty"
      />

      <p class="empty-state-title">
        <template v-if="variant === 'no-results'">
          No results found
        </template>
        <template v-else>
          Search YouTube
        </template>
      </p>

      <p class="empty-state-meta max-w-lg">
        <template v-if="variant === 'no-results'">
          Nothing matched “{{ query }}”. Try different keywords.
        </template>
        <template v-else>
          Type a song, show, or artist above to find videos you can preview and add to your playlist.
        </template>
      </p>
    </div>

    <div
      v-if="variant === 'initial' && placeholders.length > 0"
      class="empty-state-chip-cloud mt-2"
    >
      <button
        v-for="(placeholder, index) in placeholders"
        :key="placeholder"
        type="button"
        class="maru-button empty-state-chip"
        :class="[colorForIndex(index).bg, colorForIndex(index).text]"
        :style="chipStyle(placeholder)"
        @mouseenter="onChipHover"
        @click="onChipClick(placeholder)"
      >
        <span class="maru-button__label">{{ placeholder }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.youtube-empty-state {
  gap: 0.75rem;
}

.youtube-empty-state__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  width: 100%;
}

.youtube-empty-state__header .empty-state-title {
  margin-top: -0.15em;
}

.empty-state-chip-cloud {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
}

.empty-state-chip-cloud .maru-button {
  font-size: 1.75rem;
  padding: 0.25rem 0.75rem;
}

.empty-state-chip {
  position: relative;
  scale: 1;
  transform: rotate(var(--chip-rotate, 0deg));
  transform-origin: center center;
  box-shadow: 3px 3px 0 var(--color-maru-black);
  transition:
    transform 320ms cubic-bezier(0.34, 1.45, 0.64, 1),
    box-shadow 200ms ease-out,
    z-index 0ms;
}

.empty-state-chip:hover {
  z-index: 20;
  scale: 1;
  transform: translateY(-0.15em) rotate(var(--chip-rotate, 0deg)) scale(1.05);
  box-shadow: 5px 6px 0 var(--color-maru-black);
}

.empty-state-chip:active {
  z-index: 20;
  scale: 1;
  transform: translateY(0.05em) rotate(var(--chip-rotate, 0deg)) scale(0.96);
  box-shadow: 1px 1px 0 var(--color-maru-black);
  transition-duration: 100ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

@media (max-width: 939px) {
  .empty-state-chip-cloud .maru-button {
    font-size: 1.5rem;
    padding: 0.25rem 0.5rem;
  }
}
</style>
