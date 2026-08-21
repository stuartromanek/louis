/** Overlay hint only — the client must not fail a save the server has not failed. */
export const SAVE_POLL_SLOW_MS = 10 * 60 * 1000
/** After this long, keep polling but show the still-working hint even if percent is moving. */
export const SAVE_POLL_CEILING_MS = 90 * 60 * 1000

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
