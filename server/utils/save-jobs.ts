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
import { hashFileSha256, uploadAudioFile } from './yoto-media'
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
import { resolveAudioWorkDirConfig } from './audio-work-dir'

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

    let pauseBeforeNextExtract = false
    for (let downloadIndex = 0; downloadIndex < uniqueYoutubeIds.length; downloadIndex++) {
      const youtubeId = uniqueYoutubeIds[downloadIndex]!
      const group = extractActions.filter(action => action.youtubeId === youtubeId)
      const firstIndex = group[0]?.playlistIndex ?? 0
      if (skipDownloadYoutubeIds.has(youtubeId)) {
        setJobProgress({
          status: 'downloading',
          progress: OVERALL_START + (downloadIndex / Math.max(1, uniqueYoutubeIds.length)) * 20,
          operationProgress: 8,
        })
        continue
      }
      if (pauseBeforeNextExtract) {
        await new Promise(resolve => setTimeout(resolve, 5_000))
        pauseBeforeNextExtract = false
      }

      updateTrack(job, firstIndex, 'extracting')
      setJobProgress({
        status: 'downloading',
        progress: OVERALL_START + (downloadIndex / Math.max(1, uniqueYoutubeIds.length)) * 20,
        operationProgress: 8,
      })

      const downloaded = await downloadYoutubeAudio(youtubeId, event, {
        enforceMyoSizeLimit: false,
      })
      pauseBeforeNextExtract = Boolean(downloaded.recoveredFromRetryableFailure)
      downloadedByYoutubeId.set(youtubeId, downloaded)

      const probed = await probeAudioDurationSeconds(downloaded.filePath)
      if (probed) durationByYoutubeId.set(youtubeId, probed)
    }

    const replannedPlaylist = applyProbedDurations(workingPlaylist, durationByYoutubeId)
    const didReplan = replannedPlaylist.length !== workingPlaylist.length
      || replannedPlaylist.some((track, index) => {
        const prev = workingPlaylist[index]
        return prev?.id !== track.id
          || prev.split?.startSeconds !== track.split?.startSeconds
          || prev.split?.durationSeconds !== track.split?.durationSeconds
          || prev.split?.count !== track.split?.count
      })

    if (didReplan) {
      workingPlaylist = replannedPlaylist
      workingPlan = buildSavePlan(baselinePlaylist, workingPlaylist, detail)
      if (workingPlan.errors.length > 0) {
        throw createError({
          statusCode: 400,
          message: workingPlan.errors[0],
        })
      }
      job.tracks = createTrackProgress(workingPlaylist)
      extractActions = workingPlan.tracks.filter(
        (action): action is Extract<SaveTrackAction, { kind: 'extract-youtube' }> =>
          action.kind === 'extract-youtube',
      )
      reuseActions = workingPlan.tracks.filter(
        action => action.kind === 'reuse-yoto' || action.kind === 'passthrough-stream',
      )
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

    for (const action of extractActions) {
      if (skipDownloadYoutubeIds.has(action.youtubeId)) continue
      const probed = durationByYoutubeId.get(action.youtubeId)
      if (probed) continue
      const track = workingPlaylist[action.playlistIndex]
      if (!track || !saveNeedsProbedDuration(track)) continue
      throw createError({
        statusCode: 500,
        message: `Could not measure duration for "${track.title}". Check the source and try again.`,
      })
    }

    const extractCount = extractActions.length
    const trackSpan = extractCount > 0
      ? (OVERALL_TRACKS_END - OVERALL_START) / extractCount
      : 0

    const processedYoutubeIds = new Set<string>()
    let extractOrdinal = 0

    for (const action of extractActions) {
      if (processedYoutubeIds.has(action.youtubeId)) continue
      processedYoutubeIds.add(action.youtubeId)

      const group = extractActions.filter(item => item.youtubeId === action.youtubeId)
      const firstIndex = group[0]!.playlistIndex
      const trackBase = OVERALL_START + extractOrdinal * trackSpan * group.length
      const actualDuration = durationByYoutubeId.get(action.youtubeId)
      const orderedGroup = [...group].sort((a, b) => {
        const aIndex = workingPlaylist[a.playlistIndex]?.split?.index ?? a.playlistIndex
        const bIndex = workingPlaylist[b.playlistIndex]?.split?.index ?? b.playlistIndex
        return aIndex - bIndex
      })
      const groupTracks = orderedGroup
        .map(item => workingPlaylist[item.playlistIndex])
        .filter((track): track is PlaylistTrack => Boolean(track))
      let extractPlan = planYoutubeGroupExtract({
        youtubeId: action.youtubeId,
        tracks: groupTracks,
        normalizeVolume,
        actualDuration,
      })
      const shouldCut = extractPlan.shouldCut

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
        extractOrdinal += 1
      }

      if (shouldCut) {
        const ordered = [...group].sort((a, b) => {
          const aIndex = workingPlaylist[a.playlistIndex]?.split?.index ?? a.playlistIndex
          const bIndex = workingPlaylist[b.playlistIndex]?.split?.index ?? b.playlistIndex
          return aIndex - bIndex
        })
        const cachedHits = await Promise.all(ordered.map(async (part) => {
          const track = workingPlaylist[part.playlistIndex]
          if (!track) return null
          const key = extractCutCacheKey(action.youtubeId, track, normalizeVolume, actualDuration)
          if (!key) return null
          const record = await readSplitPartTranscodeCache(audioWorkDir, key)
          return transcodedFromSplitCache(record)
        }))
        extractPlan = planYoutubeGroupExtract({
          youtubeId: action.youtubeId,
          tracks: groupTracks,
          normalizeVolume,
          actualDuration,
          cacheHits: cachedHits,
        })
        if (extractPlan.skipDownload) {
          for (let partIndex = 0; partIndex < ordered.length; partIndex++) {
            const hit = cachedHits[partIndex]
            if (!hit) continue
            finishExtractedPart(ordered[partIndex]!.playlistIndex, hit)
          }
          setJobProgress({
            status: 'uploading',
            progress: Math.min(OVERALL_TRACKS_END, trackBase + trackSpan * group.length),
            operationProgress: 100,
          })
          continue
        }
      }

      const downloaded = downloadedByYoutubeId.get(action.youtubeId)
      if (!downloaded) {
        throw createError({
          statusCode: 500,
          message: `Missing download for YouTube video ${action.youtubeId}`,
        })
      }

      let uploadSourcePath = downloaded.filePath
      let uploadSourceName = downloaded.filename
      let didNormalize = false
      if (extractPlan.loudnormFullFile) {
        for (const part of group) updateTrack(job, part.playlistIndex, 'leveling')
        setJobProgress({
          status: 'downloading',
          progress: trackBase + trackSpan * 0.14,
          operationProgress: 20,
        })
        const levelDir = path.join(audioWorkDir, 'jobs', jobId, action.youtubeId)
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
          didNormalize = true
        }
      }

      if (shouldCut) {
        const ordered = [...group].sort((a, b) => {
          const aIndex = workingPlaylist[a.playlistIndex]?.split?.index ?? a.playlistIndex
          const bIndex = workingPlaylist[b.playlistIndex]?.split?.index ?? b.playlistIndex
          return aIndex - bIndex
        })

        const splitDir = path.join(audioWorkDir, 'jobs', jobId, action.youtubeId, 'parts')
        await mkdir(splitDir, { recursive: true })
        const sourceSha256 = await hashFileSha256(uploadSourcePath)

        for (let partIndex = 0; partIndex < ordered.length; partIndex++) {
          const part = ordered[partIndex]!
          const track = workingPlaylist[part.playlistIndex]!
          const range = effectiveCutRange(track, actualDuration)
          if (!range) {
            throw createError({
              statusCode: 500,
              message: `Could not cut "${track.title}".`,
            })
          }
          const cacheKey = extractCutCacheKey(
            action.youtubeId,
            track,
            normalizeVolume,
            actualDuration,
          )
          if (cacheKey) {
            const cached = transcodedFromSplitCache(
              await readSplitPartTranscodeCache(audioWorkDir, cacheKey, sourceSha256),
            )
            if (cached) {
              finishExtractedPart(part.playlistIndex, cached)
              continue
            }
          }

          const destPath = path.join(splitDir, `part${track.split?.index ?? partIndex}.m4a`)
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
              message: `Could not trim "${track.title}".`,
            })
          }

          let uploadPath = destPath
          if (normalizeVolume) {
            updateTrack(job, part.playlistIndex, 'leveling')
            const leveledPath = path.join(splitDir, `part${track.split?.index ?? partIndex}-leveled.m4a`)
            const leveled = await loudnormAudioFile(
              destPath,
              leveledPath,
              range.durationSeconds,
            )
            if (leveled) uploadPath = leveled
          }

          updateTrack(job, part.playlistIndex, 'uploading')
          const transcoded = await uploadAudioFile(
            accessToken,
            uploadPath,
            path.basename(uploadPath),
            {
              meta: {
                jobId,
                youtubeId: action.youtubeId,
                title: track.title,
                durationSeconds: range.durationSeconds,
                partLabel: track.split
                  ? `${track.split.index + 1}/${track.split.count}`
                  : undefined,
              },
              onTranscodePoll: ({ percent }) => {
                updateTrack(job, part.playlistIndex, 'transcoding')
                const transcodePercent = percent ?? 50
                setJobProgress({
                  status: 'uploading',
                  progress: trackBase + trackSpan * (partIndex + 0.22 + (transcodePercent / 100) * 0.78),
                  operationProgress: Math.min(98, Math.round(35 + transcodePercent * 0.63)),
                })
              },
            },
          )
          if (cacheKey) {
            await writeSplitPartTranscodeCache(audioWorkDir, cacheKey, transcoded, sourceSha256)
          }
          finishExtractedPart(part.playlistIndex, transcoded)
        }
      }
      else {
        if (!acknowledgeCapacityRisk) {
          const fileStat = await stat(uploadSourcePath)
          const mediaError = getTrackMediaLimitError({
            title: workingPlaylist[firstIndex]?.title ?? `Track ${firstIndex + 1}`,
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

        for (const part of group) {
          updateTrack(job, part.playlistIndex, 'uploading')
          setJobProgress({
            status: 'uploading',
            progress: trackBase + trackSpan * 0.22,
            operationProgress: 32,
          })

          const transcoded = await uploadAudioFile(
            accessToken,
            uploadSourcePath,
            uploadSourceName,
            {
              meta: {
                jobId,
                youtubeId: action.youtubeId,
                title: workingPlaylist[part.playlistIndex]?.title,
                durationSeconds: actualDuration ?? workingPlaylist[part.playlistIndex]?.duration,
                partLabel: group.length > 1
                  ? `${group.indexOf(part) + 1}/${group.length}`
                  : undefined,
              },
              onTranscodePoll: ({ percent }) => {
                updateTrack(job, part.playlistIndex, 'transcoding')
                const transcodePercent = percent ?? 50
                const withinTrack = 0.22 + (transcodePercent / 100) * 0.78
                setJobProgress({
                  status: 'uploading',
                  progress: trackBase + trackSpan * withinTrack,
                  operationProgress: Math.min(98, Math.round(35 + transcodePercent * 0.63)),
                })
              },
            },
          )
          finishExtractedPart(part.playlistIndex, transcoded)
        }
      }

      setJobProgress({
        status: 'uploading',
        progress: Math.min(OVERALL_TRACKS_END, trackBase + trackSpan * group.length),
        operationProgress: 100,
      })
    }

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
