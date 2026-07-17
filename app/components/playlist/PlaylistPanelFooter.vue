<script setup lang="ts">
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { useSaveProgressTestMode } from '~/components/playlist/saveProgressTestFixture'
import PlaylistCapacityMeters from '~/components/playlist/PlaylistCapacityMeters.vue'
import {
  getPlaylistCapacitySnapshot,
  YOTO_MYO_TRACK_COUNT_MESSAGE,
} from '#shared/myo-editor/yotoMyoLimits'

const editor = inject(MYO_EDITOR_KEY, null)
const { playEvent } = useUiSound()

const saveProgressTestMode = useSaveProgressTestMode()

const isDirty = editor?.isDirty
const loading = editor?.loading
const isPlaylistLocked = editor?.isPlaylistLocked
const selectedCardId = editor?.selectedCardId
const isPodcast = editor?.isPodcast
const errorMessage = editor?.errorMessage
const playlist = editor?.playlist

const showCapacityConfirm = ref(false)

const capacity = computed(() => getPlaylistCapacitySnapshot(playlist?.value ?? []))

/** Same threshold as capacity meter red: at or over 100%. */
const overCapacity = computed(() => {
  const { trackCount, trackMax, knownDurationSeconds, durationMax } = capacity.value
  const overTracks = trackMax > 0 && trackCount / trackMax >= 1
  const overTime = durationMax > 0 && knownDurationSeconds / durationMax >= 1
  return overTracks || overTime
})

const overTrackLimit = computed(
  () => capacity.value.trackCount > capacity.value.trackMax,
)

const footerHint = computed(() => {
  if (isPodcast?.value) return 'Podcast cards cannot be edited yet.'
  if (errorMessage?.value) return errorMessage.value
  if (overTrackLimit.value) return YOTO_MYO_TRACK_COUNT_MESSAGE
  return ''
})

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

function closeCapacityConfirm() {
  showCapacityConfirm.value = false
}

function onUpdate() {
  if (!canUpdate.value) {
    playEvent('disabled')
    return
  }

  if (overCapacity.value) {
    playEvent('buttonPrimary')
    showCapacityConfirm.value = true
    return
  }

  playEvent('buttonPrimary')
  void editor?.updateCard()
}

function onConfirmRiskyUpdate() {
  if (!canUpdate.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonPrimary')
  closeCapacityConfirm()
  void editor?.updateCard({ acknowledgeCapacityRisk: true })
}

function onCancelRiskyUpdate() {
  playEvent('resetPlaylist')
  closeCapacityConfirm()
}

function onReset() {
  if (!canReset.value) {
    playEvent('disabled')
    return
  }
  closeCapacityConfirm()
  playEvent('resetPlaylist')
  editor?.resetChanges()
}

watch(
  () => [
    overCapacity.value,
    canUpdate.value,
    isPlaylistLocked?.value,
    saveProgressTestMode.value,
  ],
  () => {
    if (!overCapacity.value || !canUpdate.value || isPlaylistLocked?.value || saveProgressTestMode.value) {
      closeCapacityConfirm()
    }
  },
)
</script>

<template>
  <div class="panel-footer-shell relative w-full min-w-0 flex-1 overflow-hidden">
    <div class="panel-footer-content flex flex-col gap-2 px-3 sm:px-4 py-[0.375rem] sm:py-[0.4375rem]">
      <p
        v-if="footerHint"
        class="w-full text-[1.25rem] sm:text-[1.45rem] font-maru-mono text-maru-black leading-tight text-pretty"
        role="alert"
      >
        {{ footerHint }}
      </p>
      <div class="w-full flex items-center gap-2 sm:gap-3 min-w-0">
        <PlaylistCapacityMeters />
        <div class="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            class="panel-footer-btn panel-footer-btn--short panel-footer-btn--secondary shrink-0"
            :aria-disabled="!canReset"
            :tabindex="canReset ? 0 : -1"
            @click="onReset"
          >
            <span class="panel-footer-btn__label">Reset</span>
          </button>
          <button
            type="button"
            class="panel-footer-btn panel-footer-btn--short panel-footer-btn--primary shrink-0"
            :aria-disabled="!canUpdate"
            :tabindex="canUpdate ? 0 : -1"
            @click="onUpdate"
          >
            <span class="panel-footer-btn__label">{{ isPlaylistLocked?.value || saveProgressTestMode ? 'Updating...' : 'Update' }}</span>
          </button>
        </div>
      </div>
    </div>

    <div
      class="footer-capacity-confirm"
      :class="{ 'footer-capacity-confirm--open': showCapacityConfirm }"
      role="dialog"
      aria-modal="true"
      aria-labelledby="footer-capacity-confirm-title"
      :aria-hidden="showCapacityConfirm ? undefined : 'true'"
      :inert="showCapacityConfirm ? undefined : true"
    >
      <p
        id="footer-capacity-confirm-title"
        class="footer-capacity-confirm__copy font-maru-mono text-pretty"
      >
        Over MYO limit — update may fail.
      </p>
      <div class="footer-capacity-confirm__actions">
        <button
          type="button"
          class="panel-footer-btn panel-footer-btn--short panel-footer-btn--secondary shrink-0"
          @click="onCancelRiskyUpdate"
        >
          <span class="panel-footer-btn__label">Cancel</span>
        </button>
        <button
          type="button"
          class="panel-footer-btn panel-footer-btn--short panel-footer-btn--primary shrink-0"
          @click="onConfirmRiskyUpdate"
        >
          <span class="panel-footer-btn__label">Update anyway</span>
        </button>
      </div>
    </div>
  </div>
</template>
