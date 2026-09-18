import assert from 'node:assert/strict'
import { mkdir, writeFile, rm, readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  canCopyPreviewAsM4a,
  materializeSaveM4aFromPreview,
  previewToSaveM4aArgs,
} from './ffmpeg-m4a.ts'

describe('canCopyPreviewAsM4a', () => {
  it('copies m4a/aac/mp4 and remuxes other containers', () => {
    assert.equal(canCopyPreviewAsM4a('abc.m4a'), true)
    assert.equal(canCopyPreviewAsM4a('abc.AAC'), true)
    assert.equal(canCopyPreviewAsM4a('abc.mp4'), true)
    assert.equal(canCopyPreviewAsM4a('abc.webm'), false)
    assert.equal(canCopyPreviewAsM4a('abc.opus'), false)
  })
})

describe('previewToSaveM4aArgs', () => {
  it('encodes AAC into an m4a container', () => {
    const args = previewToSaveM4aArgs('/tmp/src.webm', '/tmp/out.m4a')
    assert.deepEqual(args.slice(0, 5), ['-hide_banner', '-nostats', '-y', '-i', '/tmp/src.webm'])
    assert.ok(args.includes('aac'))
    assert.equal(args.at(-1), '/tmp/out.m4a')
  })
})

describe('materializeSaveM4aFromPreview', () => {
  it('copies an existing m4a preview into the save cache', async () => {
    const dir = path.join(os.tmpdir(), `louis-preview-remux-${Date.now()}`)
    const previewPath = path.join(dir, 'cache', 'preview', 'dQw4w9wgXcQ.m4a')
    const destPath = path.join(dir, 'cache', 'save', 'dQw4w9wgXcQ.m4a')
    try {
      await mkdir(path.dirname(previewPath), { recursive: true })
      await writeFile(previewPath, 'm4a-bytes')
      const result = await materializeSaveM4aFromPreview({ previewPath, destPath })
      assert.equal(result?.copied, true)
      assert.equal(result?.destPath, destPath)
      assert.equal(await readFile(destPath, 'utf8'), 'm4a-bytes')
      assert.ok((await stat(destPath)).size > 0)
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns null for a missing or empty preview file', async () => {
    const dir = path.join(os.tmpdir(), `louis-preview-empty-${Date.now()}`)
    try {
      await mkdir(dir, { recursive: true })
      assert.equal(
        await materializeSaveM4aFromPreview({
          previewPath: path.join(dir, 'missing.webm'),
          destPath: path.join(dir, 'out.m4a'),
        }),
        null,
      )
      const empty = path.join(dir, 'empty.webm')
      await writeFile(empty, '')
      assert.equal(
        await materializeSaveM4aFromPreview({
          previewPath: empty,
          destPath: path.join(dir, 'out.m4a'),
        }),
        null,
      )
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
