<script setup lang="ts">
import TrackArtDrawTab from './TrackArtDrawTab.vue'
import TrackArtIconsTab from './TrackArtIconsTab.vue'
import type { TrackArtTab } from './types'
import { resolveTrackIcon } from '#shared/myo-editor/trackArt'
import type { PlaylistTrack } from '~/components/playlist/types'
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { TRACK_ART_EDITOR_KEY } from '~/composables/useTrackArtEditor'

type Phase = 'idle' | 'entering' | 'open' | 'exiting'

const APPLY_SUCCESS_POP_MS = 220
const LED_CROSSFADE_MS = 160
const TABS: TrackArtTab[] = ['icons', 'draw']

const open = defineModel<boolean>('open', { default: false })
const trackId = defineModel<string | null>('trackId', { default: null })

const editor = inject(MYO_EDITOR_KEY)
const artShell = inject(TRACK_ART_EDITOR_KEY, null)
const { playEvent } = useUiSound()
const { showError } = useMobileToast()

const phase = ref<Phase>('idle')
const tab = ref<TrackArtTab>('icons')
const prefersReducedMotion = ref(false)
const isPhoneLayout = ref(false)
const applying = ref(false)
const ledPopping = ref(false)
const purposeId = 'track-art-editor-purpose'
const headingId = 'track-art-editor-heading'
const iconsTabId = 'track-art-tab-icons'
const drawTabId = 'track-art-tab-draw'
const iconsPanelId = 'track-art-panel-icons'
const drawPanelId = 'track-art-panel-draw'
const applyHintId = 'track-art-apply-hint'
const drawHintsId = 'track-art-draw-hints'
let timers: ReturnType<typeof setTimeout>[] = []
let phoneMq: MediaQueryList | null = null
let reducedMq: MediaQueryList | null = null

const windowRef = ref<HTMLElement | null>(null)
const iconsTabBtnRef = ref<HTMLButtonElement | null>(null)
const drawTabBtnRef = ref<HTMLButtonElement | null>(null)

/** Dual-layer LED preview for crossfade. */
const ledCurrUrl = ref<string | null>(null)
const ledPrevUrl = ref<string | null>(null)
const ledFading = ref(false)
/** Skip fade on first paint after open. */
let ledSkipNextFade = true

function openDurationMs() {
  if (prefersReducedMotion.value) return 40
  return isPhoneLayout.value ? 320 : 280
}

function closeDurationMs() {
  if (prefersReducedMotion.value) return 40
  return isPhoneLayout.value ? 260 : 180
}

const iconsTabRef = ref<InstanceType<typeof TrackArtIconsTab> | null>(null)
const drawTabRef = ref<InstanceType<typeof TrackArtDrawTab> | null>(null)
const iconsPreviewUrl = ref<string | null>(null)
/** `undefined` = not started; `null` = blank screen; string = live drawing. */
const drawPreviewUrl = ref<string | null | undefined>(undefined)

const visible = computed(
  () => phase.value === 'entering' || phase.value === 'open' || phase.value === 'exiting',
)
const interactive = computed(
  () => phase.value === 'open' && !applying.value && !ledPopping.value,
)

const track = computed<PlaylistTrack | null>(() => {
  if (!editor || !trackId.value) return null
  return editor.playlist.value.find(t => t.id === trackId.value) ?? null
})

const initialPreviewUrl = computed(() => {
  if (!track.value) return null
  return resolveTrackIcon(track.value).previewUrl
})

const headerPreviewUrl = computed(() => {
  if (tab.value === 'draw') {
    if (drawPreviewUrl.value === undefined) return initialPreviewUrl.value
    return drawPreviewUrl.value
  }
  return iconsPreviewUrl.value ?? initialPreviewUrl.value
})

/** Icon bank pick wins; otherwise seed from the track’s saved art. */
const drawSeedUrl = computed(() => iconsPreviewUrl.value ?? initialPreviewUrl.value)

const canApply = computed(() => {
  if (tab.value === 'icons') return Boolean(iconsPreviewUrl.value)
  return typeof drawPreviewUrl.value === 'string'
})

const applyDisabled = computed(() => !interactive.value || !canApply.value)

const applyHint = computed(() => {
  if (canApply.value) return ''
  return tab.value === 'icons' ? 'Pick an icon first' : 'Draw something first'
})

const rootClass = computed(() => ({
  'track-art-modal': true,
  'track-art-modal--entering': phase.value === 'entering',
  'track-art-modal--open': phase.value === 'open',
  'track-art-modal--exiting': phase.value === 'exiting',
  'track-art-modal--reduced': prefersReducedMotion.value,
  'track-art-modal--tab-icons': tab.value === 'icons',
  'track-art-modal--tab-draw': tab.value === 'draw',
  'track-art-modal--led-pop': ledPopping.value,
}))

function clearTimers() {
  for (const t of timers) clearTimeout(t)
  timers = []
}

function after(ms: number, fn: () => void) {
  timers.push(setTimeout(fn, ms))
}

function resetLedPreview() {
  ledCurrUrl.value = null
  ledPrevUrl.value = null
  ledFading.value = false
  ledSkipNextFade = true
}

function focusablesInWindow(): HTMLElement[] {
  const root = windowRef.value
  if (!root) return []
  const nodes = root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )
  return [...nodes].filter((el) => {
    if (el.closest('[hidden]')) return false
    if (el.getAttribute('aria-hidden') === 'true') return false
    return el.offsetParent !== null || el === document.activeElement
  })
}

function moveFocusIntoDialog() {
  nextTick(() => {
    const tabBtn = tab.value === 'icons' ? iconsTabBtnRef.value : drawTabBtnRef.value
    ;(tabBtn ?? focusablesInWindow()[0])?.focus()
  })
}

function restoreOpenerFocus() {
  artShell?.restoreFocus()
}

function beginOpen() {
  clearTimers()
  tab.value = 'icons'
  applying.value = false
  ledPopping.value = false
  iconsPreviewUrl.value = null
  drawPreviewUrl.value = undefined
  ledPrevUrl.value = null
  ledFading.value = false
  ledCurrUrl.value = null
  ledSkipNextFade = true
  phase.value = 'entering'
  playEvent('toggleOn')
  nextTick(() => {
    if (!ledSkipNextFade) return
    ledCurrUrl.value = headerPreviewUrl.value
    ledSkipNextFade = false
  })
  after(openDurationMs(), () => {
    if (phase.value === 'entering') phase.value = 'open'
  })
}

function beginClose(options?: { skipLedPop?: boolean }) {
  if (phase.value !== 'open' && phase.value !== 'entering') return
  if (applying.value) return
  if (ledPopping.value) {
    if (!options?.skipLedPop) return
    ledPopping.value = false
  }
  clearTimers()
  phase.value = 'exiting'
  playEvent('buttonClick')
  after(closeDurationMs(), () => {
    phase.value = 'idle'
    open.value = false
    trackId.value = null
    resetLedPreview()
    restoreOpenerFocus()
  })
}

function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (applying.value) return
  if (phase.value === 'entering' || phase.value === 'open' || ledPopping.value) {
    event.preventDefault()
    beginClose({ skipLedPop: true })
  }
}

function onWindowKeydown(event: KeyboardEvent) {
  if (!interactive.value) return

  if (event.key === 'Tab') {
    const items = focusablesInWindow()
    if (items.length < 1) return
    const first = items[0]!
    const last = items[items.length - 1]!
    const active = document.activeElement as HTMLElement | null
    if (event.shiftKey) {
      if (active === first || !windowRef.value?.contains(active)) {
        event.preventDefault()
        last.focus()
      }
    }
    else if (active === last) {
      event.preventDefault()
      first.focus()
    }
    return
  }

  const tablist = (event.target as HTMLElement | null)?.closest('[role="tablist"]')
  if (!tablist || !windowRef.value?.contains(tablist)) return

  const idx = TABS.indexOf(tab.value)
  if (idx < 0) return

  let next = -1
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (idx + 1) % TABS.length
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (idx - 1 + TABS.length) % TABS.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = TABS.length - 1
  else return

  event.preventDefault()
  setTab(TABS[next]!, { focusTab: true })
}

function setTab(next: TrackArtTab, options?: { focusTab?: boolean }) {
  if (!interactive.value || tab.value === next) {
    if (options?.focusTab) {
      ;(next === 'icons' ? iconsTabBtnRef.value : drawTabBtnRef.value)?.focus()
    }
    return
  }
  tab.value = next
  playEvent('buttonClick')
  if (options?.focusTab) {
    nextTick(() => {
      ;(next === 'icons' ? iconsTabBtnRef.value : drawTabBtnRef.value)?.focus()
    })
  }
}

function onIconsPreview(url: string | null) {
  iconsPreviewUrl.value = url
}

function onDrawPreview(url: string | null) {
  drawPreviewUrl.value = url
}

function onApplied(payload: { icon16x16: string; previewUrl: string }) {
  if (!editor || !trackId.value) return
  const id = trackId.value
  playEvent('saveComplete')
  applying.value = false

  const finish = () => {
    ledPopping.value = false
    beginClose()
    void editor.persistTrackArt(id, payload.icon16x16, payload.previewUrl).then((result) => {
      if (result.error) showError(result.error)
    })
  }

  if (prefersReducedMotion.value) {
    finish()
    return
  }

  ledSkipNextFade = true
  ledCurrUrl.value = payload.previewUrl
  ledPrevUrl.value = null
  ledFading.value = false
  ledPopping.value = true
  after(APPLY_SUCCESS_POP_MS, finish)
}

async function onApply() {
  if (applyDisabled.value) return
  applying.value = true
  playEvent('buttonPrimary')
  try {
    if (tab.value === 'icons') {
      await iconsTabRef.value?.applySelected()
    }
    else {
      await drawTabRef.value?.applyDrawing()
    }
  }
  finally {
    if (phase.value === 'open' && !ledPopping.value) applying.value = false
  }
}

watch(headerPreviewUrl, (next) => {
  if (next === ledCurrUrl.value && !ledPrevUrl.value) return

  if (prefersReducedMotion.value || ledSkipNextFade || !ledCurrUrl.value) {
    ledCurrUrl.value = next
    ledPrevUrl.value = null
    ledFading.value = false
    ledSkipNextFade = false
    return
  }

  ledPrevUrl.value = ledCurrUrl.value
  ledCurrUrl.value = next
  ledFading.value = true
  after(LED_CROSSFADE_MS, () => {
    ledPrevUrl.value = null
    ledFading.value = false
  })
})

watch(open, (isOpen) => {
  if (isOpen) {
    if (phase.value === 'idle') beginOpen()
    return
  }
  if (phase.value === 'open' || phase.value === 'entering') beginClose({ skipLedPop: true })
})

watch(phase, (next) => {
  if (next === 'open') moveFocusIntoDialog()
})

function syncPhoneLayout() {
  isPhoneLayout.value = phoneMq?.matches ?? false
}

function syncReducedMotion() {
  prefersReducedMotion.value = reducedMq?.matches ?? false
}

onMounted(() => {
  phoneMq = window.matchMedia('(max-width: 599px)')
  reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncPhoneLayout()
  syncReducedMotion()
  phoneMq.addEventListener('change', syncPhoneLayout)
  reducedMq.addEventListener('change', syncReducedMotion)
  window.addEventListener('keydown', onEscape)
})

onUnmounted(() => {
  clearTimers()
  phoneMq?.removeEventListener('change', syncPhoneLayout)
  reducedMq?.removeEventListener('change', syncReducedMotion)
  window.removeEventListener('keydown', onEscape)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      :class="rootClass"
      role="presentation"
    >
      <div
        class="track-art-modal__backdrop"
        aria-hidden="true"
        @click="interactive && beginClose()"
      />

      <div
        ref="windowRef"
        class="track-art-modal__window border-maru rounded-maru bg-maru-white"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${purposeId} ${headingId}`"
        @keydown="onWindowKeydown"
      >
        <header class="track-art-modal__header">
          <div class="track-art-modal__header-bar">
            <div
              class="track-art-modal__yoto"
              aria-hidden="true"
            >
              <img
                src="/images/yoto-on.svg"
                alt=""
                class="track-art-modal__yoto-frame"
                draggable="false"
              >
              <div class="track-art-modal__yoto-screen">
                <img
                  v-if="ledPrevUrl"
                  :src="ledPrevUrl"
                  alt=""
                  class="track-art-modal__yoto-icon track-art-modal__yoto-icon--back"
                  draggable="false"
                >
                <img
                  v-if="ledCurrUrl"
                  :src="ledCurrUrl"
                  alt=""
                  class="track-art-modal__yoto-icon"
                  :class="{ 'track-art-modal__yoto-icon--fade-in': ledFading }"
                  draggable="false"
                >
              </div>
            </div>
            <div class="track-art-modal__header-copy">
              <p
                :id="purposeId"
                class="track-art-modal__subtitle type-caption text-maru-black"
              >
                Track art
              </p>
              <div class="track-art-modal__title-row">
                <h2
                  :id="headingId"
                  class="track-art-modal__track-heading"
                >
                  {{ track?.title ?? 'Track' }}
                </h2>
              </div>
            </div>
            <button
              type="button"
              class="track-art-modal__close"
              :disabled="!interactive"
              aria-label="Close"
              @click="beginClose()"
            >
              <span
                class="track-art-modal__close-x"
                aria-hidden="true"
              />
            </button>
          </div>
          <div
            class="track-art-modal__tabs"
            role="tablist"
            aria-label="Art editor"
          >
            <button
              :id="iconsTabId"
              ref="iconsTabBtnRef"
              type="button"
              role="tab"
              class="track-art-modal__tab track-art-modal__tab--icons type-empty-title font-maru-bold"
              :class="{ 'track-art-modal__tab--active': tab === 'icons' }"
              :disabled="!interactive"
              :aria-selected="tab === 'icons'"
              :aria-controls="iconsPanelId"
              :tabindex="tab === 'icons' ? 0 : -1"
              @click="setTab('icons')"
            >
              Icons
            </button>
            <button
              :id="drawTabId"
              ref="drawTabBtnRef"
              type="button"
              role="tab"
              class="track-art-modal__tab track-art-modal__tab--draw type-empty-title font-maru-bold"
              :class="{ 'track-art-modal__tab--active': tab === 'draw' }"
              :disabled="!interactive"
              :aria-selected="tab === 'draw'"
              :aria-controls="drawPanelId"
              :tabindex="tab === 'draw' ? 0 : -1"
              @click="setTab('draw')"
            >
              Draw
            </button>
          </div>
        </header>

        <div class="track-art-modal__body">
          <div
            :id="iconsPanelId"
            role="tabpanel"
            class="track-art-modal__pane"
            :class="{ 'track-art-modal__pane--active': tab === 'icons' }"
            :aria-labelledby="iconsTabId"
            :hidden="tab !== 'icons'"
          >
            <TrackArtIconsTab
              ref="iconsTabRef"
              :initial-preview-url="initialPreviewUrl"
              @select="onApplied"
              @preview="onIconsPreview"
            />
          </div>
          <div
            :id="drawPanelId"
            role="tabpanel"
            class="track-art-modal__pane"
            :class="{ 'track-art-modal__pane--active': tab === 'draw' }"
            :aria-labelledby="drawTabId"
            :aria-describedby="drawHintsId"
            :hidden="tab !== 'draw'"
          >
            <p
              :id="drawHintsId"
              class="track-art-modal__sr-only"
            >
              Undo with Control+Z or Command+Z. Redo with Control+Shift+Z or Command+Shift+Z.
            </p>
            <TrackArtDrawTab
              ref="drawTabRef"
              :active="tab === 'draw' && phase === 'open'"
              :seed-preview-url="drawSeedUrl"
              @select="onApplied"
              @preview="onDrawPreview"
            />
          </div>
        </div>

        <footer class="track-art-modal__footer">
          <p
            :id="applyHintId"
            class="track-art-modal__sr-only"
            aria-live="polite"
          >
            {{ applyHint }}
          </p>
          <div class="track-art-modal__footer-actions">
            <button
              type="button"
              class="track-art-modal__cancel"
              :disabled="!interactive"
              @click="beginClose()"
            >
              Cancel
            </button>
            <button
              type="button"
              class="track-art-modal__apply"
              :disabled="applyDisabled"
              :aria-describedby="applyDisabled && applyHint ? applyHintId : undefined"
              @click="onApply"
            >
              {{ applying ? 'Applying…' : 'Apply' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
