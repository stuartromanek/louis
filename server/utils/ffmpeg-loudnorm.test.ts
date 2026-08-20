import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseLoudnormJson, secondPassLoudnormFilter } from './ffmpeg-loudnorm.ts'

const SAMPLE_STDERR = `
[Parsed_loudnorm_0 @ 0x123]
{
	"input_i" : "-27.21",
	"input_tp" : "-4.63",
	"input_lra" : "8.32",
	"input_thresh" : "-37.42",
	"output_i" : "-16.03",
	"output_tp" : "-1.51",
	"output_lra" : "8.20",
	"output_thresh" : "-26.41",
	"normalization_type" : "dynamic",
	"target_offset" : "0.03"
}
`

describe('parseLoudnormJson', () => {
  it('reads measured values from ffmpeg stderr', () => {
    const measured = parseLoudnormJson(SAMPLE_STDERR)
    assert.deepEqual(measured, {
      measuredI: '-27.21',
      measuredTP: '-4.63',
      measuredLRA: '8.32',
      measuredThresh: '-37.42',
      offset: '0.03',
    })
  })

  it('returns null when JSON is missing', () => {
    assert.equal(parseLoudnormJson('no stats here'), null)
  })
})

describe('secondPassLoudnormFilter', () => {
  it('builds a linear second-pass filter', () => {
    const filter = secondPassLoudnormFilter({
      measuredI: '-27.21',
      measuredTP: '-4.63',
      measuredLRA: '8.32',
      measuredThresh: '-37.42',
      offset: '0.03',
    })
    assert.equal(
      filter,
      'loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-27.21:measured_TP=-4.63:measured_LRA=8.32:measured_thresh=-37.42:offset=0.03:linear=true',
    )
  })
})
