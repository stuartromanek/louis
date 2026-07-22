import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version?: string }

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // Production builds don't need client sourcemaps; disabling avoids noisy
  // SOURCEMAP_BROKEN warnings from @tailwindcss/vite and nuxt internals.
  sourcemap: false,
  css: ['./app/assets/css/main.css'],
  app: {
    head: {
      title: 'yoto-cards',
      link: [
        { rel: 'icon', href: '/favicons/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicons/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicons/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/favicons/apple-touch-icon.png' },
        { rel: 'manifest', href: '/favicons/manifest.json' },
      ],
      meta: [
        { name: 'theme-color', content: '#fff5f0' },
      ],
      // Paint splash ground before Vue boots so the app never flashes underneath.
      style: [
        {
          key: 'app-splash-pending',
          textContent:
            'html.app-splash-pending{background:#fff5f0}'
            + 'html.app-splash-pending body{background:#fff5f0}'
            + 'html.app-splash-pending::before{content:"";position:fixed;inset:0;z-index:114;background:#fff5f0;pointer-events:none}',
        },
      ],
      script: [
        {
          key: 'app-splash-pending',
          // Runs before body parse; mirrors useAppSplash session/debug rules.
          textContent:
            '(function(){try{var d=document.documentElement;'
            + 'var debug=new URLSearchParams(location.search).get("splash")==="debug";'
            + 'var seen=sessionStorage.getItem("louis.splash.seen")==="1";'
            + 'var reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;'
            + 'if(debug||(!seen&&!reduced))d.classList.add("app-splash-pending");'
            + '}catch(e){document.documentElement.classList.add("app-splash-pending")}})();',
        },
      ],
    },
  },
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
    // Optional Netscape cookies.txt for yt-dlp (NUXT_YTDLP_COOKIES_FILE). Anon-first; used on escalate.
    ytdlpCookiesFile: '',
    audioWorkDir: '',
    audioJobMaxAgeMs: 3_600_000,
    audioCacheMaxAgeMs: 1_209_600_000,
    audioCacheMaxBytes: 5_368_709_120,
    enableDebugRoutes: false,
    public: {
      demoMode: false,
      appVersion: packageJson.version || '0.0.0',
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
