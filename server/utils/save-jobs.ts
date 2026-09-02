import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { H3Event } from 'h3'
import type {
  PlaylistTrack,
  SaveJobState,
  SaveJobTrackProgress,
  SaveTrackAction,
  SaveTrackStatus,
  TranscodedAudioResult,
} from '#shared/myo-editor/types'
import {
  applyProbedDurations,
  isCompleteSplitGroup,
  saveNeedsProbedDuration,
} from '#shared/myo-editor/splitTrack'
import { playlistRowId } from '#shared/myo-editor/playlistRowId'
import { buildProvenance } from '#shared/myo-editor/parseProvenance'
import { EMPTY_CARD_DETAIL, buildSavePlan } from '#shared/myo-editor/buildSavePlan'
import { playlistToYotoContent } from '#shared/myo-editor/playlistToYotoContent'
import { flattenCardTracks } from '#shared/myo-editor/trackLookup'
import { resolveDisplayIcon, toYotoTrackPayload } from '#shared/myo-editor/yotoTrackPayload'
import {
  getCardTotalsLimitError,
  getTrackCountLimitError,
  getTrackMediaLimitError,
  withMappedYotoLimitError,
} from '#shared/myo-editor/yotoMyoLimits'
import { downloadYoutubeAudio } from './youtube-download'
import { hashFileSha256, pollPutAudioTranscode, putAudioForTranscode } from './yoto-media'
import { loudnormAudioFile } from './ffmpeg-loudnorm'
import { probeAudioDurationSeconds, splitAudioFile } from './ffmpeg-split'
import { trimAudioFile } from './ffmpeg-trim'
import { effectiveCutRange, isTrimmed } from '#shared/myo-editor/trackTrim'
import {
  readSplitPartTranscodeCache,
  transcodedFromSplitCache,
  writeSplitPartTranscodeCache,
} from './split-transcode-cache'
import {
  extractCutCacheKey,
  planYoutubeGroupExtract,
} from './save-extract-steps'
import { createOrUpdateContent } from './yoto-content'
import {
  isUncertainCreatePostError,
  requireCreatedCardId,
  UNCERTAIN_CREATE_POST_MESSAGE,
  withContentCardId,
} from './yoto-content-contract'
import { mergeContentMetadata } from './yoto-metadata'
import { tryGeneratePlaylistCover } from './yoto-cover'
import { fetchYotoCardDetail } from './yoto-card-detail'
import { getYotoAccessToken } from './yoto'
import { createExtractPipeline } from './extract-pipeline'

/** Process-local only — cleared on every container restart/redeploy. */
const jobs = new Map<string, SaveJobState>()

export type SaveTarget =
  | { operation: 'create' }
  | { operation: 'update'; cardId: string }

function findActiveJobForCard(cardId: string): SaveJobState | undefined {
  for (const job of jobs.values()) {
    if (job.cardId !== cardId) continue
    if (job.status === 'complete' || job.status === 'failed') continue
    return job
  }
}

function createTrackProgress(playlist: PlaylistTrack[]): SaveJobTrackProgress[] {
  return playlist.map((track, index) => ({
    playlistIndex: index,
    title: track.title,
    status: 'pending',
  }))
}

function updateTrack(
  job: SaveJobState,
  index: number,
  status: SaveTrackStatus,
  error?: string,
) {
  const track = job.tracks[index]
  if (track) {
    track.status = status
    track.error = error
  }
}

function updateJob(jobId: string, patch: Partial<SaveJobState>) {
  const job = jobs.get(jobId)
  if (!job) return
  Object.assign(job, patch, { updatedAt: Date.now() })
}

const SAVE_JOB_HEARTBEAT_MS = 15_000

function startSaveJobHeartbeat(jobId: string): () => void {
  const timer = setInterval(() => {
    updateJob(jobId, {})
  }, SAVE_JOB_HEARTBEAT_MS)
  return () => clearInterval(timer)
}

/** Title of the track currently being extracted/uploaded, if any. */
function activeSaveTrackTitle(job: SaveJobState): string | undefined {
  const active = job.tracks.find(track => (
    track.status === 'extracting'
    || track.status === 'leveling'
    || track.status === 'uploading'
    || track.status === 'transcoding'
  ))
  return active?.title
}

/** Best-effort title when posting fails after extracts (no in-flight track). */
function firstOverLimitTrackTitle(
  playlist: PlaylistTrack[],
  uploadedByIndex: Map<number, TranscodedAudioResult>,
): string | undefined {
  for (let i = 0; i < playlist.length; i++) {
    const track = playlist[i]!
    const uploaded = uploadedByIndex.get(i)
    const mediaError = getTrackMediaLimitError({
      title: track.title,
      duration: uploaded?.transcodedInfo.duration ?? track.duration ?? track.yotoReuse?.duration,
      fileSize: uploaded?.transcodedInfo.fileSize ?? track.yotoReuse?.fileSize,
    })
    if (mediaError) return track.title
  }
  return undefined
}

export function getSaveJob(jobId: string): SaveJobState | undefined {
  return jobs.get(jobId)
}

export function startSaveJob(
  event: H3Event,
  target: SaveTarget,
  playlist: PlaylistTrack[],
  cardTitle: string,
  baselinePlaylist: PlaylistTrack[],
  options?: { acknowledgeCapacityRisk?: boolean, normalizeVolume?: boolean },
): SaveJobState {
  if (target.operation === 'update') {
    const existing = findActiveJobForCard(target.cardId)
    if (existing) return existing
  }

  const jobId = crypto.randomUUID()
  const acknowledgeCapacityRisk = options?.acknowledgeCapacityRisk === true
  const normalizeVolume = options?.normalizeVolume === true
  const job: SaveJobState = {
    id: jobId,
    operation: target.operation,
    cardId: target.operation === 'update' ? target.cardId : undefined,
    status: 'planning',
    progress: 0,
    operationProgress: 0,
    tracks: createTrackProgress(playlist),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  jobs.set(jobId, job)

  void (async () => {
    try {
      const accessToken = await getYotoAccessToken(event)
      await runSaveJob(
        event,
        accessToken,
        jobId,
        target,
        playlist,
        cardTitle,
        baselinePlaylist,
        acknowledgeCapacityRisk,
        normalizeVolume,
      )
    }
    catch (err: unknown) {
      const e = err as { statusMessage?: string; message?: string }
      updateJob(jobId, {
        status: 'failed',
        error: withMappedYotoLimitError(e.statusMessage ?? e.message ?? 'Save failed'),
        progress: 100,
      })
    }
  })()

  return job
}

async function runSaveJob(
  event: H3Event,
  accessToken: string,
  jobId: string,
  target: SaveTarget,
  playlist: PlaylistTrack[],
  cardTitle: string,
  baselinePlaylist: PlaylistTrack[],
  acknowledgeCapacityRisk: boolean,
  normalizeVolume: boolean,
) {
  const job = jobs.get(jobId)
  if (!job) return

  const uploadedByIndex = new Map<number, TranscodedAudioResult>()
  let createOutcomeUncertain = false
  let workingPlaylist = playlist
  const stopHeartbeat = startSaveJobHeartbeat(jobId)

  try {
    const detail = target.operation === 'update'
      ? await fetchYotoCardDetail(target.cardId, accessToken)
      : EMPTY_CARD_DETAIL

    const plan = buildSavePlan(baselinePlaylist, playlist, detail)
    if (plan.errors.length > 0) {
      throw createError({
        statusCode: 400,
        message: plan.errors[0],
      })
    }

    let workingPlan = plan
    workingPlaylist = playlist

    let extractActions = workingPlan.tracks.filter(
      (action): action is Extract<SaveTrackAction, { kind: 'extract-youtube' }> =>
        action.kind === 'extract-youtube',
    )
    let reuseActions = workingPlan.tracks.filter(
      action => action.kind === 'reuse-yoto' || action.kind === 'passthrough-stream',
    )

    const OVERALL_START = 2
    const OVERALL_TRACKS_END = 90
    const OVERALL_POSTING = 95
    let overallProgress = OVERALL_START

    function setJobProgress(patch: Partial<SaveJobState>) {
      if (patch.progress !== undefined) {
        overallProgress = Math.max(overallProgress, Math.min(99, Math.round(patch.progress)))
        patch.progress = overallProgress
      }
      updateJob(jobId, patch)
    }

    setJobProgress({ status: 'planning', progress: OVERALL_START, operationProgress: 5 })

    if (!acknowledgeCapacityRisk) {
      const trackCountError = getTrackCountLimitError(workingPlaylist.length)
      if (trackCountError) {
        throw createError({
          statusCode: 400,
          message: trackCountError,
        })
      }
    }

    const downloadedByYoutubeId = new Map<string, Awaited<ReturnType<typeof downloadYoutubeAudio>>>()
    const durationByYoutubeId = new Map<string, number>()
    const leveledByYoutubeId = new Map<string, { path: string, name: string }>()
    const transcodePercentByIndex = new Map<number, number>()
    const uniqueYoutubeIds = [...new Set(extractActions.map(action => action.youtubeId))]
    const audioWorkDir = resolveAudioWorkDirConfig(event).audioWorkDir
    const skipDownloadYoutubeIds = new Set<string>()

    for (const youtubeId of uniqueYoutubeIds) {
      const group = extractActions.filter(action => action.youtubeId === youtubeId)
      if (!isCompleteSplitGroup(group)) continue
      const cached = await Promise.all(group.map(async (part) => {
        const track = workingPlaylist[part.playlistIndex]
        if (!track) return null
        const key = extractCutCacheKey(youtubeId, track, normalizeVolume)
        if (!key) return null
        const record = await readSplitPartTranscodeCache(audioWorkDir, key)
        return transcodedFromSplitCache(record)
      }))
      const tracks = group
        .map(part => workingPlaylist[part.playlistIndex])
        .filter((track): track is PlaylistTrack => Boolean(track))
      const extractPlan = planYoutubeGroupExtract({
        youtubeId,
        tracks,
        normalizeVolume,
        cacheHits: cached,
      })
      if (extractPlan.skipDownload) skipDownloadYoutubeIds.add(youtubeId)
    }

    const finishExtractedPart = (
      playlistIndex: number,
      transcoded: TranscodedAudioResult,
    ) => {
      uploadedByIndex.set(playlistIndex, transcoded)
      if (!acknowledgeCapacityRisk) {
        const mediaError = getTrackMediaLimitError({
          title: workingPlaylist[playlistIndex]?.title ?? `Track ${playlistIndex + 1}`,
          duration: transcoded.transcodedInfo.duration,
          fileSize: transcoded.transcodedInfo.fileSize,
        })
        if (mediaError) {
          throw createError({
            statusCode: 413,
            message: mediaError,
          })
        }
      }
      updateTrack(job, playlistIndex, 'ready')
    }

    function refreshExtractActions() {
      extractActions = workingPlan.tracks.filter(
        (action): action is Extract<SaveTrackAction, { kind: 'extract-youtube' }> =>
          action.kind === 'extract-youtube',
      )
      reuseActions = workingPlan.tracks.filter(
        action => action.kind === 'reuse-yoto' || action.kind === 'passthrough-stream',
      )
    }

    function replanFromProbedDurations() {
      const previous = workingPlaylist
      const replanned = applyProbedDurations(workingPlaylist, durationByYoutubeId)
      const didReplan = replanned.length !== previous.length
        || replanned.some((track, index) => {
          const prev = previous[index]
          return prev?.id !== track.id
            || prev.split?.startSeconds !== track.split?.startSeconds
            || prev.split?.durationSeconds !== track.split?.durationSeconds
            || prev.split?.count !== track.split?.count
        })
      if (!didReplan) return

      workingPlaylist = replanned
      workingPlan = buildSavePlan(baselinePlaylist, workingPlaylist, detail)
      if (workingPlan.errors.length > 0) {
        throw createError({
          statusCode: 400,
          message: workingPlan.errors[0],
        })
      }

      const prevById = new Map<string, SaveJobTrackProgress>()
      for (const row of job.tracks) {
        const track = previous[row.playlistIndex]
        if (track) prevById.set(playlistRowId(track), row)
      }
      job.tracks = workingPlaylist.map((track, index) => {
        const prev = prevById.get(playlistRowId(track))
        return {
          playlistIndex: index,
          title: track.title,
          status: prev?.status ?? 'pending',
          error: prev?.error,
        }
      })
      refreshExtractActions()
      if (!acknowledgeCapacityRisk) {
        const trackCountError = getTrackCountLimitError(workingPlaylist.length)
        if (trackCountError) {
          throw createError({
            statusCode: 400,
            message: trackCountError,
          })
        }
      }
    }

    function reportExtractProgress() {
      const extractTotal = Math.max(1, extractActions.length)
      const extractReady = extractActions.filter(
        action => job.tracks[action.playlistIndex]?.status === 'ready',
      ).length
      const displayed = job.tracks.find(track => (
        track.status === 'extracting'
        || track.status === 'leveling'
        || track.status === 'uploading'
        || track.status === 'transcoding'
      ))
      let operationProgress = 8
      if (displayed?.status === 'leveling') operationProgress = 20
      else if (displayed?.status === 'uploading') operationProgress = 32
      else if (displayed?.status === 'transcoding') {
        const percent = transcodePercentByIndex.get(displayed.playlistIndex) ?? 50
        operationProgress = Math.min(98, Math.round(35 + percent * 0.63))
      }
      const downloading = displayed?.status === 'extracting' || displayed?.status === 'leveling'
      setJobProgress({
        status: downloading ? 'downloading' : 'uploading',
        progress: OVERALL_START + (extractReady / extractTotal) * (OVERALL_TRACKS_END - OVERALL_START),
        operationProgress,
      })
    }

    type ExtractPartWork = {
      playlistIndex: number
      youtubeId: string
      title: string
      partLabel?: string
      durationSeconds?: number
      range: { startSeconds: number, durationSeconds: number } | null
      shouldCut: boolean
      loudnormPart: boolean
      loudnormFullFile: boolean
      shareLeveled: boolean
      cacheKey: ReturnType<typeof extractCutCacheKey>
      sourceSha256?: string
    }

    function orderedExtractGroup(youtubeId: string) {
      const group = extractActions.filter(action => action.youtubeId === youtubeId)
      return [...group].sort((a, b) => {
        const aIndex = workingPlaylist[a.playlistIndex]?.split?.index ?? a.playlistIndex
        const bIndex = workingPlaylist[b.playlistIndex]?.split?.index ?? b.playlistIndex
        return aIndex - bIndex
      })
    }

    async function cacheHitsForGroup(
      youtubeId: string,
      ordered: typeof extractActions,
      actualDuration?: number,
      sourceSha256?: string,
    ) {
      return Promise.all(ordered.map(async (part) => {
        const track = workingPlaylist[part.playlistIndex]
        if (!track) return null
        const key = extractCutCacheKey(youtubeId, track, normalizeVolume, actualDuration)
        if (!key) return null
        const record = await readSplitPartTranscodeCache(audioWorkDir, key, sourceSha256)
        return transcodedFromSplitCache(record)
      }))
    }

    let pauseBeforeNextExtract = false

    async function snapshotGroup(youtubeId: string): Promise<ExtractPartWork[]> {
      let ordered = orderedExtractGroup(youtubeId)
      if (ordered.length === 0) return []
      const firstIndex = ordered[0]!.playlistIndex

      if (skipDownloadYoutubeIds.has(youtubeId) && !downloadedByYoutubeId.has(youtubeId)) {
        const groupTracks = ordered
          .map(item => workingPlaylist[item.playlistIndex])
          .filter((track): track is PlaylistTrack => Boolean(track))
        const cachedHits = await cacheHitsForGroup(youtubeId, ordered)
        const extractPlan = planYoutubeGroupExtract({
          youtubeId,
          tracks: groupTracks,
          normalizeVolume,
          cacheHits: cachedHits,
        })
        if (extractPlan.skipDownload) {
          for (let partIndex = 0; partIndex < ordered.length; partIndex++) {
            const hit = cachedHits[partIndex]
            if (hit) finishExtractedPart(ordered[partIndex]!.playlistIndex, hit)
          }
          reportExtractProgress()
          return []
        }
      }

      if (!downloadedByYoutubeId.has(youtubeId)) {
        if (pauseBeforeNextExtract) {
          await new Promise(resolve => setTimeout(resolve, 5_000))
          pauseBeforeNextExtract = false
        }
        updateTrack(job, firstIndex, 'extracting')
        reportExtractProgress()
        const downloaded = await downloadYoutubeAudio(youtubeId, event, {
          enforceMyoSizeLimit: false,
        })
        pauseBeforeNextExtract = Boolean(downloaded.recoveredFromRetryableFailure)
        downloadedByYoutubeId.set(youtubeId, downloaded)
        const probed = await probeAudioDurationSeconds(downloaded.filePath)
        if (probed) durationByYoutubeId.set(youtubeId, probed)
        replanFromProbedDurations()
        ordered = orderedExtractGroup(youtubeId)
      }

      const actualDuration = durationByYoutubeId.get(youtubeId)
      for (const action of ordered) {
        if (skipDownloadYoutubeIds.has(youtubeId)) continue
        if (actualDuration) continue
        const track = workingPlaylist[action.playlistIndex]
        if (!track || !saveNeedsProbedDuration(track)) continue
        throw createError({
          statusCode: 500,
          message: `Could not measure duration for "${track.title}". Check the source and try again.`,
        })
      }

      const groupTracks = ordered
        .map(item => workingPlaylist[item.playlistIndex])
        .filter((track): track is PlaylistTrack => Boolean(track))
      const downloaded = downloadedByYoutubeId.get(youtubeId)
      const sourceSha256 = downloaded
        ? await hashFileSha256(downloaded.filePath)
        : undefined
      const cachedHits = await cacheHitsForGroup(youtubeId, ordered, actualDuration, sourceSha256)
      const extractPlan = planYoutubeGroupExtract({
        youtubeId,
        tracks: groupTracks,
        normalizeVolume,
        actualDuration,
        cacheHits: cachedHits,
      })

      const work: ExtractPartWork[] = []
      for (let partIndex = 0; partIndex < ordered.length; partIndex++) {
        const action = ordered[partIndex]!
        const track = workingPlaylist[action.playlistIndex]
        const hit = cachedHits[partIndex]
        if (hit) {
          finishExtractedPart(action.playlistIndex, hit)
          continue
        }
        if (!track) continue
        const range = extractPlan.shouldCut
          ? effectiveCutRange(track, actualDuration)
          : null
        if (extractPlan.shouldCut && !range) {
          throw createError({
            statusCode: 500,
            message: `Could not cut "${track.title}".`,
          })
        }
        const planned = extractPlan.parts[partIndex]
        work.push({
          playlistIndex: action.playlistIndex,
          youtubeId,
          title: track.title,
          partLabel: track.split
            ? `${track.split.index + 1}/${track.split.count}`
            : (ordered.length > 1 ? `${partIndex + 1}/${ordered.length}` : undefined),
          durationSeconds: range?.durationSeconds ?? actualDuration ?? track.duration,
          range,
          shouldCut: extractPlan.shouldCut,
          loudnormPart: Boolean(planned?.loudnormPart),
          loudnormFullFile: extractPlan.loudnormFullFile && work.length === 0,
          shareLeveled: extractPlan.loudnormFullFile,
          cacheKey: extractCutCacheKey(youtubeId, track, normalizeVolume, actualDuration),
          sourceSha256,
        })
      }
      reportExtractProgress()
      return work
    }

    async function preparePart(part: ExtractPartWork) {
      const downloaded = downloadedByYoutubeId.get(part.youtubeId)
      if (!downloaded) {
        throw createError({
          statusCode: 500,
          message: `Missing download for YouTube video ${part.youtubeId}`,
        })
      }

      let uploadSourcePath = downloaded.filePath
      let uploadSourceName = downloaded.filename
      const actualDuration = durationByYoutubeId.get(part.youtubeId)

      if (part.loudnormFullFile) {
        updateTrack(job, part.playlistIndex, 'leveling')
        reportExtractProgress()
        const levelDir = path.join(audioWorkDir, 'jobs', jobId, part.youtubeId)
        await mkdir(levelDir, { recursive: true })
        const ext = path.extname(downloaded.filePath) || '.m4a'
        const leveledPath = path.join(levelDir, `leveled${ext}`)
        const leveled = await loudnormAudioFile(
          downloaded.filePath,
          leveledPath,
          actualDuration,
        )
        if (leveled) {
          uploadSourcePath = leveled
          uploadSourceName = path.basename(leveled)
          leveledByYoutubeId.set(part.youtubeId, {
            path: leveled,
            name: uploadSourceName,
          })
        }
      }
      else if (part.shareLeveled) {
        const shared = leveledByYoutubeId.get(part.youtubeId)
        if (shared) {
          uploadSourcePath = shared.path
          uploadSourceName = shared.name
        }
      }

      if (part.shouldCut) {
        const track = workingPlaylist[part.playlistIndex]
        const range = part.range
        if (!track || !range) {
          throw createError({
            statusCode: 500,
            message: `Could not cut "${part.title}".`,
          })
        }
        const splitDir = path.join(audioWorkDir, 'jobs', jobId, part.youtubeId, 'parts')
        await mkdir(splitDir, { recursive: true })
        const destPath = path.join(splitDir, `part${track.split?.index ?? part.playlistIndex}.m4a`)
        const cut = isTrimmed(track)
          ? await trimAudioFile({
              sourcePath: downloaded.filePath,
              destPath,
              startSeconds: range.startSeconds,
              endSeconds: range.startSeconds + range.durationSeconds,
              sourceDurationSeconds: actualDuration,
            })
          : await splitAudioFile({
              sourcePath: downloaded.filePath,
              destPath,
              startSeconds: range.startSeconds,
              durationSeconds: range.durationSeconds,
              codec: 'aac',
            })
        if (!cut) {
          throw createError({
            statusCode: 500,
            message: `Could not trim "${part.title}".`,
          })
        }
        let uploadPath = destPath
        if (part.loudnormPart) {
          updateTrack(job, part.playlistIndex, 'leveling')
          reportExtractProgress()
          const leveledPath = path.join(
            splitDir,
            `part${track.split?.index ?? part.playlistIndex}-leveled.m4a`,
          )
          const leveled = await loudnormAudioFile(
            destPath,
            leveledPath,
            range.durationSeconds,
          )
          if (leveled) uploadPath = leveled
        }
        return {
          filePath: uploadPath,
          filename: path.basename(uploadPath),
          durationSeconds: range.durationSeconds,
        }
      }

      if (!acknowledgeCapacityRisk) {
        const fileStat = await stat(uploadSourcePath)
        const mediaError = getTrackMediaLimitError({
          title: part.title,
          duration: actualDuration,
          fileSize: fileStat.size,
        })
        if (mediaError) {
          throw createError({
            statusCode: 413,
            message: mediaError,
          })
        }
      }

      return {
        filePath: uploadSourcePath,
        filename: uploadSourceName,
        durationSeconds: part.durationSeconds,
      }
    }

    const pipeline = createExtractPipeline()
    let extractFatal: unknown
    let snapshotChain = Promise.resolve()
    const groupRuns: Promise<void>[] = []

    for (const youtubeId of uniqueYoutubeIds) {
      const snapshot = snapshotChain.then(async () => {
        if (extractFatal) throw extractFatal
        return snapshotGroup(youtubeId)
      })
      snapshotChain = snapshot.then(() => undefined, (err) => {
        extractFatal = extractFatal ?? err
      })
      groupRuns.push((async () => {
        try {
          const parts = await snapshot
          if (parts.length === 0) return
          await pipeline.run(parts.length, {
            prepare: index => preparePart(parts[index]!),
            put: async (index, prepared) => {
              if (extractFatal) throw extractFatal
              const part = parts[index]!
              updateTrack(job, part.playlistIndex, 'uploading')
              reportExtractProgress()
              return putAudioForTranscode(accessToken, prepared.filePath, prepared.filename, {
                meta: {
                  jobId,
                  youtubeId: part.youtubeId,
                  title: part.title,
                  durationSeconds: prepared.durationSeconds,
                  partLabel: part.partLabel,
                },
              })
            },
            poll: async (index, putResult) => {
              const part = parts[index]!
              const transcoded = await pollPutAudioTranscode(accessToken, putResult, {
                meta: {
                  jobId,
                  youtubeId: part.youtubeId,
                  title: part.title,
                  durationSeconds: part.durationSeconds,
                  partLabel: part.partLabel,
                },
                withPutSlot: fn => pipeline.withPutSlot(fn),
                onTranscodePoll: ({ percent }) => {
                  updateTrack(job, part.playlistIndex, 'transcoding')
                  transcodePercentByIndex.set(part.playlistIndex, percent ?? 50)
                  reportExtractProgress()
                },
              })
              if (part.cacheKey && part.sourceSha256) {
                await writeSplitPartTranscodeCache(
                  audioWorkDir,
                  part.cacheKey,
                  transcoded,
                  part.sourceSha256,
                )
              }
              finishExtractedPart(part.playlistIndex, transcoded)
              reportExtractProgress()
              return transcoded
            },
          })
        }
        catch (err) {
          extractFatal = extractFatal ?? err
          throw err
        }
      })())
    }

    const groupResults = await Promise.allSettled(groupRuns)
    const groupFailure = groupResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    if (groupFailure) throw groupFailure.reason

    const extractCount = extractActions.length

    if (extractCount === 0 && reuseActions.length > 0) {
      setJobProgress({
        status: 'downloading',
        progress: OVERALL_START + 10,
        operationProgress: 100,
      })
    }

    for (const action of reuseActions) {
      updateTrack(job, action.playlistIndex, 'skipped')
      setJobProgress({
        progress: Math.min(OVERALL_TRACKS_END, overallProgress + 2),
        operationProgress: 100,
        status: extractCount === 0 ? 'downloading' : 'uploading',
      })
    }

    setJobProgress({ status: 'posting', progress: OVERALL_POSTING, operationProgress: 90 })

    const built = playlistToYotoContent(
      cardTitle,
      workingPlaylist,
      workingPlan.tracks,
      uploadedByIndex,
    )

    const builtTrackCount = built.chapters.reduce(
      (sum, chapter) => sum + chapter.tracks.length,
      0,
    )
    if (builtTrackCount !== workingPlaylist.length) {
      throw createError({
        statusCode: 500,
        message: `Save built ${builtTrackCount} tracks but playlist has ${workingPlaylist.length}`,
      })
    }

    if (!acknowledgeCapacityRisk) {
      for (const chapter of built.chapters) {
        for (const track of chapter.tracks) {
          const mediaError = getTrackMediaLimitError({
            title: track.title || chapter.title,
            duration: track.duration,
            fileSize: track.fileSize,
          })
          if (mediaError) {
            throw createError({
              statusCode: 413,
              message: mediaError,
            })
          }
        }
      }

      const totalsError = getCardTotalsLimitError({
        totalDuration: built.totalDuration,
        totalFileSize: built.totalFileSize,
      })
      if (totalsError) {
        throw createError({
          statusCode: 413,
          message: totalsError,
        })
      }
    }

    let coverImageL: string | null = null
    if (target.operation === 'create') {
      coverImageL = await tryGeneratePlaylistCover(accessToken)
    }

    let response
    try {
      response = await createOrUpdateContent(accessToken, withContentCardId(
        target.operation,
        target.operation === 'update' ? target.cardId : undefined,
        {
          title: cardTitle,
          content: {
            version: built.contentVersion,
            chapters: built.chapters,
          },
          metadata: mergeContentMetadata(
            target.operation === 'update' ? detail.metadata : null,
            {
              title: cardTitle,
              note: built.note,
              media: {
                duration: built.totalDuration,
                fileSize: built.totalFileSize,
                readableFileSize: Math.round((built.totalFileSize / 1024 / 1024) * 10) / 10,
              },
              ...(coverImageL ? { cover: { imageL: coverImageL } } : {}),
            },
          ),
        },
      ))
    }
    catch (err: unknown) {
      if (target.operation === 'create' && isUncertainCreatePostError(err)) {
        createOutcomeUncertain = true
        throw createError({
          statusCode: 502,
          message: UNCERTAIN_CREATE_POST_MESSAGE,
        })
      }
      throw err
    }

    if (target.operation === 'create') {
      createOutcomeUncertain = true
      updateJob(jobId, { cardId: requireCreatedCardId(response) })
      createOutcomeUncertain = false
    }

    updateJob(jobId, { status: 'complete', progress: 100, operationProgress: 100 })
  }
  catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    const trackTitle = activeSaveTrackTitle(job)
      ?? firstOverLimitTrackTitle(workingPlaylist, uploadedByIndex)
    const message = withMappedYotoLimitError(
      e.statusMessage ?? e.message ?? 'Save failed',
      trackTitle,
    )

    for (const track of job.tracks) {
      if (
        track.status === 'pending'
        || track.status === 'extracting'
        || track.status === 'leveling'
        || track.status === 'uploading'
        || track.status === 'transcoding'
      ) {
        track.status = 'failed'
        track.error = message
      }
    }

    updateJob(jobId, {
      status: 'failed',
      error: message,
      outcomeUncertain: createOutcomeUncertain || undefined,
      progress: 100,
    })
  }
  finally {
    stopHeartbeat()
  }
}

// Spike helper: reuse path posts existing yoto:# tracks without re-upload.
export async function testReuseContentUpdate(
  event: H3Event,
  cardId: string,
): Promise<{ ok: boolean; message: string }> {
  const accessToken = await getYotoAccessToken(event)
  const detail = await fetchYotoCardDetail(cardId, accessToken)

  const flatTracks = flattenCardTracks(detail)
  if (flatTracks.length === 0) {
    return { ok: false, message: 'Card has no tracks to test reuse against.' }
  }

  const chapters = flatTracks.map((track, index) => {
    const trackPayload = toYotoTrackPayload(
      {
        trackUrl: track.trackUrl,
        type: track.type,
        format: track.format,
        duration: track.duration,
        fileSize: track.fileSize,
        channels: track.channels,
        display: track.display,
        uid: track.uid,
      },
      track.title,
      '01',
      String(index + 1),
    )

    return {
      key: String(index + 1).padStart(2, '0'),
      title: track.title,
      overlayLabel: String(index + 1),
      tracks: [{
        ...trackPayload,
        display: resolveDisplayIcon(track.display, track.chapterDisplay),
      }],
      display: resolveDisplayIcon(track.chapterDisplay, track.display),
    }
  })

  await createOrUpdateContent(accessToken, {
    cardId,
    title: detail.title,
    content: {
      version: detail.contentVersion ?? undefined,
      chapters,
    },
    metadata: mergeContentMetadata(detail.metadata, {
      title: detail.title,
      note: detail.metadataNote ?? buildProvenance([]).note,
      media: {
        duration: detail.metadata?.media?.duration ?? 0,
        fileSize: detail.metadata?.media?.fileSize ?? 0,
        readableFileSize: detail.metadata?.media?.readableFileSize ?? 0,
      },
    }),
  })

  return { ok: true, message: 'Reuse POST succeeded — existing yoto:# tracks accepted without re-upload.' }
}
