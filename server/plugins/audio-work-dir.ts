import { runAudioWorkDirMaintenance } from '../utils/audio-work-dir'

export default defineNitroPlugin(async () => {
  await runAudioWorkDirMaintenance()
})
