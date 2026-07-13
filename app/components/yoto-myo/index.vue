<!--
  Yoto MYO — list user's Make Your Own cards.

  Requires:
  - NUXT_YOTO_CLIENT_ID in .env (public PKCE client; secret optional)
  - NUXT_YOTO_REDIRECT_URI registered in Yoto developer portal (production)
  - Server routes at /api/yoto/auth/* and /api/yoto/content/mine
-->
<script setup lang="ts">
import MaruHeading from '~/components/layout/MaruHeading.vue'
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { useYotoMyo } from './useYotoMyo'
import { YOTO_MYO_KEY } from './keys'
import YotoMyoCard from './YotoMyoCard.vue'
import type { YotoMyoCard as YotoMyoCardType } from './types'

withDefaults(defineProps<{
  embedded?: boolean
}>(), {
  embedded: false,
})

const yoto = inject(YOTO_MYO_KEY, null) ?? useYotoMyo()
const editor = inject(MYO_EDITOR_KEY, null)

const selectedCardId = editor?.selectedCardId
const editorLoading = editor?.loading

const {
  cards,
  status,
  errorMessage,
  connected,
  connect,
} = yoto

function onSelectCard(card: YotoMyoCardType) {
  editor?.selectCard(card)
}

const cardCountLabel = computed(() => {
  if (!connected.value || status.value !== 'idle') return ''
  return `${cards.value.length} ${cards.value.length === 1 ? 'card' : 'cards'}`
})

const emit = defineEmits<{
  'update:count': [value: string]
}>()

watch(cardCountLabel, value => emit('update:count', value), { immediate: true })
</script>

<template>
  <section v-if="!embedded" class="mt-12">
    <div class="flex items-baseline justify-between gap-3 mb-4">
      <MaruHeading text="My Yoto Cards" size="md" />
      <p
        v-if="cardCountLabel"
        class="font-maru-mono font-maru-regular text-sm text-maru-gray tabular-nums"
      >
        {{ cardCountLabel }}
      </p>
    </div>

    <div class="border-maru rounded-maru bg-maru-turquoise-lighter p-3 sm:p-4 min-h-40">
      <p
        v-if="status === 'loading'"
        class="empty-state-meta py-8 text-center"
      >
        Loading MYO cards...
      </p>

      <p
        v-else-if="status === 'unconfigured' || status === 'error'"
        class="font-maru-mono font-maru-regular text-sm text-maru-red py-4 border-maru rounded-maru bg-maru-red-lighter px-4"
      >
        {{ errorMessage }}
      </p>

      <div v-else-if="status === 'disconnected'" class="py-8 text-center">
        <div class="empty-state gap-3">
          <MaruEmoji name="Bear" size="lg" />
          <p class="empty-state-meta">
            Connect your Yoto account to load your MYO cards.
          </p>
          <button
            type="button"
            class="maru-button bg-maru-blue text-maru-white"
            @click="connect"
          >
            <span class="maru-button__label">Connect Yoto</span>
          </button>
        </div>
      </div>

      <template v-else>
        <p
          v-if="cards.length === 0"
          class="empty-state-meta py-8 text-center"
        >
          No MYO cards found.
        </p>

        <ul
          v-else
          class="myo-card-fan list-none m-0 p-0 flex-1 min-h-0"
        >
          <YotoMyoCard
            v-for="card in cards"
            :key="card.cardId"
            :card="card"
            :selected="selectedCardId === card.cardId"
            :loading="editorLoading && selectedCardId === card.cardId"
            @select="onSelectCard"
          />
        </ul>
      </template>
    </div>

    <div v-if="connected && status !== 'loading'" class="mt-3 flex gap-4">
      <button
        type="button"
        class="font-maru-mono font-maru-regular text-xs text-maru-gray underline"
        @click="yoto.refresh"
      >
        Refresh
      </button>
      <button
        type="button"
        class="font-maru-mono font-maru-regular text-xs text-maru-gray underline"
        @click="yoto.disconnect"
      >
        Disconnect
      </button>
    </div>

    <button
      v-else-if="status === 'error'"
      type="button"
      class="mt-3 font-maru-mono font-maru-regular text-xs text-maru-gray underline"
      @click="yoto.refresh"
    >
      Retry
    </button>
  </section>

  <template v-else>
    <div class="flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden">
      <p
        v-if="status === 'loading'"
        class="empty-state flex-1 min-h-0 w-full empty-state-meta"
      >
        Loading MYO cards...
      </p>

      <p
        v-else-if="status === 'unconfigured' || status === 'error'"
        class="font-maru-mono font-maru-regular text-sm text-maru-red py-4 border-maru rounded-maru bg-maru-red-lighter px-4"
      >
        {{ errorMessage }}
      </p>

      <div v-else-if="status === 'disconnected'" class="empty-state flex-1 min-h-0 w-full gap-3">
        <MaruEmoji name="Bear" size="lg" />
        <p class="empty-state-meta">
          Connect your Yoto account to load your MYO cards.
        </p>
      </div>

      <template v-else>
        <p
          v-if="cards.length === 0"
          class="empty-state flex-1 min-h-0 w-full empty-state-meta"
        >
          No MYO cards found.
        </p>

        <ul
          v-else
          class="myo-card-fan list-none m-0 p-0 flex-1 min-h-0"
        >
          <YotoMyoCard
            v-for="card in cards"
            :key="card.cardId"
            :card="card"
            :selected="selectedCardId === card.cardId"
            :loading="editorLoading && selectedCardId === card.cardId"
            @select="onSelectCard"
          />
        </ul>
      </template>
    </div>
  </template>
</template>
