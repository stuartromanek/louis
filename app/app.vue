<script setup lang="ts">
const config = useRuntimeConfig()
const demoMode = config.public.demoMode
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <div
      v-if="demoMode"
      class="shrink-0 border-b-2 border-maru-black bg-maru-yellow px-3 py-2 text-center font-maru-mono text-xs sm:text-sm text-maru-black"
      role="status"
    >
      Demo instance — connect your Yoto account at your own risk. Self-host for production use (see README).
    </div>
    <NuxtPage />
  </div>
</template>
