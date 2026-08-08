import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOUIS_ENV_BINDINGS, louisRuntimeConfigDefaults } from './shared/louis-env.mjs'

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version?: string }

const louisEnv = louisRuntimeConfigDefaults()

/** Injected into nitro.mjs immediately before _sharedRuntimeConfig is frozen. */
const louisEnvAliasPreamble = `(()=>{try{const b=${JSON.stringify(
  LOUIS_ENV_BINDINGS.map(({ louis, nuxt }) => [louis, nuxt]),
)};for(const[l,n]of b){const v=process.env[l];if(v!=null&&String(v).trim()!=="")process.env[n]=String(v).trim()}}catch(_){}})();\n`

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  nitro: {
    hooks: {
      compiled(nitro) {
        // Must patch the nitro chunk: index.mjs import hoisting would run freeze before a preamble.
        const nitroPath = join(nitro.options.output.dir, 'server/chunks/nitro/nitro.mjs')
        const source = readFileSync(nitroPath, 'utf8')
        const marker = 'const _sharedRuntimeConfig'
        if (source.includes('/*louis-env-alias*/')) return
        const idx = source.indexOf(marker)
        if (idx === -1) {
          nitro.logger.warn('[louis-env] could not find _sharedRuntimeConfig to inject LOUIS_* alias')
          return
        }
        writeFileSync(
          nitroPath,
          `${source.slice(0, idx)}/*louis-env-alias*/${louisEnvAliasPreamble}${source.slice(idx)}`,
        )
      },
    },
  },
  // Production builds don't need client sourcemaps; disabling avoids noisy
  // SOURCEMAP_BROKEN warnings from @tailwindcss/vite and nuxt internals.
  sourcemap: false,
  css: ['./app/assets/css/main.css'],
  app: {
    head: {
      title: 'Louis',
      link: [
        { rel: 'icon', href: '/favicons/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicons/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicons/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/favicons/apple-touch-icon.png' },
        { rel: 'manifest', href: '/favicons/manifest.json' },
      ],
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        { name: 'theme-color', content: '#fff5f0' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Louis' },
        {
          name: 'apple-mobile-web-app-status-bar-style',
          content: 'default',
        },
        { name: 'application-name', content: 'Louis' },
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
          key: 'app-vvh',
          textContent:
            '(function(){try{var h=(window.visualViewport&&window.visualViewport.height)||window.innerHeight;'
            + 'if(h>0)document.documentElement.style.setProperty("--app-vvh",Math.round(h)+"px");'
            + '}catch(e){}})();',
        },
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
  // Prefer LOUIS_* at runtime (see .env.example); legacy NUXT_* still works.
  // Production: nitro compiled hook aliases LOUIS_* → NUXT_* in nitro.mjs before freeze.
  runtimeConfig: {
    youtubeApiKey: louisEnv.youtubeApiKey,
    yotoClientId: louisEnv.yotoClientId,
    yotoClientSecret: louisEnv.yotoClientSecret,
    yotoRedirectUri: louisEnv.yotoRedirectUri,
    ytdlpPath: louisEnv.ytdlpPath,
    // Optional Netscape cookies.txt for yt-dlp (LOUIS_YTDLP_COOKIES_FILE). Anon-first; used on escalate.
    ytdlpCookiesFile: louisEnv.ytdlpCookiesFile,
    audioWorkDir: louisEnv.audioWorkDir,
    audioJobMaxAgeMs: louisEnv.audioJobMaxAgeMs,
    audioCacheMaxAgeMs: louisEnv.audioCacheMaxAgeMs,
    audioCacheMaxBytes: louisEnv.audioCacheMaxBytes,
    enableDebugRoutes: louisEnv.enableDebugRoutes,
    public: {
      demoMode: false,
      appVersion: packageJson.version || '0.0.0',
      /** Set LOUIS_PUBLIC_DESKTOP=1 by the Electron host when spawning Nitro. */
      desktop: louisEnv.publicDesktop,
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
