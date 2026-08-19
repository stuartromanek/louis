import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  isPersistentAudioWorkDir,
  isYtdlpVersionNewer,
  nightlyAssetForHost,
  parseSha256Sums,
  ytdlpVersionStamp,
} from './ytdlp-tools.ts'

describe('ytdlpVersionStamp', () => {
  it('orders nightly after same-day stable', () => {
    assert.equal(isYtdlpVersionNewer('2026.08.18.232845', '2026.08.18'), true)
    assert.equal(isYtdlpVersionNewer('2026.08.18', '2026.08.18.232845'), false)
    assert.equal(isYtdlpVersionNewer('2026.07.04', '2026.08.18'), false)
    assert.ok(ytdlpVersionStamp('2026.08.18.232845') > ytdlpVersionStamp('2026.08.18'))
  })

  it('returns 0 for unparseable versions', () => {
    assert.equal(ytdlpVersionStamp('unknown'), 0)
  })
})

describe('parseSha256Sums', () => {
  it('parses GNU coreutils style lines', () => {
    const map = parseSha256Sums(
      'b0724470a0cf6dae5175a87eee05d6e75c5a0c10d2c3015166bd4d34e92b1b7b  yt-dlp_macos.zip\n'
      + 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa *yt-dlp_linux\n',
    )
    assert.equal(map.get('yt-dlp_macos.zip'), 'b0724470a0cf6dae5175a87eee05d6e75c5a0c10d2c3015166bd4d34e92b1b7b')
    assert.equal(map.get('yt-dlp_linux'), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  })
})

describe('nightlyAssetForHost', () => {
  it('picks onedir zips on mac and windows', () => {
    assert.equal(nightlyAssetForHost('darwin', 'arm64').name, 'yt-dlp_macos.zip')
    assert.equal(nightlyAssetForHost('darwin', 'arm64').kind, 'zip')
    assert.equal(nightlyAssetForHost('win32', 'x64').name, 'yt-dlp_win.zip')
    assert.equal(nightlyAssetForHost('win32', 'x64').kind, 'zip')
  })

  it('picks standalone linux binaries', () => {
    assert.equal(nightlyAssetForHost('linux', 'x64').name, 'yt-dlp_linux')
    assert.equal(nightlyAssetForHost('linux', 'x64').kind, 'file')
    assert.equal(nightlyAssetForHost('linux', 'arm64').name, 'yt-dlp_linux_aarch64')
  })
})

describe('isPersistentAudioWorkDir', () => {
  it('treats OS temp as ephemeral (npm run dev default)', () => {
    assert.equal(isPersistentAudioWorkDir(path.join(os.tmpdir(), 'yoto-cards-audio')), false)
  })

  it('treats Docker/desktop data dirs as persistent', () => {
    assert.equal(isPersistentAudioWorkDir('/data/audio'), true)
  })
})
