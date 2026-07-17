<script setup lang="ts">
import { YOTO_MYO_KEY } from '~/components/yoto-myo/keys'
import { useUserPreferences } from '~/composables/useUserPreferences'

const route = useRoute()
const yoto = inject(YOTO_MYO_KEY, null)
const { showDebugPanel } = useUserPreferences()

const testSaveProgressActive = computed(
  () => route.query.testSaveProgress !== undefined,
)

const testSaveProgressHref = computed(() => {
  const query = { ...route.query }
  if (testSaveProgressActive.value) {
    delete query.testSaveProgress
  }
  else {
    query.testSaveProgress = ''
  }
  return { path: route.path, query }
})

type HealthChecks = {
  audioCache?: {
    cachePreviewBytes: number
    cacheSaveBytes: number
    cacheFileCount: number
    staleJobDirCount: number
  }
}

const cacheStatsLabel = ref('')
let healthFetched = false

async function fetchHealthIfNeeded() {
  if (!showDebugPanel.value || healthFetched) return
  healthFetched = true

  try {
    const health = await $fetch<{ checks: HealthChecks }>('/api/health')
    const cache = health.checks?.audioCache
    if (!cache) return

    const totalMb = Math.round((cache.cachePreviewBytes + cache.cacheSaveBytes) / (1024 * 1024))
    cacheStatsLabel.value = `Audio cache: ${cache.cacheFileCount} files, ${totalMb} MB, ${cache.staleJobDirCount} stale jobs`
  }
  catch {
    cacheStatsLabel.value = 'Audio cache: unavailable'
  }
}

watch(showDebugPanel, (visible) => {
  if (visible) void fetchHealthIfNeeded()
}, { immediate: true })

onMounted(() => {
  void fetchHealthIfNeeded()
})

function onRefreshCards() {
  yoto?.refresh()
}
</script>

<template>
  <details
    v-if="showDebugPanel"
    class="dev-tools-strip border-maru rounded-maru bg-maru-gray-light px-3 py-1.5 sm:px-4"
  >
    <summary class="dev-tools-strip__text text-maru-gray cursor-pointer select-none">
      Debug
    </summary>
    <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      <NuxtLink
        :to="testSaveProgressHref"
        class="dev-tools-strip__text font-maru-mono text-maru-black underline"
      >
        {{ testSaveProgressActive ? 'Disable' : 'Enable' }} ?testSaveProgress
      </NuxtLink>
      <button
        type="button"
        class="dev-tools-strip__text font-maru-mono text-maru-black underline"
        @click="onRefreshCards"
      >
        Refresh cards
      </button>
      <span
        v-if="cacheStatsLabel"
        class="dev-tools-strip__text text-maru-gray"
      >
        {{ cacheStatsLabel }}
      </span>
    </div>
  </details>
</template>

<style scoped>
.dev-tools-strip__text {
  font-size: 1.25rem;
  line-height: 1.2;
  letter-spacing: 0.01em;
}

@media (min-width: 600px) {
  .dev-tools-strip__text {
    font-size: 1.45rem;
  }
}
</style>
