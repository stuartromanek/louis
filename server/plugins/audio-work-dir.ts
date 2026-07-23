import { runAudioWorkDirMaintenance } from '../utils/audio-work-dir'

export default defineNitroPlugin(async () => {
  await runAudioWorkDirMaintenance()
  // Save jobs are process-local; redeploy/restart drops in-flight progress (docs/DEMO.md §4b).
  console.info('[louis] audio work dir ready; save jobs are in-memory (single replica recommended)')
})
