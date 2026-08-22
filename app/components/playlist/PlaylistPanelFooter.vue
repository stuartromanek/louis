<script setup lang="ts">
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { useSaveProgressTestMode } from '~/components/playlist/saveProgressTestFixture'
import PlaylistCapacityMeters from '~/components/playlist/PlaylistCapacityMeters.vue'
import {
  getPlaylistCapacitySnapshot,
  YOTO_MYO_TRACK_COUNT_MESSAGE,
} from '#shared/myo-editor/yotoMyoLimits'
import {
  getStandalonePlaylistValidationError,
} from '#shared/myo-editor/standalonePlaylist'

const editor = inject(MYO_EDITOR_KEY, null)
const { playEvent } = useUiSound()

const saveProgressTestMode = useSaveProgressTestMode()

const isDirty = editor?.isDirty
const loading = editor?.loading
const isPlaylistLocked = editor?.isPlaylistLocked
const selectedCardId = editor?.selectedCardId
const isNewPlaylist = editor?.isNewPlaylist
const createOutcomeUncertain = editor?.createOutcomeUncertain
const cardTitle = editor?.cardTitle
const isPodcast = editor?.isPodcast
const playlist = editor?.playlist

const capacity = computed(() => getPlaylistCapacitySnapshot(playlist?.value ?? []))

const overTrackLimit = computed(
  () => capacity.value.trackCount > capacity.value.trackMax,
)

const footerHint = computed(() => {
  if (isPodcast?.value) return 'Podcasts cannot be edited yet.'
  if (createOutcomeUncertain?.value) return 'Check Playlists before trying again.'
  if (overTrackLimit.value) return YOTO_MYO_TRACK_COUNT_MESSAGE
  return ''
})

const canCreate = computed(() => {
  if (!isNewPlaylist?.value) return false
  return !getStandalonePlaylistValidationError(cardTitle?.value ?? '', playlist?.value ?? [])
})

const canUpdate = computed(
  () => Boolean(
    !loading?.value
    && !isPlaylistLocked?.value
    && !saveProgressTestMode.value
    && !isPodcast?.value
    && (
      isNewPlaylist?.value
        ? canCreate.value && !createOutcomeUncertain?.value
        : selectedCardId?.value && isDirty?.value
    ),
  ),
)

const canReset = computed(
  () => Boolean(isDirty?.value && !loading?.value && !isPlaylistLocked?.value && !saveProgressTestMode.value),
)

const askingUpdatePrompt = computed(
  () => Boolean(editor?.updatePrompt.value) && !editor.saveStarting.value,
)

const askingManagePrompt = computed(
  () => Boolean(editor?.playlistManagePrompt.value),
)

const updateBusy = computed(
  () => Boolean(isPlaylistLocked?.value || saveProgressTestMode.value || editor?.saveStarting.value),
)

const overlayBusy = computed(
  () => updateBusy.value || Boolean(editor?.playlistManageBusy.value),
)

const primaryLabel = computed(() => {
  if (updateBusy.value) return isNewPlaylist?.value ? 'Creating...' : 'Updating...'
  return isNewPlaylist?.value ? 'Create' : 'Update'
})

function onUpdate() {
  if (!canUpdate.value || updateBusy.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonPrimary')
  editor?.requestUpdate('footer')
}

function onCancelUpdate() {
  if (editor?.playlistManageBusy.value) {
    playEvent('disabled')
    return
  }
  playEvent('select')
  if (editor?.playlistManagePrompt.value) {
    editor.cancelPlaylistManage()
    return
  }
  editor?.cancelUpdatePrompt()
}

function onReset() {
  if (!canReset.value || updateBusy.value) {
    playEvent('disabled')
    return
  }
  editor?.cancelUpdatePrompt()
  playEvent('resetPlaylist')
  editor?.resetChanges()
}
</script>

<template>
  <div class="panel-footer-shell relative w-full min-w-0 flex-1 overflow-hidden">
    <div class="panel-footer-content flex flex-col gap-2 px-3 sm:px-4 py-[0.375rem] sm:py-[0.4375rem]">
      <p
        v-if="footerHint"
        class="w-full type-body text-maru-black text-pretty"
        role="alert"
      >
        {{ footerHint }}
      </p>
      <div class="w-full flex items-center gap-2 sm:gap-3 min-w-0">
        <PlaylistCapacityMeters />
        <div class="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
          <template v-if="askingUpdatePrompt || askingManagePrompt">
            <button
              type="button"
              class="panel-footer-btn panel-footer-btn--short panel-footer-btn--secondary shrink-0"
              :disabled="overlayBusy"
              @click="onCancelUpdate"
            >
              <span class="panel-footer-btn__label">Cancel</span>
            </button>
          </template>
          <template v-else>
            <button
              type="button"
              class="panel-footer-btn panel-footer-btn--short panel-footer-btn--secondary shrink-0"
              :aria-disabled="!canReset || updateBusy"
              :tabindex="canReset && !updateBusy ? 0 : -1"
              @click="onReset"
            >
              <span class="panel-footer-btn__label">Reset</span>
            </button>
            <button
              type="button"
              class="panel-footer-btn panel-footer-btn--short panel-footer-btn--primary shrink-0"
              :aria-disabled="!canUpdate || updateBusy"
              :tabindex="canUpdate && !updateBusy ? 0 : -1"
              @click="onUpdate"
            >
              <span class="panel-footer-btn__label">{{ primaryLabel }}</span>
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
