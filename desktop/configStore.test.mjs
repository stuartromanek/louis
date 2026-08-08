import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  DESKTOP_REDIRECT_URI,
  applyDesktopConfigToEnv,
  createConfigStore,
  desktopConfigNeedsSetup,
  effectiveDesktopConfig,
  mergeDesktopConfig,
  normalizeDesktopConfig,
} from './configStore.mjs'

const fullConfig = {
  yotoClientId: 'client-a',
  yotoClientSecret: 'KEEP_ME',
  youtubeApiKey: 'yt-key',
  ytdlpCookiesFile: '/tmp/cookies.txt',
}

describe('mergeDesktopConfig', () => {
  it('keeps yotoClientSecret when prefs-style patch omits it', () => {
    const merged = mergeDesktopConfig(fullConfig, {
      yotoClientId: 'client-b',
      youtubeApiKey: 'yt-key-2',
    })
    assert.equal(merged.yotoClientSecret, 'KEEP_ME')
    assert.equal(merged.yotoClientId, 'client-b')
    assert.equal(merged.youtubeApiKey, 'yt-key-2')
  })

  it('keeps secret when updating client id, youtube key, and cookies', () => {
    const merged = mergeDesktopConfig(fullConfig, {
      yotoClientId: 'client-c',
      youtubeApiKey: 'yt-3',
      ytdlpCookiesFile: '/other/cookies.txt',
    })
    assert.equal(merged.yotoClientSecret, 'KEEP_ME')
    assert.equal(merged.ytdlpCookiesFile, '/other/cookies.txt')
  })

  it('clears secret when patch explicitly sets empty string', () => {
    const merged = mergeDesktopConfig(fullConfig, { yotoClientSecret: '' })
    assert.equal(merged.yotoClientSecret, '')
    assert.equal(merged.yotoClientId, 'client-a')
  })

  it('returns normalized current for null or undefined patch', () => {
    assert.deepEqual(mergeDesktopConfig(fullConfig, null), normalizeDesktopConfig(fullConfig))
    assert.deepEqual(mergeDesktopConfig(fullConfig, undefined), normalizeDesktopConfig(fullConfig))
  })

  it('trims whitespace on merge', () => {
    const merged = mergeDesktopConfig(
      { yotoClientId: '  a  ', yotoClientSecret: '  KEEP_ME  ', youtubeApiKey: '  yt  ' },
      { youtubeApiKey: '  yt-new  ' },
    )
    assert.equal(merged.yotoClientId, 'a')
    assert.equal(merged.yotoClientSecret, 'KEEP_ME')
    assert.equal(merged.youtubeApiKey, 'yt-new')
  })
})

describe('desktopConfigNeedsSetup', () => {
  it('returns false when both required fields are present', () => {
    assert.equal(
      desktopConfigNeedsSetup({ yotoClientId: 'id', youtubeApiKey: 'yt' }),
      false,
    )
  })

  it('returns true when yotoClientId is missing', () => {
    assert.equal(desktopConfigNeedsSetup({ youtubeApiKey: 'yt' }), true)
  })

  it('returns true when youtubeApiKey is missing', () => {
    assert.equal(desktopConfigNeedsSetup({ yotoClientId: 'id' }), true)
  })

  it('treats whitespace-only as missing', () => {
    assert.equal(
      desktopConfigNeedsSetup({ yotoClientId: '   ', youtubeApiKey: 'yt' }),
      true,
    )
    assert.equal(
      desktopConfigNeedsSetup({ yotoClientId: 'id', youtubeApiKey: '  ' }),
      true,
    )
  })
})

describe('effectiveDesktopConfig', () => {
  it('prefers stored values over env', () => {
    const effective = effectiveDesktopConfig(fullConfig, {
      LOUIS_YOTO_CLIENT_ID: 'env-client',
      LOUIS_YOUTUBE_API_KEY: 'env-yt',
      LOUIS_YOTO_CLIENT_SECRET: 'env-secret',
    })
    assert.equal(effective.yotoClientId, 'client-a')
    assert.equal(effective.youtubeApiKey, 'yt-key')
    assert.equal(effective.yotoClientSecret, 'KEEP_ME')
  })

  it('fills blank stored fields from LOUIS_*', () => {
    const effective = effectiveDesktopConfig(
      {},
      {
        LOUIS_YOTO_CLIENT_ID: 'louis-id',
        LOUIS_YOUTUBE_API_KEY: 'louis-yt',
        LOUIS_YOTO_CLIENT_SECRET: 'louis-secret',
        LOUIS_YTDLP_COOKIES_FILE: '/louis/cookies.txt',
      },
    )
    assert.equal(effective.yotoClientId, 'louis-id')
    assert.equal(effective.youtubeApiKey, 'louis-yt')
    assert.equal(effective.yotoClientSecret, 'louis-secret')
    assert.equal(effective.ytdlpCookiesFile, '/louis/cookies.txt')
  })

  it('prefers LOUIS_* over NUXT_* when both set', () => {
    const effective = effectiveDesktopConfig(
      {},
      {
        LOUIS_YOTO_CLIENT_ID: 'louis-id',
        NUXT_YOTO_CLIENT_ID: 'nuxt-id',
        LOUIS_YOUTUBE_API_KEY: 'louis-yt',
        NUXT_YOUTUBE_API_KEY: 'nuxt-yt',
      },
    )
    assert.equal(effective.yotoClientId, 'louis-id')
    assert.equal(effective.youtubeApiKey, 'louis-yt')
  })

  it('fills blanks from legacy NUXT_* alone', () => {
    const effective = effectiveDesktopConfig(
      {},
      {
        NUXT_YOTO_CLIENT_ID: 'nuxt-id',
        NUXT_YOUTUBE_API_KEY: 'nuxt-yt',
        NUXT_YOTO_CLIENT_SECRET: 'nuxt-secret',
      },
    )
    assert.equal(effective.yotoClientId, 'nuxt-id')
    assert.equal(effective.youtubeApiKey, 'nuxt-yt')
    assert.equal(effective.yotoClientSecret, 'nuxt-secret')
  })
})

describe('applyDesktopConfigToEnv', () => {
  it('always sets desktop flag and forced redirect URI', () => {
    const env = {}
    applyDesktopConfigToEnv(env, {})
    assert.equal(env.LOUIS_PUBLIC_DESKTOP, '1')
    assert.equal(env.NUXT_PUBLIC_DESKTOP, '1')
    assert.equal(env.LOUIS_YOTO_REDIRECT_URI, DESKTOP_REDIRECT_URI)
    assert.equal(env.NUXT_YOTO_REDIRECT_URI, DESKTOP_REDIRECT_URI)
  })

  it('dual-writes credentials when present', () => {
    const env = {}
    applyDesktopConfigToEnv(env, fullConfig)
    assert.equal(env.LOUIS_YOTO_CLIENT_ID, 'client-a')
    assert.equal(env.NUXT_YOTO_CLIENT_ID, 'client-a')
    assert.equal(env.LOUIS_YOTO_CLIENT_SECRET, 'KEEP_ME')
    assert.equal(env.NUXT_YOTO_CLIENT_SECRET, 'KEEP_ME')
    assert.equal(env.LOUIS_YOUTUBE_API_KEY, 'yt-key')
    assert.equal(env.NUXT_YOUTUBE_API_KEY, 'yt-key')
    assert.equal(env.LOUIS_YTDLP_COOKIES_FILE, '/tmp/cookies.txt')
    assert.equal(env.NUXT_YTDLP_COOKIES_FILE, '/tmp/cookies.txt')
  })

  it('omits empty optional credential fields', () => {
    const env = {
      LOUIS_YOTO_CLIENT_SECRET: 'pre-existing',
      NUXT_YOTO_CLIENT_SECRET: 'pre-existing',
    }
    applyDesktopConfigToEnv(env, {
      yotoClientId: 'id',
      youtubeApiKey: 'yt',
      yotoClientSecret: '',
      ytdlpCookiesFile: '',
    })
    assert.equal(env.LOUIS_YOTO_CLIENT_ID, 'id')
    assert.equal(env.LOUIS_YOUTUBE_API_KEY, 'yt')
    assert.equal(env.LOUIS_YOTO_CLIENT_SECRET, 'pre-existing')
    assert.equal(env.NUXT_YOTO_CLIENT_SECRET, 'pre-existing')
    assert.equal(env.LOUIS_YTDLP_COOKIES_FILE, undefined)
    assert.equal(env.NUXT_YTDLP_COOKIES_FILE, undefined)
  })
})

describe('createConfigStore', () => {
  /** @type {string[]} */
  const tempDirs = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  function tempStore() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'louis-config-'))
    tempDirs.push(dir)
    return createConfigStore(fs, path, dir)
  }

  it('preserves secret across prefs-style merge write/read', () => {
    const store = tempStore()
    store.write(fullConfig)
    const saved = store.write(
      mergeDesktopConfig(store.read(), {
        yotoClientId: 'client-b',
        youtubeApiKey: 'yt-2',
      }),
    )
    assert.equal(saved.yotoClientSecret, 'KEEP_ME')
    assert.equal(store.read().yotoClientSecret, 'KEEP_ME')
    assert.equal(store.read().yotoClientId, 'client-b')
  })

  it('returns empty normalized config when file is missing', () => {
    const store = tempStore()
    assert.deepEqual(store.read(), normalizeDesktopConfig({}))
  })

  it('returns empty normalized config when file is corrupt', () => {
    const store = tempStore()
    fs.mkdirSync(path.dirname(store.configPath), { recursive: true })
    fs.writeFileSync(store.configPath, '{not-json', 'utf8')
    assert.deepEqual(store.read(), normalizeDesktopConfig({}))
  })
})
