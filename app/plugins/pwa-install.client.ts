import { bindPwaInstallListeners } from '~/composables/usePwaInstall'

export default defineNuxtPlugin(() => {
  bindPwaInstallListeners()
})
