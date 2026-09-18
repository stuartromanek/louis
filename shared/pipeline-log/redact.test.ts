import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  excerptYtdlpOutput,
  parseYtdlpFormatInfo,
  redactYtdlpArgs,
  redactYtdlpText,
} from './redact.ts'

describe('redactYtdlpArgs', () => {
  it('replaces --cookies path and js-runtime file path', () => {
    assert.deepEqual(
      redactYtdlpArgs([
        '-f', 'ba/b',
        '--cookies', '/Users/stu/secrets/cookies.txt',
        '--js-runtimes', 'node:/Users/stu/Library/Application Support/Louis/shim',
        '--',
        'https://www.youtube.com/watch?v=dQw4w9wgXcQ',
      ]),
      [
        '-f', 'ba/b',
        '--cookies', '<redacted>',
        '--js-runtimes', 'node:<redacted>',
        '--',
        'https://www.youtube.com/watch?v=dQw4w9wgXcQ',
      ],
    )
  })
})

describe('excerptYtdlpOutput', () => {
  it('keeps ERROR and format lines and redacts cookie paths', () => {
    const excerpt = excerptYtdlpOutput([
      '[youtube] dQw4w9wgXcQ: Downloading webpage',
      '[info] dQw4w9wgXcQ: Downloading 1 format(s): 251',
      'ERROR: [youtube] dQw4w9wgXcQ: Sign in to confirm you’re not a bot. Use --cookies /tmp/cookies.txt',
    ].join('\n'))
    assert.match(excerpt, /Downloading 1 format\(s\): 251/)
    assert.match(excerpt, /ERROR:/)
    assert.match(excerpt, /--cookies <redacted>/)
    assert.doesNotMatch(excerpt, /\/tmp\/cookies\.txt/)
    assert.doesNotMatch(excerpt, /Downloading webpage/)
  })

  it('clips to maxBytes from the end', () => {
    const excerpt = excerptYtdlpOutput('ERROR: hello world', { maxBytes: 8 })
    assert.ok(excerpt.startsWith('…'))
    assert.ok(excerpt.length <= 10)
  })
})

describe('parseYtdlpFormatInfo', () => {
  it('parses after_move TSV from stdout', () => {
    assert.deepEqual(
      parseYtdlpFormatInfo('251\twebm\topus\t160\t12345\n'),
      { formatId: '251', ext: 'webm', acodec: 'opus', abr: '160', filesize: '12345' },
    )
  })

  it('falls back to stderr format line', () => {
    assert.equal(
      parseYtdlpFormatInfo(
        '',
        '[info] abc: Downloading 1 format(s): 140\n[download] Destination: abc.m4a\n',
      ).formatId,
      '140',
    )
  })
})

describe('redactYtdlpText', () => {
  it('redacts node shim paths in stderr', () => {
    const text = redactYtdlpText('using node:/Users/stu/Louis.app/Contents/MacOS/Louis')
    assert.equal(text, 'using node:<redacted>')
  })
})
