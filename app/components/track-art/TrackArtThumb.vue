<script setup lang="ts">
import { resolveTrackIcon } from '#shared/myo-editor/trackArt'
import type { PlaylistTrack } from '~/components/playlist/types'

const props = withDefaults(defineProps<{
  track: PlaylistTrack
  locked?: boolean
  size?: 'sm' | 'md'
}>(), {
  locked: false,
  size: 'md',
})

const emit = defineEmits<{
  edit: []
}>()

const { playEvent } = useUiSound()

const resolved = computed(() => resolveTrackIcon(props.track))
const hasArt = computed(() => Boolean(resolved.value.previewUrl || resolved.value.icon16x16))

function onClick() {
  if (props.locked) return
  playEvent('buttonClick')
  emit('edit')
}
</script>

<template>
  <button
    type="button"
    class="track-art-thumb"
    :class="[
      `track-art-thumb--${size}`,
      hasArt ? 'track-art-thumb--filled' : 'track-art-thumb--empty',
    ]"
    :disabled="locked"
    :aria-label="hasArt ? `Edit art for ${track.title}` : `Add art for ${track.title}`"
    aria-haspopup="dialog"
    @click.stop="onClick"
  >
    <img
      v-if="resolved.previewUrl"
      :src="resolved.previewUrl"
      alt=""
      class="track-art-thumb__img"
      loading="lazy"
      draggable="false"
    >
    <span
      v-else
      class="track-art-thumb__placeholder"
      aria-hidden="true"
    >+</span>
  </button>
</template>
