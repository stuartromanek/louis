<script setup lang="ts">
const query = defineModel<string>({ required: true })
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
}>()

const suggestionsStopped = ref(false)

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

let typewriter: ReturnType<typeof createTypewriterCycle> | null = null

function stopSuggestions() {
  if (suggestionsStopped.value) return
  suggestionsStopped.value = true
  typewriter?.stop()
  typewriter = null
}

function startSuggestions() {
  suggestionsStopped.value = false
  animatedPlaceholder.value = ''

  typewriter = createTypewriterCycle({
    phrases: props.placeholders,
    onUpdate: (text) => {
      animatedPlaceholder.value = text
    },
  })
  typewriter.start()
}

function onFocus() {
  stopSuggestions()
}

function onInput() {
  stopSuggestions()
}

function onSearchClick() {
  playEvent('buttonPrimary')
  emit('submit')
}

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
})
</script>

<template>
  <div
    class="area-container-outside w-full min-w-0"
    :class="embedded ? '' : 'padding-bottom-xs'"
  >
    <div class="area-container-inside col1-fullwidth typetester-inline-wrapper typetester-inline-wrapper--compact w-full min-w-0">
      <div
        id="typetester-inline-youtube"
        class="typetester-inline-container typetester-inline-mono typetester-inline--compact w-full min-w-0"
        :class="embedded ? 'typetester-inline--no-header' : ''"
      >
        <div v-if="!embedded" class="typetester-inline-header">
          {{ label }}
        </div>
        <div class="typetester-inline-sample typetester-inline-sample--bottom typetester-inline-input-area typetester-inline-input-area--with-search">
          <div class="typetester-inline-field">
            <div class="typetester-inline-input-stack">
              <div class="typetester-inline-input-wrap">
                <input
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
                  @pointerdown="onFocus"
                  @input="onInput"
                >
              </div>
            </div>
          </div>
          <button
            type="button"
            class="maru-button maru-button--sm typetester-inline-search-btn bg-maru-turquoise-light text-maru-black"
            @click="onSearchClick"
          >
            <span class="maru-button__label">Search</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
