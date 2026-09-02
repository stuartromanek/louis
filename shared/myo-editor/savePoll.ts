/** Overlay hint only — the client must not fail a save the server has not failed. */
export const SAVE_POLL_SLOW_MS = 10 * 60 * 1000
/** After this long, keep polling but show the still-working hint even if percent is moving. */
export const SAVE_POLL_CEILING_MS = 90 * 60 * 1000
/** Default client poll while planning / downloading / posting. */
export const SAVE_POLL_DEFAULT_MS = 1000
/** Faster client poll while Yoto upload/transcode is the wait. */
export const SAVE_POLL_ACTIVE_MS = 400
/** Floor so a near-instant complete (empty create) does not flash the overlay. */
export const SAVE_MIN_COMPLETE_DISPLAY_MS = 450

export const SAVE_JOB_LOST_MESSAGE
  = 'Lost track of this save. Check your playlist in Yoto — the upload may still have finished — then Refresh.'

export function saveProgressStamp(job: {
  status: string
  progress: number
  operationProgress?: number
}): string {
  return `${job.status}:${job.progress}:${job.operationProgress ?? 0}`
}

export function savePollIsSlowWait(elapsedSinceProgressMs: number): boolean {
  return elapsedSinceProgressMs >= SAVE_POLL_SLOW_MS
}

export function savePollHitCeiling(elapsedSinceStartMs: number): boolean {
  return elapsedSinceStartMs >= SAVE_POLL_CEILING_MS
}

/** Only abandon the overlay when the job is gone — never because a living job ran long. */
export function shouldAbandonClientPoll(options: {
  jobStatus?: string
  httpStatus?: number
}): boolean {
  if (options.httpStatus === 404) return true
  void options.jobStatus
  return false
}

export function savePollIntervalMs(
  status: string,
  tracks?: Array<{ status: string }>,
): number {
  if (status === 'uploading') return SAVE_POLL_ACTIVE_MS
  if (tracks?.some(track => track.status === 'transcoding' || track.status === 'uploading')) {
    return SAVE_POLL_ACTIVE_MS
  }
  return SAVE_POLL_DEFAULT_MS
}

/** Local overlay before POST returns — `jobId` is unset until the server accepts the save. */
export function createLocalPlanningSave<TSnapshot>(input: {
  saveKey: string
  cardId?: string
  snapshot: TSnapshot
  startedAt: number
}) {
  return {
    saveKey: input.saveKey,
    cardId: input.cardId,
    status: 'planning' as const,
    progress: 0,
    operationProgress: 0,
    tracks: [] as [],
    snapshot: input.snapshot,
    startedAt: input.startedAt,
  }
}

export function attachSaveJobId<T extends object>(state: T, jobId: string): T & { jobId: string } {
  return { ...state, jobId }
}

/** Inner operation bar follows progress. Copy changes must not restart it; a new job may. */
export function saveOperationBarShouldReset(
  previousJobId: string | undefined,
  nextJobId: string | undefined,
): boolean {
  if (!previousJobId || !nextJobId) return false
  return previousJobId !== nextJobId
}

/** After a long save, skip the floor; after a flash-complete, wait the remainder. */
export function saveCompleteDisplayWaitMs(jobStartedAt: number, now = Date.now()): number {
  return Math.max(0, SAVE_MIN_COMPLETE_DISPLAY_MS - (now - jobStartedAt))
}
