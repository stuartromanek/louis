<script setup lang="ts">
/**
 * House mobile tray — half-viewport bottom sheet with green dim.
 * Reusable shell: pass open + slot content. Optional title.
 *
 * Enter must paint a closed frame first (preenter), then flip to
 * entering — otherwise v-if mounts already "open" and CSS transitions skip.
 * Slide is driven by WAAPI translateY with a pixel-locked height so the
 * sheet can't flash at the dock mid-enter.
 */

type Phase = 'idle' | 'preenter' | 'entering' | 'open' | 'exiting'

const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(defineProps<{
  title?: string
  labelledBy?: string
  ariaLabel?: string
  /** Tray panel height (CSS length). Default ~half viewport. */
  height?: string
  /** Sheet docks to bottom (default) or top of the viewport. */
  placement?: 'bottom' | 'top'
  /** Compact toast: shorter motion, optional backdrop. */
  variant?: 'sheet' | 'toast'
  showBackdrop?: boolean
  closeOnBackdrop?: boolean
  /** When false, Escape / backdrop cannot dismiss (blocking gates). */
  dismissible?: boolean
  /** Play open/close UI sounds. */
  playSounds?: boolean
  role?: string
}>(), {
  height: '50svh',
  placement: 'bottom',
  variant: 'sheet',
  showBackdrop: true,
  closeOnBackdrop: true,
  dismissible: true,
  playSounds: true,
  role: 'dialog',
})

const emit = defineEmits<{
  close: []
}>()

const { playEvent } = useUiSound()

const phase = ref<Phase>('idle')
const prefersReducedMotion = ref(false)
const titleId = useId()
/** Pixel-locked sheet box for the open cycle (height + bottom dock). */
const sheetBoxStyle = ref<Record<string, string> | null>(null)
/** Slide distance (px) for the current open cycle. */
const slideYPx = ref(0)
const sheetEl = ref<HTMLElement | null>(null)
let sheetAnim: Animation | null = null
let timers: ReturnType<typeof setTimeout>[] = []
let rafIds: number[] = []

const visible = computed(
  () => phase.value === 'preenter'
    || phase.value === 'entering'
    || phase.value === 'open'
    || phase.value === 'exiting',
)

const interactive = computed(
  () => phase.value === 'open' || phase.value === 'entering',
)

const resolvedLabelledBy = computed(() => {
  if (props.labelledBy) return props.labelledBy
  if (props.title) return titleId
  return undefined
})

const rootClass = computed(() => ({
  'mobile-tray': true,
  'mobile-tray--preenter': phase.value === 'preenter',
  'mobile-tray--entering': phase.value === 'entering',
  'mobile-tray--open': phase.value === 'open',
  'mobile-tray--exiting': phase.value === 'exiting',
  'mobile-tray--reduced': prefersReducedMotion.value,
  'mobile-tray--top': props.placement === 'top',
  'mobile-tray--toast': props.variant === 'toast',
}))

function clearTimers() {
  for (const t of timers) clearTimeout(t)
  timers = []
  for (const id of rafIds) cancelAnimationFrame(id)
  rafIds = []
  if (sheetAnim) {
    try { sheetAnim.cancel() } catch { /* already finished */ }
    sheetAnim = null
  }
}

function after(ms: number, fn: () => void) {
  timers.push(setTimeout(fn, ms))
}

function afterPaint(fn: () => void) {
  const id1 = requestAnimationFrame(() => {
    const id2 = requestAnimationFrame(() => {
      fn()
    })
    rafIds.push(id2)
  })
  rafIds.push(id1)
}

function viewHeightPx() {
  return window.visualViewport?.height ?? window.innerHeight
}

function edgeGapPx() {
  // Matches --tray-edge-gap (0.65rem) + offscreen pad (1.75rem).
  const rootFs = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  return {
    edge: 0.65 * rootFs,
    pad: 1.75 * rootFs,
  }
}

/** Freeze sheet height at the bottom dock; park/rest via translateY. */
function applySheetBox(opts: {
  height: string
  maxHeight: string
  edge: number
  slideY: number
  parked: boolean
}) {
  const sign = props.placement === 'top' ? -1 : 1
  slideYPx.value = opts.slideY
  const transform = opts.parked
    ? `translate3d(0, ${sign * opts.slideY}px, 0)`
    : 'translate3d(0, 0, 0)'

  if (props.placement === 'top') {
    sheetBoxStyle.value = {
      height: opts.height,
      maxHeight: opts.maxHeight,
      top: `${opts.edge}px`,
      bottom: 'auto',
      transform,
    }
  }
  else {
    sheetBoxStyle.value = {
      height: opts.height,
      maxHeight: opts.maxHeight,
      top: 'auto',
      bottom: `${opts.edge}px`,
      transform,
    }
  }
}

function lockSheetBox(measuredHeight?: number, parked = true) {
  if (typeof window === 'undefined') {
    sheetBoxStyle.value = null
    return
  }

  const viewH = viewHeightPx()
  const { edge, pad } = edgeGapPx()
  const maxSheet = Math.max(160, Math.floor(viewH - edge * 2))
  const edgePx = Math.round(edge)

  if (props.height === 'auto') {
    const h = Math.min(
      measuredHeight && measuredHeight > 0 ? measuredHeight : maxSheet,
      Math.round(viewH * 0.9),
      maxSheet,
    )
    applySheetBox({
      height: 'auto',
      maxHeight: `${Math.round(viewH * 0.9)}px`,
      edge: edgePx,
      slideY: Math.round(h + pad),
      parked,
    })
    return
  }

  const raw = props.height.trim()
  const vhMatch = /^([\d.]+)(d|s)?vh$/i.exec(raw)
  let px: number

  if (vhMatch) {
    const pct = Number.parseFloat(vhMatch[1]!)
    const target = Math.round((pct / 100) * viewH)
    px = Math.max(160, Math.min(target, maxSheet))
  }
  else if (measuredHeight && measuredHeight > 0) {
    px = Math.min(Math.round(measuredHeight), maxSheet)
  }
  else {
    px = measuredHeight && measuredHeight > 0
      ? Math.min(Math.round(measuredHeight), maxSheet)
      : maxSheet
    applySheetBox({
      height: raw,
      maxHeight: raw,
      edge: edgePx,
      slideY: Math.round(px + pad),
      parked,
    })
    return
  }

  if (measuredHeight && measuredHeight > 0) {
    px = Math.min(Math.round(measuredHeight), maxSheet)
  }

  applySheetBox({
    height: `${px}px`,
    maxHeight: `${px}px`,
    edge: edgePx,
    slideY: Math.round(px + pad),
    parked,
  })
}

function parkedTransform() {
  const sign = props.placement === 'top' ? -1 : 1
  return `translate3d(0, ${sign * slideYPx.value}px, 0)`
}

function runSlideAnimation(direction: 'in' | 'out'): Promise<void> {
  const el = sheetEl.value
  if (!el) return Promise.resolve()

  const from = direction === 'in' ? parkedTransform() : 'translate3d(0, 0, 0)'
  const to = direction === 'in' ? 'translate3d(0, 0, 0)' : parkedTransform()
  const duration = prefersReducedMotion.value
    ? 0
    : (direction === 'in' ? 320 : 220)

  el.style.transition = 'none'
  el.style.transform = from
  void el.offsetWidth

  if (sheetAnim) {
    try { sheetAnim.cancel() } catch { /* ignore */ }
    sheetAnim = null
  }

  const anim = el.animate(
    [{ transform: from }, { transform: to }],
    {
      duration,
      easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
      fill: 'forwards',
    },
  )
  sheetAnim = anim

  return anim.finished.then(() => {
    el.style.transform = to
    // Keep Vue :style in sync — otherwise a re-render re-applies parked transform.
    if (sheetBoxStyle.value) {
      sheetBoxStyle.value = {
        ...sheetBoxStyle.value,
        transform: to,
      }
    }
    try { anim.cancel() } catch { /* ignore */ }
    if (sheetAnim === anim) sheetAnim = null
  }).catch(() => {
    /* cancelled */
  })
}

function beginOpen() {
  clearTimers()
  lockSheetBox()
  phase.value = 'preenter'
  if (props.playSounds) playEvent('toggleOn')

  afterPaint(() => {
    if (phase.value !== 'preenter') return
    lockSheetBox(sheetEl.value?.offsetHeight, true)
    afterPaint(() => {
      if (phase.value !== 'preenter') return
      phase.value = 'entering'
      void runSlideAnimation('in')

      // Stay in --entering until stagger finishes (chunk-in is tied to that class).
      const settleMs = props.variant === 'toast'
        ? (prefersReducedMotion.value ? 40 : 420)
        : (prefersReducedMotion.value ? 40 : 1300)
      after(settleMs, () => {
        if (phase.value === 'entering') phase.value = 'open'
      })
    })
  })
}

function beginClose() {
  if (
    phase.value !== 'open'
    && phase.value !== 'entering'
    && phase.value !== 'preenter'
  ) {
    return
  }
  clearTimers()
  phase.value = 'exiting'
  if (props.playSounds) playEvent('buttonClick')

  const exitMs = prefersReducedMotion.value ? 40 : 220
  void runSlideAnimation('out')
  after(exitMs, () => {
    phase.value = 'idle'
    sheetBoxStyle.value = null
    open.value = false
    emit('close')
  })
}

function requestClose() {
  if (!props.dismissible) return
  if (
    phase.value !== 'open'
    && phase.value !== 'entering'
    && phase.value !== 'preenter'
  ) {
    return
  }
  if (open.value) {
    open.value = false
  }
  else {
    beginClose()
  }
}

function onBackdrop() {
  if (!props.dismissible || !props.closeOnBackdrop) return
  // Allow dismiss once the sheet is on-screen (entering or open).
  if (phase.value !== 'open' && phase.value !== 'entering') return
  requestClose()
}

function onEscape(event: KeyboardEvent) {
  if (!props.dismissible) return
  if (event.key !== 'Escape') return
  if (
    phase.value === 'open'
    || phase.value === 'entering'
    || phase.value === 'preenter'
  ) {
    event.preventDefault()
    requestClose()
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    if (phase.value === 'idle') beginOpen()
    return
  }
  if (
    phase.value === 'open'
    || phase.value === 'entering'
    || phase.value === 'preenter'
  ) {
    beginClose()
  }
})

const PHONE_MQ = '(max-width: 599px)'
let phoneMq: MediaQueryList | null = null

function onPhoneBreakpointChange() {
  if (phoneMq && !phoneMq.matches && open.value) {
    open.value = false
  }
}

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.addEventListener('keydown', onEscape)
  phoneMq = window.matchMedia(PHONE_MQ)
  phoneMq.addEventListener('change', onPhoneBreakpointChange)
})

onUnmounted(() => {
  clearTimers()
  window.removeEventListener('keydown', onEscape)
  phoneMq?.removeEventListener('change', onPhoneBreakpointChange)
  phoneMq = null
})

defineExpose({
  close: requestClose,
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      :class="rootClass"
      role="presentation"
    >
      <button
        v-if="showBackdrop"
        type="button"
        class="mobile-tray__backdrop"
        :tabindex="interactive ? 0 : -1"
        aria-label="Close"
        @click="onBackdrop"
      />
      <div
        ref="sheetEl"
        class="mobile-tray__sheet border-maru bg-maru-white"
        :class="{ 'mobile-tray__sheet--auto': height === 'auto' }"
        :style="sheetBoxStyle ?? undefined"
        :role="role"
        :aria-modal="variant === 'toast' ? undefined : 'true'"
        :aria-label="ariaLabel"
        :aria-labelledby="resolvedLabelledBy"
        :aria-hidden="!interactive"
      >
        <div
          class="mobile-tray__handle"
          aria-hidden="true"
        />
        <header
          v-if="title || $slots.header"
          class="mobile-tray__header"
        >
          <slot name="header">
            <h2
              v-if="title"
              :id="titleId"
              class="mobile-tray__title type-body font-maru-medium text-pretty m-0"
            >
              {{ title }}
            </h2>
          </slot>
        </header>
        <div class="mobile-tray__body mobile-tray__stagger">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
