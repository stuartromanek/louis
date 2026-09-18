import { runAudioWorkDirMaintenance, resolveAudioWorkDirConfig } from '../utils/audio-work-dir'
import { isPersistentAudioWorkDir } from '../utils/ytdlp-tools'
import {
  emitPipelineEvent,
  initPipelineLog,
  isPipelineLogEnabled,
} from '../utils/pipeline-log'

export default defineNitroPlugin(async () => {
  await runAudioWorkDirMaintenance()
  const config = resolveAudioWorkDirConfig()
  initPipelineLog({ audioWorkDir: config.audioWorkDir })
  // Save jobs are process-local; redeploy/restart drops in-flight progress.
  console.info('[louis] audio work dir ready; save jobs are in-memory (single replica recommended)')
  void emitRuntimeSnapshot(config.audioWorkDir).catch((err) => {
    console.warn(
      '[pipeline-log] runtime snapshot failed:',
      err instanceof Error ? err.message : err,
    )
  })
})

async function emitRuntimeSnapshot(audioWorkDir: string): Promise<void> {
  const { getSystemDepsStatus } = await import('../utils/system-deps')
  const { parseYtdlpJsRuntimeSpec } = await import('../utils/ytdlp-js-runtime')
  const deps = await getSystemDepsStatus()
  const js = parseYtdlpJsRuntimeSpec(deps.ytdlpJsRuntime.spec)
  emitPipelineEvent('runtime.snapshot', {
    ytdlpAvailable: deps.ytdlp.available,
    ytdlpVersion: deps.ytdlp.version,
    ffmpegAvailable: deps.ffmpeg.available,
    ffmpegVersion: deps.ffmpeg.version,
    jsRuntime: js.runtime,
    jsRuntimeKind: js.binaryPath ? 'shim' : 'bare',
    jsRuntimeVersion: deps.ytdlpJsRuntime.version,
    cookiesConfigured: deps.ytdlpCookies.configured,
    cookiesReadable: deps.ytdlpCookies.readable,
    workDirPersistent: isPersistentAudioWorkDir(audioWorkDir),
    pipelineLogEnabled: isPipelineLogEnabled(),
  })
}
