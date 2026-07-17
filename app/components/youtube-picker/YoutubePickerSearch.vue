<script setup lang="ts">
const WAVE_PERIOD = 45

const query = defineModel<string>({ required: true })
const containerRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const rulerRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
const measuredTextWidth = ref(0)
const animatedPlaceholder = ref('')

const { playEvent } = useUiSound()

const props = withDefaults(defineProps<{
  label?: string
  placeholders?: string[]
  embedded?: boolean
}>(), {
  label: 'Search for stuff',
  placeholders: () => ['Nakameguro', 'Studio Ghibli', 'lofi hip hop'],
  embedded: false,
})

const emit = defineEmits<{
  submit: []
  clear: []
}>()

/** Visible text the underline should match (typed value, else typewriter placeholder). */
const underlineText = computed(() => query.value || animatedPlaceholder.value)
const underlineChars = computed(() => underlineText.value.length)
const showWave = computed(() => underlineChars.value > 0)
const showClear = computed(() => query.value.trim().length > 0)

const suggestionsStopped = ref(false)
const inputFocused = ref(false)

const useFullInputWidth = computed(() =>
  inputFocused.value || query.value.length > 0,
)

const inputWrapWidthStyle = computed(() => {
  if (useFullInputWidth.value) {
    return { width: '100%', maxWidth: '100%' }
  }

  return {
    width: waveWidthPx.value > 0 ? `${waveWidthPx.value}px` : '0px',
    maxWidth: '100%',
  }
})

const waveWrapStyle = computed(() => ({
  width: waveWidthPx.value > 0 ? `${waveWidthPx.value}px` : '0px',
  maxWidth: '95%',
}))

function measuredIdleWidthPx() {
  return rulerRef.value?.getBoundingClientRect().width ?? 0
}

const waveWidthPx = computed(() => {
  const max = containerWidth.value > 0 ? containerWidth.value * 0.95 : Infinity

  if (underlineChars.value > 0) {
    return Math.min(measuredTextWidth.value, max)
  }

  if (suggestionsStopped.value) {
    return Math.min(measuredTextWidth.value || measuredIdleWidthPx(), max)
  }

  return 0
})

function syncMeasuredTextWidth() {
  if (!rulerRef.value) return
  rulerRef.value.textContent = underlineText.value || 'M'
  measuredTextWidth.value = rulerRef.value.getBoundingClientRect().width
}

const wavePath = computed(() => {
  const waveWidth = waveWidthPx.value
  if (!showWave.value || waveWidth <= 0) {
    return { d: '', viewBoxWidth: WAVE_PERIOD }
  }
  const periods = Math.max(1, Math.ceil(waveWidth / WAVE_PERIOD) + 1)
  let d = ''
  for (let i = 0; i < periods; i++) {
    const x = i * WAVE_PERIOD
    d += i === 0 ? `M ${x} 2 ` : ' '
    d += `C ${x + 9.9} 2 ${x + 11.8} 9.5 ${x + 22.5} 9.5 C ${x + 33.2} 9.5 ${x + 35.1} 2 ${x + WAVE_PERIOD} 2`
  }
  return { d, viewBoxWidth: periods * WAVE_PERIOD }
})

function isTypingKey(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  return event.key.length === 1
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Backspace') {
    playEvent('disabled')
  }
  else if (isTypingKey(event)) {
    playEvent('type')
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    emit('submit')
  }
}

let resizeObserver: ResizeObserver | null = null
let typewriter: ReturnType<typeof createTypewriterCycle> | null = null

function stopSuggestions() {
  if (suggestionsStopped.value) return
  suggestionsStopped.value = true
  typewriter?.stop()
  typewriter = null
  nextTick(() => {
    if (rulerRef.value) {
      rulerRef.value.textContent = 'M'.repeat(12)
      measuredTextWidth.value = rulerRef.value.getBoundingClientRect().width
    }
  })
}

function startSuggestions() {
  suggestionsStopped.value = false
  animatedPlaceholder.value = ''
  measuredTextWidth.value = 0

  typewriter = createTypewriterCycle({
    phrases: props.placeholders,
    onUpdate: (text) => {
      animatedPlaceholder.value = text
    },
  })
  typewriter.start()
}

function onFocus() {
  inputFocused.value = true
  stopSuggestions()
}

function onBlur() {
  inputFocused.value = false
}

function onInput() {
  stopSuggestions()
  syncMeasuredTextWidth()
}

function clearSearch() {
  playEvent('toggleOff')
  query.value = ''
  startSuggestions()
  inputRef.value?.blur()
  emit('clear')
}

watch(underlineText, () => {
  nextTick(syncMeasuredTextWidth)
})

watch(query, (value) => {
  if (value.trim()) {
    stopSuggestions()
  }
})

watch(() => props.placeholders, () => {
  if (suggestionsStopped.value || query.value.trim()) return
  typewriter?.stop()
  typewriter = null
  startSuggestions()
}, { deep: true })

onMounted(() => {
  const container = containerRef.value
  if (container) {
    resizeObserver = new ResizeObserver(([entry]) => {
      containerWidth.value = entry?.contentRect.width ?? 0
      syncMeasuredTextWidth()
    })
    resizeObserver.observe(container)
    containerWidth.value = container.getBoundingClientRect().width
    syncMeasuredTextWidth()
  }

  typewriter = createTypewriterCycle({
    phrases: props.placeholders,
    onUpdate: (text) => {
      animatedPlaceholder.value = text
    },
  })
  typewriter.start()
})

onUnmounted(() => {
  stopSuggestions()
  resizeObserver?.disconnect()
})
</script>

<template>
  <div
    class="area-container-outside w-full min-w-0"
    :class="embedded ? '' : 'padding-bottom-xs'"
  >
    <div class="area-container-inside col1-fullwidth typetester-inline-wrapper typetester-inline-wrapper--compact w-full min-w-0">
      <div class="typetester-inline-shadow" aria-hidden="true" />
      <div
        id="typetester-inline-youtube"
        class="typetester-inline-container typetester-inline-mono typetester-inline--compact w-full min-w-0"
        :class="embedded ? 'typetester-inline--no-header' : ''"
      >
        <div v-if="!embedded" class="typetester-inline-header">
          {{ label }}
        </div>
        <div
          ref="containerRef"
          class="typetester-inline-sample typetester-inline-sample--bottom typetester-inline-input-area"
        >
          <button
            v-if="showClear"
            type="button"
            class="typetester-inline-clear"
            aria-label="Clear search"
            @click="clearSearch"
          >
            <MaruEmoji name="Delete" size="sm" />
          </button>
          <span
            ref="rulerRef"
            class="typetester-inline-input-ruler"
            aria-hidden="true"
          >{{ underlineText || 'M' }}</span>
          <div class="typetester-inline-input-stack">
            <div
              class="typetester-inline-input-wrap"
              :style="inputWrapWidthStyle"
            >
              <input
                ref="inputRef"
                v-model="query"
                type="text"
                role="searchbox"
                class="typetester-inline-input"
                :aria-label="label"
                :placeholder="animatedPlaceholder"
                autocomplete="off"
                spellcheck="false"
                @keydown="onKeydown"
                @focus="onFocus"
                @blur="onBlur"
                @pointerdown="onFocus"
                @input="onInput"
              >
            </div>
            <div
              class="typetester-inline-wave-wrap"
              :style="waveWrapStyle"
            >
              <svg
                class="typetester-inline-wave"
                :class="{ 'typetester-inline-wave--hidden': !showWave }"
                :viewBox="`0 -2 ${wavePath.viewBoxWidth} 14`"
                preserveAspectRatio="none"
                aria-hidden="true"
                overflow="visible"
              >
                <path
                  :d="wavePath.d"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  vector-effect="non-scaling-stroke"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
