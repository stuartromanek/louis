<script setup lang="ts">
import type { YoutubeVideo } from './types'

defineProps<{
  video: YoutubeVideo
  locked?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

function formatDuration(iso?: string): string {
  if (!iso) return ''
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return iso
  const h = match[1] ? Number(match[1]) : 0
  const m = match[2] ? Number(match[2]) : 0
  const s = match[3] ? Number(match[3]) : 0
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
</script>

<template>
  <div class="border-maru rounded-maru bg-maru-yellow-light p-4">
    <div class="flex flex-col sm:flex-row gap-4">
      <img
        :src="video.thumbnailUrl"
        :alt="video.title"
        class="w-full sm:w-48 aspect-video object-cover border-maru rounded-maru shrink-0"
      >
      <div class="flex-1 min-w-0">
        <h3 class="font-maru-bold text-lg text-balance">{{ video.title }}</h3>
        <p class="font-maru-mono font-maru-regular text-sm text-maru-gray mt-1">
          {{ video.channelTitle }}
          <span v-if="video.duration" class="ml-2">{{ formatDuration(video.duration) }}</span>
        </p>
        <p
          v-if="video.description"
          class="font-maru-regular text-sm text-maru-black mt-3 line-clamp-4 text-pretty"
        >
          {{ video.description }}
        </p>
      </div>
    </div>

    <div v-if="!locked" class="flex gap-2 mt-4">
      <button
        type="button"
        class="maru-button bg-maru-green-light text-maru-black"
        @click="emit('confirm')"
      >
        <span class="maru-button__label">Confirm Select</span>
      </button>
      <button
        type="button"
        class="maru-button bg-maru-white text-maru-black"
        @click="emit('cancel')"
      >
        <span class="maru-button__label">Cancel</span>
      </button>
    </div>
    <p v-else class="font-maru-mono font-maru-medium text-sm text-maru-green mt-4">
      Selected
    </p>
  </div>
</template>
