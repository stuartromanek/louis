<script setup lang="ts">
import MaruHeading from '~/components/layout/MaruHeading.vue'

type HeadingTone =
  | 'blue'
  | 'white'
  | 'black'
  | 'red'
  | 'green-lighter'
  | 'blue-lighter'
  | 'yellow-light'
  | 'magenta-light'
type FlyoutSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  title?: string
  headingId: string
  headingTone?: HeadingTone
  headerClass?: string
  faceClass?: string
  footerClass?: string
  bodyClass?: string
  size?: FlyoutSize
  zIndex?: number
  dismissLabel?: string
  dismissDisabled?: boolean
  padBody?: boolean
  bodyScroll?: boolean
}>(), {
  title: '',
  headingTone: 'white',
  headerClass: 'bg-maru-yellow',
  faceClass: 'bg-maru-white',
  footerClass: '',
  bodyClass: '',
  size: 'md',
  zIndex: 80,
  dismissLabel: 'Cancel',
  dismissDisabled: false,
  padBody: true,
  bodyScroll: true,
})

const open = defineModel<boolean>('open', { default: false })
const attrs = useAttrs()

const emit = defineEmits<{
  close: []
  afterEnter: []
  afterLeave: []
}>()

const panelRef = ref<HTMLElement | null>(null)
const slots = useSlots()

const hasDefaultHeader = computed(() => Boolean(props.title) && !slots.header)
const yellowFace = computed(() => /\byellow\b/.test(props.faceClass))

const overlayClass = computed(() => [
  'app-flyout',
  `app-flyout--${props.size}`,
  yellowFace.value ? 'app-flyout--yellow' : '',
  attrs.class,
])

const overlayStyle = computed(() => ({
  zIndex: props.zIndex,
  ...(typeof attrs.style === 'object' && attrs.style ? attrs.style : {}),
}))

function requestClose() {
  if (props.dismissDisabled || !open.value) return
  emit('close')
  open.value = false
}

function focusablesInPanel(): HTMLElement[] {
  const root = panelRef.value
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

function onPanelKeydown(event: KeyboardEvent) {
  if (!open.value || event.key !== 'Tab') return
  const items = focusablesInPanel()
  if (items.length < 1) return
  const first = items[0]!
  const last = items[items.length - 1]!
  const active = document.activeElement as HTMLElement | null
  if (event.shiftKey) {
    if (active === first || !panelRef.value?.contains(active)) {
      event.preventDefault()
      last.focus()
    }
    return
  }
  if (active === last) {
    event.preventDefault()
    first.focus()
  }
}

function onEscape(event: KeyboardEvent) {
  if (!open.value || event.key !== 'Escape') return
  if (props.dismissDisabled) return
  event.preventDefault()
  requestClose()
}

onMounted(() => {
  window.addEventListener('keydown', onEscape)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onEscape)
})

defineExpose({ panelRef })
</script>

<template>
  <Teleport to="body">
    <Transition
      name="app-flyout"
      @after-enter="emit('afterEnter')"
      @after-leave="emit('afterLeave')"
    >
      <div
        v-if="open"
        :class="overlayClass"
        :style="overlayStyle"
        role="presentation"
      >
        <button
          type="button"
          class="app-flyout__backdrop"
          :aria-label="dismissLabel"
          :disabled="dismissDisabled"
          @click="requestClose"
        />
        <div
          ref="panelRef"
          class="app-flyout__panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="headingId"
          @keydown="onPanelKeydown"
        >
          <button
            type="button"
            class="toast__dismiss"
            :aria-label="dismissLabel"
            :disabled="dismissDisabled"
            @click="requestClose"
          >
            <span
              class="toast__dismiss-mark"
              aria-hidden="true"
            >×</span>
          </button>
          <div
            class="app-flyout__face border-maru"
            :class="faceClass"
          >
            <slot name="header">
              <header
                v-if="hasDefaultHeader"
                class="app-flyout__header app-panel__header border-maru-bottom shrink-0 flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3"
                :class="headerClass"
              >
                <MaruHeading
                  :id="headingId"
                  :text="title"
                  :tone="headingTone"
                  size="sm"
                />
              </header>
            </slot>
            <div
              class="app-flyout__body"
              :class="[
                bodyClass,
                padBody ? 'app-flyout__body--pad' : '',
                bodyScroll ? 'app-flyout__body--scroll' : 'app-flyout__body--flush',
              ]"
            >
              <slot />
            </div>
            <footer
              v-if="$slots.footer"
              class="app-flyout__footer panel-footer-lip border-maru-top shrink-0 relative flex items-center w-full overflow-hidden p-0 text-maru-black"
              :class="footerClass || headerClass"
            >
              <div class="panel-footer-shell relative w-full min-w-0 flex-1 overflow-hidden">
                <div class="app-flyout__footer-content flex items-center gap-2 sm:gap-3 w-full min-w-0 px-3 sm:px-4 py-[0.375rem] sm:py-[0.4375rem]">
                  <slot name="footer" />
                </div>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
