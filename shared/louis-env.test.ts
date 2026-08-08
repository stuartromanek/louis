import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  aliasLouisEnvToNuxtProcessEnv,
  applyLouisEnvToRuntimeConfig,
  pickEnvFrom,
  pickLouisEnv,
  setLouisAndNuxtEnv,
} from './louis-env.mjs'

const ENV_KEYS = [
  'LOUIS_YOUTUBE_API_KEY',
  'NUXT_YOUTUBE_API_KEY',
  'LOUIS_YOTO_CLIENT_ID',
  'NUXT_YOTO_CLIENT_ID',
  'LOUIS_YOTO_CLIENT_SECRET',
  'NUXT_YOTO_CLIENT_SECRET',
  'LOUIS_PUBLIC_DESKTOP',
  'NUXT_PUBLIC_DESKTOP',
  'LOUIS_ENABLE_DEBUG_ROUTES',
  'NUXT_ENABLE_DEBUG_ROUTES',
  'LOUIS_AUDIO_JOB_MAX_AGE_MS',
  'NUXT_AUDIO_JOB_MAX_AGE_MS',
] as const

describe('pickLouisEnv / pickEnvFrom', () => {
  it('prefers LOUIS over NUXT when both set', () => {
    assert.equal(
      pickLouisEnv('LOUIS_YOTO_CLIENT_SECRET', 'NUXT_YOTO_CLIENT_SECRET', {
        LOUIS_YOTO_CLIENT_SECRET: 'louis-secret',
        NUXT_YOTO_CLIENT_SECRET: 'nuxt-secret',
      }),
      'louis-secret',
    )
  })

  it('falls back to NUXT when LOUIS is empty', () => {
    assert.equal(
      pickLouisEnv('LOUIS_YOUTUBE_API_KEY', 'NUXT_YOUTUBE_API_KEY', {
        LOUIS_YOUTUBE_API_KEY: '  ',
        NUXT_YOUTUBE_API_KEY: 'nuxt-yt',
      }),
      'nuxt-yt',
    )
  })

  it('trims and skips empty or whitespace values', () => {
    assert.equal(pickEnvFrom({ A: '  x  ', B: 'y' }, 'A', 'B'), 'x')
    assert.equal(pickEnvFrom({ A: '', B: '  ', C: 'z' }, 'A', 'B', 'C'), 'z')
    assert.equal(pickEnvFrom({}, 'A', 'B'), '')
  })
})

describe('aliasLouisEnvToNuxtProcessEnv', () => {
  it('copies LOUIS onto NUXT for secret and public.desktop', () => {
    const env: Record<string, string | undefined> = {
      LOUIS_YOTO_CLIENT_SECRET: ' KEEP_ME ',
      LOUIS_PUBLIC_DESKTOP: '1',
      NUXT_YOTO_CLIENT_SECRET: 'old',
    }
    aliasLouisEnvToNuxtProcessEnv(env)
    assert.equal(env.NUXT_YOTO_CLIENT_SECRET, 'KEEP_ME')
    assert.equal(env.NUXT_PUBLIC_DESKTOP, '1')
  })

  it('overwrites existing NUXT when LOUIS is set', () => {
    const env: Record<string, string | undefined> = {
      LOUIS_YOUTUBE_API_KEY: 'louis-yt',
      NUXT_YOUTUBE_API_KEY: 'nuxt-yt',
    }
    aliasLouisEnvToNuxtProcessEnv(env)
    assert.equal(env.NUXT_YOUTUBE_API_KEY, 'louis-yt')
  })

  it('leaves NUXT alone when LOUIS is empty', () => {
    const env: Record<string, string | undefined> = {
      LOUIS_YOUTUBE_API_KEY: '',
      NUXT_YOUTUBE_API_KEY: 'nuxt-yt',
    }
    aliasLouisEnvToNuxtProcessEnv(env)
    assert.equal(env.NUXT_YOUTUBE_API_KEY, 'nuxt-yt')
  })
})

describe('setLouisAndNuxtEnv', () => {
  it('sets both keys', () => {
    const env: Record<string, string | undefined> = {}
    setLouisAndNuxtEnv(env, 'LOUIS_YOTO_CLIENT_ID', 'NUXT_YOTO_CLIENT_ID', 'abc')
    assert.equal(env.LOUIS_YOTO_CLIENT_ID, 'abc')
    assert.equal(env.NUXT_YOTO_CLIENT_ID, 'abc')
  })

  it('no-ops on empty value', () => {
    const env: Record<string, string | undefined> = {
      LOUIS_YOTO_CLIENT_ID: 'keep',
    }
    setLouisAndNuxtEnv(env, 'LOUIS_YOTO_CLIENT_ID', 'NUXT_YOTO_CLIENT_ID', '')
    assert.equal(env.LOUIS_YOTO_CLIENT_ID, 'keep')
    assert.equal(env.NUXT_YOTO_CLIENT_ID, undefined)
  })
})

describe('applyLouisEnvToRuntimeConfig', () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = savedEnv[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('applies string, boolean, and number fields on a mutable config', () => {
    process.env.LOUIS_YOUTUBE_API_KEY = 'yt-from-env'
    process.env.LOUIS_YOTO_CLIENT_SECRET = 'secret-from-env'
    process.env.LOUIS_PUBLIC_DESKTOP = '1'
    process.env.LOUIS_ENABLE_DEBUG_ROUTES = 'true'
    process.env.LOUIS_AUDIO_JOB_MAX_AGE_MS = '12345'

    const config: Record<string, any> = {
      youtubeApiKey: '',
      yotoClientSecret: '',
      enableDebugRoutes: false,
      audioJobMaxAgeMs: 1,
      public: { desktop: false },
    }

    applyLouisEnvToRuntimeConfig(config)

    assert.equal(config.youtubeApiKey, 'yt-from-env')
    assert.equal(config.yotoClientSecret, 'secret-from-env')
    assert.equal(config.enableDebugRoutes, true)
    assert.equal(config.audioJobMaxAgeMs, 12345)
    assert.equal(config.public.desktop, true)
  })

  it('does not throw on frozen config and leaves values unchanged', () => {
    process.env.LOUIS_YOUTUBE_API_KEY = 'should-not-apply'
    process.env.LOUIS_PUBLIC_DESKTOP = '1'

    const config = Object.freeze({
      youtubeApiKey: 'baked',
      public: Object.freeze({ desktop: false }),
    })

    assert.doesNotThrow(() => applyLouisEnvToRuntimeConfig(config as Record<string, any>))
    assert.equal(config.youtubeApiKey, 'baked')
    assert.equal(config.public.desktop, false)
  })

  it('coerces public.desktop from true string', () => {
    process.env.LOUIS_PUBLIC_DESKTOP = 'true'
    const config: Record<string, any> = { public: { desktop: false } }
    applyLouisEnvToRuntimeConfig(config)
    assert.equal(config.public.desktop, true)
  })
})
