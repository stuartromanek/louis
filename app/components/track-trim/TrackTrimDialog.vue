<script setup lang="ts">
import TrackTrimPanel from './TrackTrimPanel.vue'
import { useTrimPreviewPlayer } from './useTrimPreviewPlayer'
import Tray from '~/components/ui/Tray.vue'
import AppFlyout from '~/components/layout/AppFlyout.vue'
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { TRACK_TRIM_EDITOR_KEY } from '~/composables/useTrackTrimEditor'
import type { PlaylistTrack } from '~/components/playlist/types'
import {
  canTrimTrack,
  clampTrim,
  isTrimmed,
  previewOffsetSeconds,
  resolveTrim,
  youtubeIdForTrack,
} from '#shared/myo-editor/trackTrim'
import { splitGroupSourceTitle, splitSourceDuration } from '#shared/myo-editor/splitTrack'

const PLACEHOLDER_PEAKS = Array.from({ length: 200 }, () => 0.35)

const open = defineModel<boolean>('open', { default: false })
const trackId = defineModel<string | null>('trackId', { default: null })

const editor = inject(MYO_EDITOR_KEY)
const trimShell = inject(TRACK_TRIM_EDITOR_KEY, null)
const { playEvent } = useUiSound()

const isPhoneLayout = ref(false)
const headingId = 'track-trim-heading'

const trimStart = ref(0)
const trimEnd = ref(0)
const localDuration = ref(0)
const peaks = ref<number[]>(PLACEHOLDER_PEAKS)
const peaksLoading = ref(false)

let phoneMq: MediaQueryList | null = null
let peaksAbort: AbortController | null = null

const TRACK_TRIM_HEADING_MAX = 38

function capTrackTrimHeading(text: string) {
  if (text.length <= TRACK_TRIM_HEADING_MAX) return text
  return `${text.slice(0, TRACK_TRIM_HEADING_MAX - 1).trimEnd()}…`
}

const track = computed<PlaylistTrack | null>(() => {
  if (!editor || !trackId.value) return null
  return editor.playlist.value.find(item => item.id === trackId.value) ?? null
})

const headingText = computed(() => (
  capTrackTrimHeading(track.value ? splitGroupSourceTitle(track.value.title) : 'Trim')
))

const youtubeId = computed(() => {
  const current = track.value
  return current ? youtubeIdForTrack(current) ?? null : null
})

const timelineDuration = computed(() => {
  const current = track.value
  if (!current) return 0
  return splitSourceDuration(current, editor?.playlist.value ?? [])
})

const offsetSeconds = computed(() => (track.value ? previewOffsetSeconds(track.value) : 0))

const player = useTrimPreviewPlayer({
  youtubeId,
  offsetSeconds,
  trimStart,
  trimEnd,
})
const {
  isPlaying,
  isLoading,
  error,
  playhead,
} = player

const trayOpen = computed({
  get: () => isPhoneLayout.value && open.value,
  set: (value: boolean) => {
    if (!value) requestClose()
  },
})

function seedFromTrack(next: PlaylistTrack | null) {
  const duration = next ? splitSourceDuration(next, editor?.playlist.value ?? []) : 0
  localDuration.value = duration
  if (!next || duration <= 0) {
    trimStart.value = 0
    trimEnd.value = 0
    return
  }
  const resolved = resolveTrim(next, duration)
  trimStart.value = resolved.startSeconds
  trimEnd.value = resolved.endSeconds
  player.seek(resolved.startSeconds)
}

async function loadPeaks(next: PlaylistTrack) {
  const id = youtubeIdForTrack(next)
  if (!id) {
    peaks.value = PLACEHOLDER_PEAKS
    return
  }
  peaksAbort?.abort()
  peaksAbort = new AbortController()
  const { signal } = peaksAbort
  peaksLoading.value = true
  try {
    const data = await $fetch<{ peaks: number[], duration: number }>(
      `/api/youtube/preview/${id}/peaks`,
      { signal },
    )
    if (signal.aborted) return
    peaks.value = data.peaks
    if (!(localDuration.value > 0) && data.duration > 0) {
      localDuration.value = data.duration
      const resolved = clampTrim(trimStart.value, trimEnd.value || data.duration, data.duration)
      trimStart.value = resolved.startSeconds
      trimEnd.value = resolved.endSeconds
    }
  }
  catch {
    if (signal.aborted) return
    peaks.value = PLACEHOLDER_PEAKS
  }
  finally {
    if (!signal.aborted) peaksLoading.value = false
  }
}

function beginOpen() {
  const next = track.value
  seedFromTrack(next)
  peaks.value = PLACEHOLDER_PEAKS
  if (next && canTrimTrack(next)) void loadPeaks(next)
  playEvent('toggleOn')
}

function finishClose() {
  trackId.value = null
  trimShell?.restoreFocus()
}

function requestClose() {
  if (!open.value) return
  playEvent('buttonClick')
  open.value = false
}

function onTrim() {
  const next = track.value
  if (!next || !editor) return
  const duration = localDuration.value || timelineDuration.value
  const resolved = clampTrim(trimStart.value, trimEnd.value, duration)
  if (isTrimmed({ ...next, trim: resolved }, duration)) {
    editor.setTrackTrim(next.id, resolved)
  }
  else {
    editor.setTrackTrim(next.id, null)
  }
  playEvent('buttonPrimary')
  open.value = false
}

function onPlayToggle() {
  void player.toggle()
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (!open.value) return

  if (event.key !== ' ' && event.code !== 'Space') return
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
  if (isTypingTarget(event.target)) return
  event.preventDefault()
  onPlayToggle()
}

function syncPhoneLayout() {
  isPhoneLayout.value = phoneMq?.matches ?? false
}

watch(open, (value) => {
  if (value) beginOpen()
  else {
    player.pause()
    peaksAbort?.abort()
  }
})

onMounted(() => {
  phoneMq = window.matchMedia('(max-width: 599px)')
  syncPhoneLayout()
  phoneMq.addEventListener('change', syncPhoneLayout)
  window.addEventListener('keydown', onGlobalKeydown, true)
  if (open.value) beginOpen()
})

onUnmounted(() => {
  peaksAbort?.abort()
  phoneMq?.removeEventListener('change', syncPhoneLayout)
  window.removeEventListener('keydown', onGlobalKeydown, true)
})
</script>

<template>
  <Tray
    v-if="isPhoneLayout"
    v-model:open="trayOpen"
    :title="headingText"
    height="auto"
    :play-sounds="false"
    @close="finishClose"
  >
    <div class="track-trim-tray">
      <TrackTrimPanel
        :peaks="peaks"
        :duration="localDuration"
        :trim-start="trimStart"
        :trim-end="trimEnd"
        :playhead="playhead"
        :peaks-loading="peaksLoading"
        :is-playing="isPlaying"
        :is-loading="isLoading"
        :error="error"
        @play="onPlayToggle"
        @cancel="requestClose"
        @trim="onTrim"
        @update:trim-start="trimStart = $event"
        @update:trim-end="trimEnd = $event"
        @update:playhead="player.seek($event)"
      />
    </div>
  </Tray>

  <AppFlyout
    v-if="!isPhoneLayout"
    v-model:open="open"
    :title="headingText"
    :heading-id="headingId"
    heading-tone="green-lighter"
    header-class="bg-maru-orange"
    face-class="bg-maru-green-lighter"
    size="md"
    dismiss-label="Cancel trim"
    body-class="track-trim-flyout__body"
    :pad-body="false"
    @close="requestClose"
    @after-leave="finishClose"
  >
    <TrackTrimPanel
      :peaks="peaks"
      :duration="localDuration"
      :trim-start="trimStart"
      :trim-end="trimEnd"
      :playhead="playhead"
      :peaks-loading="peaksLoading"
      :is-playing="isPlaying"
      :is-loading="isLoading"
      :error="error"
      :show-footer="false"
      @play="onPlayToggle"
      @trim="onTrim"
      @update:trim-start="trimStart = $event"
      @update:trim-end="trimEnd = $event"
      @update:playhead="player.seek($event)"
    />
    <template #footer>
      <button
        type="button"
        class="panel-footer-btn panel-footer-btn--short panel-footer-btn--primary shrink-0"
        @click="onTrim"
      >
        <span class="panel-footer-btn__label">Trim</span>
      </button>
    </template>
  </AppFlyout>
</template>
