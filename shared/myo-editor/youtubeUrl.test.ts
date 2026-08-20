import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyYoutubeSearchInput,
  extractYoutubeIdFromUrl,
  parseYoutubeChannelUrl,
} from './youtubeUrl.ts'

describe('extractYoutubeIdFromUrl', () => {
  it('reads watch, youtu.be, shorts, embed, and live HTTPS URLs', () => {
    assert.equal(
      extractYoutubeIdFromUrl('https://www.youtube.com/watch?v=dQw4w9wgGcQ&t=12'),
      'dQw4w9wgGcQ',
    )
    assert.equal(
      extractYoutubeIdFromUrl('https://youtu.be/dQw4w9wgGcQ?si=abc'),
      'dQw4w9wgGcQ',
    )
    assert.equal(
      extractYoutubeIdFromUrl('https://www.youtube.com/shorts/dQw4w9wgGcQ'),
      'dQw4w9wgGcQ',
    )
    assert.equal(
      extractYoutubeIdFromUrl('https://www.youtube.com/embed/dQw4w9wgGcQ'),
      'dQw4w9wgGcQ',
    )
    assert.equal(
      extractYoutubeIdFromUrl('https://www.youtube.com/live/dQw4w9wgGcQ'),
      'dQw4w9wgGcQ',
    )
    assert.equal(
      extractYoutubeIdFromUrl('https://music.youtube.com/watch?v=dQw4w9wgGcQ'),
      'dQw4w9wgGcQ',
    )
  })

  it('rejects http, spoofed hosts, and bare ids', () => {
    assert.equal(extractYoutubeIdFromUrl('http://youtube.com/watch?v=dQw4w9wgGcQ'), null)
    assert.equal(extractYoutubeIdFromUrl('https://youtube.com.example/watch?v=dQw4w9wgGcQ'), null)
    assert.equal(extractYoutubeIdFromUrl('dQw4w9wgGcQ'), null)
  })
})

describe('parseYoutubeChannelUrl', () => {
  it('reads channel id, handle, user, and custom URLs', () => {
    assert.deepEqual(
      parseYoutubeChannelUrl('https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw'),
      { kind: 'channel', channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw' },
    )
    assert.deepEqual(
      parseYoutubeChannelUrl('https://www.youtube.com/@SesameStreet/videos'),
      { kind: 'channel', handle: 'SesameStreet' },
    )
    assert.deepEqual(
      parseYoutubeChannelUrl('https://www.youtube.com/user/SesameStreet'),
      { kind: 'channel', username: 'SesameStreet' },
    )
    assert.deepEqual(
      parseYoutubeChannelUrl('https://www.youtube.com/c/SesameStreet'),
      { kind: 'channel', custom: 'SesameStreet' },
    )
  })

  it('rejects spoofed hosts and youtu.be', () => {
    assert.equal(parseYoutubeChannelUrl('https://youtube.com.example/@foo'), null)
    assert.equal(parseYoutubeChannelUrl('https://youtu.be/@foo'), null)
  })
})

describe('classifyYoutubeSearchInput', () => {
  it('lets list= win over a video id', () => {
    assert.deepEqual(
      classifyYoutubeSearchInput('https://www.youtube.com/watch?v=dQw4w9wgGcQ&list=PLabcdefghij'),
      { kind: 'playlist', playlistId: 'PLabcdefghij' },
    )
  })

  it('classifies video, channel, and text', () => {
    assert.deepEqual(
      classifyYoutubeSearchInput('https://youtu.be/dQw4w9wgGcQ'),
      { kind: 'video', videoId: 'dQw4w9wgGcQ' },
    )
    assert.deepEqual(
      classifyYoutubeSearchInput('https://www.youtube.com/shorts/dQw4w9wgGcQ'),
      { kind: 'video', videoId: 'dQw4w9wgGcQ' },
    )
    assert.deepEqual(
      classifyYoutubeSearchInput('https://www.youtube.com/@SesameStreet'),
      { kind: 'channel', handle: 'SesameStreet' },
    )
    assert.deepEqual(
      classifyYoutubeSearchInput('lofi hip hop'),
      { kind: 'text', q: 'lofi hip hop' },
    )
  })
})
