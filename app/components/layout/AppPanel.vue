<script setup lang="ts">
import MaruHeading from '~/components/layout/MaruHeading.vue'
import type { EmojiId } from '~/utils/emojiCatalog'

const props = withDefaults(defineProps<{
  title: string
  titleEmoji?: EmojiId
  headingTone?: 'blue' | 'white' | 'black' | 'red' | 'green-lighter' | 'blue-lighter' | 'yellow-light'
  headerBg?: string
  bodyBg?: string
  headerTextClass?: string
  footerBg?: string
  footerTextClass?: string
  count?: string
  fillBody?: boolean
  scrollBody?: boolean
  bodyPadding?: boolean
  headingAlign?: 'left' | 'center'
}>(), {
  titleEmoji: undefined,
  headingTone: undefined,
  headerBg: 'bg-maru-blue',
  bodyBg: 'bg-maru-white',
  headerTextClass: 'text-maru-white',
  footerBg: undefined,
  footerTextClass: undefined,
  fillBody: false,
  scrollBody: false,
  bodyPadding: true,
  headingAlign: 'left',
})

const footerBgClass = computed(() => props.footerBg ?? props.headerBg)
const footerTextClass = computed(() => props.footerTextClass ?? props.headerTextClass)
</script>

<template>
  <div
    class="border-maru rounded-maru flex flex-col overflow-hidden min-h-0"
    :class="bodyBg"
  >
    <header
      class="border-maru-bottom shrink-0 flex items-center justify-between gap-3 px-3 py-1.5 sm:px-4 sm:py-2"
      :class="headerBg"
    >
      <MaruHeading
        :text="title"
        :emoji="titleEmoji"
        :tone="headingTone ?? (headerTextClass === 'text-maru-black' ? 'black' : 'white')"
        :align="headingAlign"
        size="sm"
      />
      <div class="flex items-center gap-3 shrink-0">
        <slot name="header-actions" />
        <p
          v-if="count"
          class="font-maru-mono font-maru-regular text-[1.45rem] leading-none tabular-nums"
          :class="headerTextClass"
        >
          {{ count }}
        </p>
      </div>
    </header>
    <div
      v-if="$slots.footer"
      class="flex-1 min-h-0 flex flex-col overflow-hidden"
    >
      <div
        class="flex-1 min-h-0 overflow-hidden flex flex-col"
      >
        <slot />
      </div>
      <footer
        class="panel-footer-lip border-maru-top shrink-0 relative flex items-center w-full overflow-hidden p-0"
        :class="[footerBgClass, footerTextClass]"
      >
        <slot name="footer" />
      </footer>
    </div>
    <div
      v-else
      class="flex-1 min-h-0"
      :class="[
        bodyPadding ? 'p-3 sm:p-4' : '',
        fillBody
          ? (scrollBody ? 'overflow-y-auto flex flex-col' : 'overflow-hidden flex flex-col')
          : 'overflow-y-auto',
      ]"
    >
      <slot />
    </div>
  </div>
</template>
