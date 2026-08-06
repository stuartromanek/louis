<script setup lang="ts">
import EmptyStateHowto from './EmptyStateHowto.vue'

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
</script>

<template>
  <div
    class="empty-state youtube-empty-state"
    :class="[
      bare ? '' : 'border-maru rounded-maru bg-maru-red-lighter p-4 sm:p-6',
      !bare && fill ? 'min-h-full shrink-0' : '',
      !bare && !fill ? 'min-h-32' : '',
      bare && fill ? 'min-h-full w-full shrink-0 youtube-empty-state--fill' : '',
      bare && !fill ? 'py-2 w-full' : '',
      fill && !bare ? 'youtube-empty-state--fill' : '',
    ]"
  >
    <template v-if="variant === 'no-results'">
      <div class="youtube-empty-state__header shrink-0">
        <MaruEmoji
          name="AnguishedFace"
          size="empty"
        />

        <p class="empty-state-title">
          No results found
        </p>

        <p class="empty-state-meta max-w-lg">
          Nothing matched “{{ query }}”. Try different keywords.
        </p>
      </div>
    </template>

    <EmptyStateHowto
      v-else
      :placeholders="placeholders"
      :fill="fill"
      @search="emit('search', $event)"
    />
  </div>
</template>

<style scoped>
.youtube-empty-state {
  gap: 1.25rem;
  justify-content: safe center;
}

.youtube-empty-state--fill {
  align-items: stretch;
  justify-content: stretch;
  height: 100%;
  min-height: 100%;
}

.youtube-empty-state__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.youtube-empty-state__header .maru-emoji + .empty-state-title {
  margin-top: -0.15em;
}

.youtube-empty-state .empty-state-title {
  font-size: clamp(1.25rem, 7cqw, 1.75rem);
}
</style>
