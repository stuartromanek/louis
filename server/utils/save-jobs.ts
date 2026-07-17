import type { H3Event } from 'h3'
import type {
  PlaylistTrack,
  SaveJobState,
  SaveJobTrackProgress,
  SaveTrackStatus,
  TranscodedAudioResult,
} from '#shared/myo-editor/types'
import { buildProvenance } from '#shared/myo-editor/parseProvenance'
import { buildSavePlan } from '#shared/myo-editor/buildSavePlan'
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
import { uploadAudioFile } from './yoto-media'
import { createOrUpdateContent } from './yoto-content'
import { mergeContentMetadata } from './yoto-metadata'
import { fetchYotoCardDetail } from './yoto-card-detail'
import { getYotoAccessToken } from './yoto'

const jobs = new Map<string, SaveJobState>()

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
  Object.assign(job, patch)
}

/** Title of the track currently being extracted/uploaded, if any. */
function activeSaveTrackTitle(job: SaveJobState): string | undefined {
  const active = job.tracks.find(track => (
    track.status === 'extracting'
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
  cardId: string,
  playlist: PlaylistTrack[],
  cardTitle: string,
  baselinePlaylist: PlaylistTrack[],
  options?: { acknowledgeCapacityRisk?: boolean },
): SaveJobState {
  const jobId = crypto.randomUUID()
  const acknowledgeCapacityRisk = options?.acknowledgeCapacityRisk === true
  const job: SaveJobState = {
    id: jobId,
    cardId,
    status: 'planning',
    progress: 0,
    operationProgress: 0,
    tracks: createTrackProgress(playlist),
    createdAt: Date.now(),
  }
  jobs.set(jobId, job)

  void (async () => {
    try {
      const accessToken = await getYotoAccessToken(event)
      await runSaveJob(
        event,
        accessToken,
        jobId,
        cardId,
        playlist,
        cardTitle,
        baselinePlaylist,
        acknowledgeCapacityRisk,
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
  cardId: string,
  playlist: PlaylistTrack[],
  cardTitle: string,
  baselinePlaylist: PlaylistTrack[],
  acknowledgeCapacityRisk: boolean,
) {
  const job = jobs.get(jobId)
  if (!job) return

  const uploadedByIndex = new Map<number, TranscodedAudioResult>()

  try {
    const detail = await fetchYotoCardDetail(cardId, accessToken)

    const plan = buildSavePlan(baselinePlaylist, playlist, detail)
    if (plan.errors.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: plan.errors[0],
      })
    }

    const extractActions = plan.tracks.filter(action => action.kind === 'extract-youtube')
    const reuseActions = plan.tracks.filter(
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
      const trackCountError = getTrackCountLimitError(playlist.length)
      if (trackCountError) {
        throw createError({
          statusCode: 400,
          statusMessage: trackCountError,
        })
      }
    }

    const extractCount = extractActions.length
    const trackSpan = extractCount > 0
      ? (OVERALL_TRACKS_END - OVERALL_START) / extractCount
      : 0

    let pauseBeforeNextExtract = false

    for (let trackIndex = 0; trackIndex < extractActions.length; trackIndex++) {
      const action = extractActions[trackIndex]!
      const index = action.playlistIndex
      const trackBase = OVERALL_START + trackIndex * trackSpan

      if (pauseBeforeNextExtract) {
        await new Promise(resolve => setTimeout(resolve, 5_000))
        pauseBeforeNextExtract = false
      }

      updateTrack(job, index, 'extracting')
      setJobProgress({
        status: 'downloading',
        progress: trackBase + trackSpan * 0.05,
        operationProgress: 8,
      })

      const downloaded = await downloadYoutubeAudio(action.youtubeId, event, {
        enforceMyoSizeLimit: !acknowledgeCapacityRisk,
      })
      pauseBeforeNextExtract = Boolean(downloaded.recoveredFromRetryableFailure)
      updateTrack(job, index, 'uploading')
      setJobProgress({
        status: 'uploading',
        progress: trackBase + trackSpan * 0.22,
        operationProgress: 32,
      })

      const transcoded = await uploadAudioFile(
        accessToken,
        downloaded.filePath,
        downloaded.filename,
        {
          onTranscodePoll: ({ percent }) => {
            updateTrack(job, index, 'transcoding')
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
      uploadedByIndex.set(index, transcoded)
      if (!acknowledgeCapacityRisk) {
        const mediaError = getTrackMediaLimitError({
          title: playlist[index]?.title ?? `Track ${index + 1}`,
          duration: transcoded.transcodedInfo.duration,
          fileSize: transcoded.transcodedInfo.fileSize,
        })
        if (mediaError) {
          throw createError({
            statusCode: 413,
            statusMessage: mediaError,
          })
        }
      }
      updateTrack(job, index, 'ready')

      setJobProgress({
        status: 'uploading',
        progress: trackBase + trackSpan,
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
      playlist,
      plan.tracks,
      uploadedByIndex,
      {
        existingMetadataNote: detail.metadataNote,
        existingContentVersion: detail.contentVersion,
      },
    )

    const builtTrackCount = built.chapters.reduce(
      (sum, chapter) => sum + chapter.tracks.length,
      0,
    )
    if (builtTrackCount !== playlist.length) {
      throw createError({
        statusCode: 500,
        statusMessage: `Save built ${builtTrackCount} tracks but playlist has ${playlist.length}`,
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
              statusMessage: mediaError,
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
          statusMessage: totalsError,
        })
      }
    }

    await createOrUpdateContent(accessToken, {
      cardId,
      title: cardTitle,
      content: {
        version: built.contentVersion,
        chapters: built.chapters,
      },
      metadata: mergeContentMetadata(detail.metadata, {
        title: cardTitle,
        note: built.note,
        media: {
          duration: built.totalDuration,
          fileSize: built.totalFileSize,
          readableFileSize: Math.round((built.totalFileSize / 1024 / 1024) * 10) / 10,
        },
      }),
    })

    updateJob(jobId, { status: 'complete', progress: 100, operationProgress: 100 })
  }
  catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    const trackTitle = activeSaveTrackTitle(job)
      ?? firstOverLimitTrackTitle(playlist, uploadedByIndex)
    const message = withMappedYotoLimitError(
      e.statusMessage ?? e.message ?? 'Save failed',
      trackTitle,
    )

    for (const track of job.tracks) {
      if (track.status === 'pending' || track.status === 'extracting' || track.status === 'uploading' || track.status === 'transcoding') {
        track.status = 'failed'
        track.error = message
      }
    }

    updateJob(jobId, { status: 'failed', error: message, progress: 100 })
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
