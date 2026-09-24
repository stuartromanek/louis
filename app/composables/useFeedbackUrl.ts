import { buildFeedbackUrl, type FeedbackRuntimeInfo } from '#shared/feedbackUrl'

export function useFeedbackUrl() {
  const runtimeConfig = useRuntimeConfig()
  const runtimeInfo = ref<FeedbackRuntimeInfo | null>(null)

  onMounted(() => {
    runtimeInfo.value = window.louisDesktop?.runtimeInfo ?? null
  })

  return computed(() => buildFeedbackUrl(
    String(runtimeConfig.public.appVersion || ''),
    runtimeInfo.value,
  ))
}
