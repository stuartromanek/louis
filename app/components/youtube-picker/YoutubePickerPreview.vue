<script setup lang="ts">
const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <div class="border-maru rounded-maru bg-maru-yellow-light px-3 py-2.5 sm:px-4 flex items-center gap-3 flex-wrap">
    <p class="font-maru-bold text-xl sm:text-2xl text-balance leading-none flex-1 min-w-0">
      Enable long tracks?
    </p>

    <div class="flex gap-2 shrink-0 ml-auto">
      <button
        type="button"
        class="maru-button maru-button--sm bg-maru-green-light text-maru-black"
        @click="emit('confirm')"
      >
        <span class="maru-button__label">Confirm</span>
      </button>
      <button
        type="button"
        class="maru-button maru-button--sm bg-maru-white text-maru-black"
        @click="emit('cancel')"
      >
        <span class="maru-button__label">Cancel</span>
      </button>
    </div>
  </div>
</template>
