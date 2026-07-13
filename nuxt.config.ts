import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // Production builds don't need client sourcemaps; disabling avoids noisy
  // SOURCEMAP_BROKEN warnings from @tailwindcss/vite and nuxt internals.
  sourcemap: false,
  css: ['./app/assets/css/main.css'],
  components: [
    {
      path: '~/components/ui',
      pathPrefix: false,
    },
    {
      path: '~/components',
      ignore: ['ui'],
    },
  ],
  devServer: {
    port: 4000,
  },
  // Override at runtime via NUXT_* env vars (see .env.example). Empty defaults keep
  // Docker/production images configurable without rebuilding.
  runtimeConfig: {
    youtubeApiKey: '',
    yotoClientId: '',
    yotoClientSecret: '',
    yotoRedirectUri: 'http://localhost:4000/api/yoto/auth/callback',
    ytdlpPath: 'yt-dlp',
    audioWorkDir: '',
    audioJobMaxAgeMs: 3_600_000,
    audioCacheMaxAgeMs: 1_209_600_000,
    audioCacheMaxBytes: 5_368_709_120,
    enableDebugRoutes: false,
    public: {
      demoMode: false,
    },
  },
  vite: {
    plugins: [
      tailwindcss(),
      {
        name: 'suppress-sourcemap-broken-warnings',
        apply: 'build',
        configResolved(config) {
          const previous = config.build.rollupOptions.onwarn
          config.build.rollupOptions.onwarn = (warning, warn) => {
            if (warning.code === 'SOURCEMAP_BROKEN') return
            if (previous) previous(warning, warn)
            else warn(warning)
          }
        },
      },
    ],
    build: {
      sourcemap: false,
    },
  },
})
