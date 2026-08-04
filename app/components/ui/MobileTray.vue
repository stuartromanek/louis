<script setup lang="ts">
/**
 * House mobile tray — half-viewport bottom sheet with green dim.
 * Reusable shell: pass open + slot content. Optional title.
 *
 * Enter must paint a closed frame first (preenter), then flip to
 * entering — otherwise v-if mounts already "open" and CSS transitions skip.
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
/** Pixel-locked sheet box for the open cycle — avoids dvh/chrome jumps mid-slide. */
const sheetBoxStyle = ref<Record<string, string> | null>(null)
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

/**
 * Freeze sheet height in px from the *current* visual viewport.
 * Mobile chrome often changes dvh mid-enter (URL bar), which makes a
 * %-height sheet shoot too high then snap back to the bottom edge.
 */
function lockSheetBox() {
  if (typeof window === 'undefined') {
    sheetBoxStyle.value = null
    return
  }

  if (props.height === 'auto') {
    sheetBoxStyle.value = {
      height: 'auto',
      maxHeight: '90svh',
    }
    return
  }

  const raw = props.height.trim()
  const viewH = window.visualViewport?.height ?? window.innerHeight
  const vhMatch = /^([\d.]+)(d|s)?vh$/i.exec(raw)
  if (vhMatch) {
    const pct = Number.parseFloat(vhMatch[1]!)
    // Sheet margins (~0.65rem×2) + hard shadow — keep the box on-screen.
    const marginBudget = 28
    const target = Math.round((pct / 100) * viewH)
    const px = Math.max(160, Math.min(target, Math.floor(viewH - marginBudget)))
    sheetBoxStyle.value = {
      height: `${px}px`,
      maxHeight: `${px}px`,
    }
    return
  }

  sheetBoxStyle.value = {
    height: raw,
    maxHeight: raw,
  }
}

function beginOpen() {
  clearTimers()
  // Lock before the closed frame paints so translateY(100%) stays stable.
  lockSheetBox()
  phase.value = 'preenter'
  if (props.playSounds) playEvent('toggleOn')

  afterPaint(() => {
    if (phase.value !== 'preenter') return
    phase.value = 'entering'

    const settleMs = props.variant === 'toast'
      ? (prefersReducedMotion.value ? 40 : 420)
      : (prefersReducedMotion.value ? 40 : 1300)

    // Last delay (~880ms) + chunk duration (420ms); keep --entering until settled.
    after(settleMs, () => {
      if (phase.value === 'entering') phase.value = 'open'
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

  after(prefersReducedMotion.value ? 40 : 220, () => {
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
