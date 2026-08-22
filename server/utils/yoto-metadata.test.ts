import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mergeContentMetadata } from './yoto-metadata.ts'

const media = { duration: 10, fileSize: 20, readableFileSize: 0.1 }

describe('mergeContentMetadata', () => {
  it('preserves an existing cover when the patch omits cover', () => {
    const merged = mergeContentMetadata(
      {
        title: 'Old',
        author: 'Ada',
        cover: { imageL: 'https://cdn.yoto.io/old.png' },
        media: { duration: 1, fileSize: 2, readableFileSize: 0 },
      },
      { title: 'New', note: 'n', media },
    )
    assert.equal(merged.title, 'New')
    assert.equal(merged.author, 'Ada')
    assert.equal(merged.cover?.imageL, 'https://cdn.yoto.io/old.png')
  })

  it('sets cover on create when existing metadata is null', () => {
    const merged = mergeContentMetadata(null, {
      title: 'New',
      note: 'n',
      media,
      cover: { imageL: 'https://cdn.yoto.io/new.png' },
    })
    assert.equal(merged.cover?.imageL, 'https://cdn.yoto.io/new.png')
    assert.equal(merged.title, 'New')
  })

  it('replaces cover when the patch includes imageL', () => {
    const merged = mergeContentMetadata(
      { cover: { imageL: 'https://cdn.yoto.io/old.png' } },
      {
        title: 'Same',
        note: 'n',
        media,
        cover: { imageL: 'https://cdn.yoto.io/new.png' },
      },
    )
    assert.equal(merged.cover?.imageL, 'https://cdn.yoto.io/new.png')
  })
})
