import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parsePeakWindow, peakDecodeArgs } from './ffmpeg-peaks.ts'

describe('parsePeakWindow', () => {
  it('reads a part 1 window that starts at 0', () => {
    assert.deepEqual(
      parsePeakWindow({ start: '0', duration: '1800' }),
      { startSeconds: 0, durationSeconds: 1800 },
    )
  })

  it('reads a later-part window', () => {
    assert.deepEqual(
      parsePeakWindow({ start: '1800', duration: '1700' }),
      { startSeconds: 1800, durationSeconds: 1700 },
    )
  })

  it('ignores missing or invalid bounds', () => {
    assert.equal(parsePeakWindow({}), null)
    assert.equal(parsePeakWindow({ start: '10' }), null)
    assert.equal(parsePeakWindow({ duration: '10' }), null)
    assert.equal(parsePeakWindow({ start: '-1', duration: '10' }), null)
    assert.equal(parsePeakWindow({ start: '0', duration: '0' }), null)
  })
})

describe('peakDecodeArgs', () => {
  it('decodes the full file when no window is given', () => {
    const args = peakDecodeArgs('/in.m4a')
    assert.equal(args.includes('-ss'), false)
    assert.equal(args.includes('-t'), false)
    assert.ok(args.indexOf('-i') >= 0)
    assert.equal(args[args.indexOf('-i') + 1], '/in.m4a')
  })

  it('limits part 1 with -t and no -ss', () => {
    const args = peakDecodeArgs('/in.m4a', { startSeconds: 0, durationSeconds: 1800 })
    assert.equal(args.includes('-ss'), false)
    const tAt = args.indexOf('-t')
    const inputAt = args.indexOf('-i')
    assert.ok(tAt >= 0 && tAt < inputAt)
    assert.equal(args[tAt + 1], '1800')
  })

  it('seeks later parts with -ss and -t before the input', () => {
    const args = peakDecodeArgs('/in.m4a', { startSeconds: 1800, durationSeconds: 1700 })
    const ssAt = args.indexOf('-ss')
    const tAt = args.indexOf('-t')
    const inputAt = args.indexOf('-i')
    assert.ok(ssAt >= 0 && tAt > ssAt && inputAt > tAt)
    assert.equal(args[ssAt + 1], '1800')
    assert.equal(args[tAt + 1], '1700')
  })
})
