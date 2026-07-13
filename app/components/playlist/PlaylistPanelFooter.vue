<script setup lang="ts">
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { useSaveProgressTestMode } from '~/components/playlist/saveProgressTestFixture'

const editor = inject(MYO_EDITOR_KEY, null)
const { playEvent } = useUiSound()

const saveProgressTestMode = useSaveProgressTestMode()

const isDirty = editor?.isDirty
const loading = editor?.loading
const isPlaylistLocked = editor?.isPlaylistLocked
const selectedCardId = editor?.selectedCardId
const isPodcast = editor?.isPodcast

const canUpdate = computed(
  () => Boolean(
    selectedCardId?.value
    && isDirty?.value
    && !loading?.value
    && !isPlaylistLocked?.value
    && !saveProgressTestMode.value
    && !isPodcast?.value,
  ),
)

const canReset = computed(
  () => Boolean(isDirty?.value && !loading?.value && !isPlaylistLocked?.value && !saveProgressTestMode.value),
)

function onUpdate() {
  if (!canUpdate.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonPrimary')
  editor?.updateCard()
}

function onReset() {
  if (!canReset.value) {
    playEvent('disabled')
    return
  }
  playEvent('resetPlaylist')
  editor?.resetChanges()
}
</script>

<template>
  <div class="panel-footer-content w-full flex flex-col gap-2 min-w-0">
    <div class="w-full flex items-center justify-end gap-2 min-w-0">
      <p
        v-if="isPodcast?.value"
        class="mr-auto text-[10px] sm:text-xs font-maru-mono text-maru-orange"
      >
        Podcast cards cannot be edited yet.
      </p>
      <button
        type="button"
        class="panel-footer-btn panel-footer-btn--short panel-footer-btn--secondary"
        :aria-disabled="!canReset"
        :tabindex="canReset ? 0 : -1"
        @click="onReset"
      >
        <span class="panel-footer-btn__label">Reset</span>
      </button>
      <button
        type="button"
        class="panel-footer-btn panel-footer-btn--short panel-footer-btn--primary"
        :aria-disabled="!canUpdate"
        :tabindex="canUpdate ? 0 : -1"
        @click="onUpdate"
      >
        <span class="panel-footer-btn__label">{{ isPlaylistLocked?.value || saveProgressTestMode ? 'Updating...' : 'Update' }}</span>
      </button>
    </div>
  </div>
</template>
