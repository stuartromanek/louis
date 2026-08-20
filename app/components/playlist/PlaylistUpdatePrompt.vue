<script setup lang="ts">
export type UpdatePromptKind = 'capacity' | 'normalize' | 'delete'
export type UpdatePromptSurface = 'footer' | 'dialog' | 'panel' | 'menu'

const props = withDefaults(defineProps<{
  kind: UpdatePromptKind
  surface: UpdatePromptSurface
  idPrefix: string
  busy?: boolean
  /** When > 1, copy covers a multi-playlist batch from Menu. */
  cardCount?: number
  intent?: 'create' | 'update'
  playlistTitle?: string
}>(), {
  busy: false,
  cardCount: 1,
  intent: 'update',
  playlistTitle: '',
})

const emit = defineEmits<{
  cancel: []
  keep: []
  confirm: []
}>()

const titleId = computed(() => `${props.idPrefix}-title`)
const bodyId = computed(() => `${props.idPrefix}-body`)

const isBatch = computed(() => props.cardCount > 1)

const isCreate = computed(() => props.intent === 'create')

const title = computed(() => {
  if (props.kind === 'capacity') return 'Over MYO limit'
  if (props.kind === 'delete') return 'Delete this playlist?'
  return 'Normalize new track levels?'
})

const body = computed(() => {
  if (props.kind === 'delete') {
    const name = props.playlistTitle.trim() || 'this playlist'
    return `This removes ${name} from Yoto. This can’t be undone.`
  }
  if (props.kind === 'capacity') {
    if (isBatch.value) {
      return 'One or more playlists are over the MYO limit. Update may fail.'
    }
    return isCreate.value ? 'Create may fail.' : 'Update may fail.'
  }
  return isBatch.value
    ? 'Attempt to normalize the volume levels of new tracks across these playlists. Existing tracks stay as they are.'
    : 'Attempt to normalize the volume levels of the new tracks. Existing tracks stay as they are.'
})

const secondaryLabel = computed(() => (props.kind === 'normalize' ? 'Keep as-is' : 'Cancel'))
const primaryLabel = computed(() => {
  if (props.kind === 'delete') return props.busy ? 'Deleting…' : 'Delete'
  if (props.kind === 'capacity') return isCreate.value ? 'Create anyway' : 'Update anyway'
  return 'Normalize new track levels'
})

const primaryClass = computed(() => (
  props.kind === 'delete'
    ? 'panel-footer-btn panel-footer-btn--short panel-footer-btn--danger shrink-0'
    : 'panel-footer-btn panel-footer-btn--short panel-footer-btn--primary shrink-0'
))

function onSecondary() {
  if (props.busy) return
  if (props.kind === 'normalize') emit('keep')
  else emit('cancel')
}

function onConfirm() {
  if (props.busy) return
  emit('confirm')
}
</script>

<template>
  <div
    v-if="surface === 'footer'"
    class="footer-capacity-confirm footer-capacity-confirm--open"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="titleId"
  >
    <p
      :id="titleId"
      class="footer-capacity-confirm__copy font-maru-mono text-pretty"
    >
      <span class="font-maru-bold">{{ title }}</span>
    </p>
    <div class="footer-capacity-confirm__actions">
      <button
        type="button"
        class="panel-footer-btn panel-footer-btn--short panel-footer-btn--secondary shrink-0"
        :disabled="busy"
        @click="onSecondary"
      >
        <span class="panel-footer-btn__label">{{ secondaryLabel }}</span>
      </button>
      <button
        type="button"
        :class="primaryClass"
        :disabled="busy"
        @click="onConfirm"
      >
        <span class="panel-footer-btn__label">{{ primaryLabel }}</span>
      </button>
    </div>
  </div>

  <div
    v-else-if="surface === 'panel' || surface === 'menu'"
    class="playlist-update-prompt"
    :class="{ 'playlist-update-prompt--menu': surface === 'menu' }"
    role="dialog"
    :aria-modal="surface === 'panel' ? true : undefined"
    :aria-labelledby="titleId"
    :aria-describedby="body ? bodyId : undefined"
  >
    <div class="playlist-update-prompt__copy">
      <p
        :id="titleId"
        class="type-title font-maru-bold text-pretty m-0"
      >
        {{ title }}
      </p>
      <p
        v-if="body"
        :id="bodyId"
        class="type-body text-pretty m-0"
      >
        {{ body }}
      </p>
    </div>
    <div class="playlist-update-prompt__actions">
      <button
        type="button"
        class="panel-footer-btn panel-footer-btn--short panel-footer-btn--secondary shrink-0"
        :disabled="busy"
        @click="onSecondary"
      >
        <span class="panel-footer-btn__label">{{ secondaryLabel }}</span>
      </button>
      <button
        type="button"
        :class="primaryClass"
        :disabled="busy"
        @click="onConfirm"
      >
        <span class="panel-footer-btn__label">{{ primaryLabel }}</span>
      </button>
    </div>
  </div>

  <div
    v-else
    class="mobile-overflow-menu__confirm"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="titleId"
    :aria-describedby="body ? bodyId : undefined"
  >
    <div
      class="mobile-overflow-menu__confirm-card border-maru rounded-maru"
      :class="{ 'mobile-overflow-menu__confirm-card--normalize': kind === 'normalize' }"
    >
      <p
        :id="titleId"
        class="type-title font-maru-bold text-pretty m-0"
      >
        {{ title }}
      </p>
      <p
        v-if="body"
        :id="bodyId"
        class="type-body text-pretty m-0"
      >
        {{ body }}
      </p>
      <div class="mobile-overflow-menu__confirm-actions">
        <button
          type="button"
          class="panel-footer-btn panel-footer-btn--short panel-footer-btn--secondary"
          :disabled="busy"
          @click="onSecondary"
        >
          <span class="panel-footer-btn__label">{{ secondaryLabel }}</span>
        </button>
        <button
          type="button"
          :class="primaryClass"
          :disabled="busy"
          @click="onConfirm"
        >
          <span class="panel-footer-btn__label">{{ primaryLabel }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
