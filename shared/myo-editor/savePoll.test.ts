import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SAVE_JOB_LOST_MESSAGE,
  SAVE_POLL_CEILING_MS,
  SAVE_POLL_SLOW_MS,
  savePollHitCeiling,
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
