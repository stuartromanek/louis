import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SAVE_JOB_LOST_MESSAGE,
  SAVE_MIN_COMPLETE_DISPLAY_MS,
  SAVE_POLL_ACTIVE_MS,
  SAVE_POLL_CEILING_MS,
  SAVE_POLL_DEFAULT_MS,
  SAVE_POLL_SLOW_MS,
  attachSaveJobId,
  createLocalPlanningSave,
  saveCompleteDisplayWaitMs,
  saveOperationBarShouldReset,
  savePollHitCeiling,
  savePollIntervalMs,
  savePollIsSlowWait,
  saveProgressStamp,
  shouldAbandonClientPoll,
} from './savePoll.ts'

describe('save poll watchdog', () => {
  it('ignores heartbeat-only updatedAt so a quiet transcode can show still-working', () => {
    assert.equal(
      saveProgressStamp({ status: 'uploading', progress: 40, operationProgress: 50 }),
      saveProgressStamp({ status: 'uploading', progress: 40, operationProgress: 50 }),
    )
  })

  it('treats a 10-minute progress freeze as slow, not failed', () => {
    assert.equal(savePollIsSlowWait(SAVE_POLL_SLOW_MS - 1), false)
    assert.equal(savePollIsSlowWait(SAVE_POLL_SLOW_MS), true)
  })

  it('keeps the 90-minute hard ceiling', () => {
    assert.equal(savePollHitCeiling(SAVE_POLL_CEILING_MS - 1), false)
    assert.equal(savePollHitCeiling(SAVE_POLL_CEILING_MS), true)
  })

  it('does not abandon a still-running job at the 90-minute ceiling', () => {
    assert.equal(
      shouldAbandonClientPoll({ jobStatus: 'uploading', httpStatus: 200 }),
      false,
    )
    assert.equal(
      shouldAbandonClientPoll({ jobStatus: 'uploading' }),
      false,
    )
    assert.equal(shouldAbandonClientPoll({ httpStatus: 404 }), true)
    assert.ok(SAVE_JOB_LOST_MESSAGE.includes('Check your playlist in Yoto'))
  })
})

describe('save overlay start', () => {
  it('can exist with jobId unset, then bind when POST returns', () => {
    const pending = createLocalPlanningSave({
      saveKey: 'card-1',
      snapshot: { playlist: [] },
      startedAt: 1,
    })
    assert.equal('jobId' in pending, false)
    assert.equal(pending.status, 'planning')
    assert.equal(pending.progress, 0)

    const bound = attachSaveJobId(pending, 'job-1')
    assert.equal(bound.jobId, 'job-1')
    assert.equal(bound.status, 'planning')
    assert.equal(bound.saveKey, 'card-1')
  })
})

describe('save operation bar', () => {
  it('does not reset when only the label would change', () => {
    assert.equal(saveOperationBarShouldReset('job-1', 'job-1'), false)
  })

  it('does not reset when POST binds a jobId onto the local overlay', () => {
    assert.equal(saveOperationBarShouldReset(undefined, 'job-1'), false)
  })

  it('resets only when the overall job identity changes', () => {
    assert.equal(saveOperationBarShouldReset('job-1', 'job-2'), true)
  })
})

describe('save poll interval', () => {
  it('polls faster while uploading or a track is transcoding', () => {
    assert.equal(savePollIntervalMs('uploading'), SAVE_POLL_ACTIVE_MS)
    assert.equal(
      savePollIntervalMs('downloading', [{ status: 'transcoding' }]),
      SAVE_POLL_ACTIVE_MS,
    )
    assert.equal(
      savePollIntervalMs('downloading', [{ status: 'uploading' }]),
      SAVE_POLL_ACTIVE_MS,
    )
  })

  it('stays at 1s for planning, downloading, and posting', () => {
    assert.equal(savePollIntervalMs('planning'), SAVE_POLL_DEFAULT_MS)
    assert.equal(savePollIntervalMs('downloading'), SAVE_POLL_DEFAULT_MS)
    assert.equal(savePollIntervalMs('posting'), SAVE_POLL_DEFAULT_MS)
  })
})

describe('save complete display floor', () => {
  it('skips the floor after a long extract', () => {
    assert.equal(saveCompleteDisplayWaitMs(0, 60_000), 0)
  })

  it('keeps the floor for a near-instant complete', () => {
    assert.equal(saveCompleteDisplayWaitMs(1000, 1000), SAVE_MIN_COMPLETE_DISPLAY_MS)
    assert.equal(saveCompleteDisplayWaitMs(1000, 1200), SAVE_MIN_COMPLETE_DISPLAY_MS - 200)
  })
})
