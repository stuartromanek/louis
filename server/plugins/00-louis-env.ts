/**
 * Apply LOUIS_* (then legacy NUXT_*) onto Nitro runtimeConfig when still mutable
 * (dev). Production relies on a nitro.mjs preamble aliasing LOUIS_* → NUXT_*
 * before Nitro freezes shared runtimeConfig.
 */
import { applyLouisEnvToRuntimeConfig } from '../utils/louis-env'

export default defineNitroPlugin(() => {
  applyLouisEnvToRuntimeConfig(useRuntimeConfig())
})
