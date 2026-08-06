<script setup lang="ts">
const props = withDefaults(defineProps<{
  /** Tooltip body text. */
  text: string
  /** Prefer `top` near screen edges / footers. */
  placement?: 'top' | 'bottom'
}>(), {
  placement: 'top',
})

const open = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const bubbleStyle = ref<Record<string, string>>({})
const tooltipId = useId()

function updatePosition() {
  const el = triggerRef.value
  if (!el || !open.value) return

  const rect = el.getBoundingClientRect()
  const gap = 8
  const margin = 12
  const vw = window.innerWidth
  // Prefer a wide bubble on narrow screens; keep a soft cap on desktop.
  const maxBubble = Math.min(22 * 16, vw - margin * 2)
  const triggerCenter = rect.left + rect.width / 2
  // Clamp so a max-width bubble centered on `left` stays on-screen.
  const half = maxBubble / 2
  const minCenter = margin + half
  const maxCenter = vw - margin - half
  const left = minCenter >= maxCenter
    ? vw / 2
    : Math.min(maxCenter, Math.max(minCenter, triggerCenter))

  const base: Record<string, string> = {
    left: `${left}px`,
    maxWidth: `${maxBubble}px`,
    width: 'max-content',
  }

  if (props.placement === 'bottom') {
    bubbleStyle.value = {
      ...base,
      top: `${rect.bottom + gap}px`,
      transform: 'translateX(-50%)',
    }
    return
  }

  bubbleStyle.value = {
    ...base,
    top: `${rect.top - gap}px`,
    transform: 'translate(-50%, -100%)',
  }
}

function show() {
  if (!props.text.trim()) return
  open.value = true
  nextTick(updatePosition)
}

function hide() {
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') hide()
}

function onViewportChange() {
  if (open.value) updatePosition()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
})
</script>

<template>
  <span
    ref="triggerRef"
    class="maru-tooltip"
    @pointerenter="show"
    @pointerleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <span
      class="maru-tooltip__trigger"
      :aria-describedby="open ? tooltipId : undefined"
    >
      <slot />
    </span>

    <Teleport to="body">
      <div
        v-show="open"
        :id="tooltipId"
        role="tooltip"
        class="maru-tooltip__bubble font-maru-mono"
        :class="`maru-tooltip__bubble--${placement}`"
        :style="bubbleStyle"
      >
        {{ text }}
      </div>
    </Teleport>
  </span>
</template>
