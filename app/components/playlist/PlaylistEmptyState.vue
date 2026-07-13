<script setup lang="ts">
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import type { EmojiId } from '~/utils/emojiCatalog'

withDefaults(defineProps<{
  fill?: boolean
}>(), {
  fill: false,
})

const editor = inject(MYO_EDITOR_KEY, null)

const isEditing = computed(() => editor?.isEditing.value ?? false)

const content = computed((): { emoji: EmojiId, title: string, description: string } => {
  if (isEditing.value) {
    return {
      emoji: 'MusicalNotes',
      title: 'Drop videos here',
      description: 'Drag tracks from YouTube Search into this playlist to build your card.',
    }
  }

  return {
    emoji: 'BilledCap',
    title: 'Select a Card',
    description: 'Choose a card from My Cards above to view or edit its playlist.',
  }
})
</script>

<template>
  <div
    class="empty-state"
    :class="fill ? 'flex-1 min-h-0 m-auto w-full' : 'min-h-32 py-10 px-4'"
  >
    <MaruEmoji :name="content.emoji" size="empty" />

    <p class="empty-state-title">
      {{ content.title }}
    </p>

    <p class="empty-state-meta max-w-xs">
      {{ content.description }}
    </p>
  </div>
</template>
