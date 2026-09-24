import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildFeedbackUrl } from './feedbackUrl.ts'

describe('buildFeedbackUrl', () => {
  it('prefills the running Louis version in the feedback form', () => {
    const url = new URL(buildFeedbackUrl('1.2.5'))

    assert.equal(url.searchParams.get('usp'), 'pp_url')
    assert.equal(url.searchParams.get('entry.1332721159'), 'Louis v1.2.5')
  })

  it('includes non-identifying desktop runtime details', () => {
    const url = new URL(buildFeedbackUrl('1.2.5', {
      electronVersion: '37.10.3',
      platform: 'darwin',
      arch: 'arm64',
    }))

    assert.equal(
      url.searchParams.get('entry.1332721159'),
      'Louis v1.2.5 · Electron 37.10.3 · macOS arm64',
    )
  })

  it('uses an explicit fallback when the version is unavailable', () => {
    const url = new URL(buildFeedbackUrl('  '))

    assert.equal(url.searchParams.get('entry.1332721159'), 'Louis version unknown')
  })
})
