<script setup lang="ts">
import { useDesktopHost } from '~/composables/useDesktopHost'

type ToolsStatus = {
  updateSupported: boolean
  ytdlp: { available: boolean, version?: string, managed?: boolean, error?: string }
  ffmpeg: { available: boolean, version?: string, error?: string }
  upstream?: { tag: string, url: string, newer: boolean, error?: string }
}

const props = defineProps<{
  disabled?: boolean
}>()

const { playEvent } = useUiSound()
const { hasElectronBridge } = useDesktopHost()

const status = ref<ToolsStatus | null>(null)
const loading = ref(false)
const checking = ref(false)
const updating = ref(false)
const message = ref('')
const error = ref('')

const busy = computed(() => loading.value || checking.value || updating.value)

async function loadStatus(check = false) {
  if (check) checking.value = true
  else loading.value = true
  error.value = ''
  if (check) message.value = ''
  try {
    status.value = await $fetch<ToolsStatus>('/api/tools/status', {
      query: check ? { check: '1' } : undefined,
    })
    if (check) {
      const upstream = status.value.upstream
      if (upstream?.error) {
        error.value = upstream.error
      }
      else if (upstream?.newer) {
        if (!status.value.updateSupported) {
          message.value = `Newer nightly available (${upstream.tag}). Upgrade yt-dlp on PATH with the command below, then restart npm run dev.`
        }
        else {
          message.value = `Newer yt-dlp nightly available (${upstream.tag}).`
        }
      }
      else if (upstream?.tag) {
        message.value = `yt-dlp is current (${upstream.tag}).`
      }
    }
  }
  catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not load tool versions'
  }
  finally {
    loading.value = false
    checking.value = false
  }
}

async function onCheck() {
  if (props.disabled || busy.value) return
  playEvent('buttonClick')
  await loadStatus(true)
}

async function onUpdate() {
  if (props.disabled || busy.value) return
  if (!status.value?.updateSupported) return
  playEvent('buttonPrimary')
  updating.value = true
  error.value = ''
  message.value = 'Downloading yt-dlp nightly…'
  try {
    const result = await $fetch<{ version: string, restartSuggested?: boolean }>('/api/tools/update', {
      method: 'POST',
      body: { target: 'ytdlp' },
    })
    message.value = `yt-dlp updated to ${result.version}.`
    await loadStatus(false)
    if (result.restartSuggested && hasElectronBridge.value && window.louisDesktop?.restartNitro) {
      message.value = `yt-dlp updated to ${result.version}. Restarting…`
      await window.louisDesktop.restartNitro()
    }
  }
  catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    error.value = fetchErr.data?.statusMessage || fetchErr.statusMessage || fetchErr.message || 'Update failed'
    message.value = ''
  }
  finally {
    updating.value = false
  }
}

const ytdlpVersion = computed(() => {
  const ytdlp = status.value?.ytdlp
  if (!ytdlp) return loading.value ? '…' : '—'
  if (!ytdlp.available) return ytdlp.error || 'Not found'
  return ytdlp.version || 'unknown'
})

const ytdlpManaged = computed(() => Boolean(status.value?.ytdlp?.available && status.value.ytdlp.managed))

const ffmpegVersion = computed(() => {
  const ffmpeg = status.value?.ffmpeg
  if (!ffmpeg) return loading.value ? '…' : '—'
  if (!ffmpeg.available) return ffmpeg.error || 'Not found'
  return shortFfmpegVersion(ffmpeg.version)
})

function shortFfmpegVersion(raw?: string): string {
  if (!raw) return 'unknown'
  const match = raw.match(/^ffmpeg version (\S+)/i)
  if (!match?.[1]) return raw
  return match[1].replace(/[,-]+$/, '')
}

const showUpdate = computed(() => Boolean(status.value?.updateSupported))

const showCheckOnlyHelp = computed(() => Boolean(status.value && !status.value.updateSupported))

const nightlyNotesUrl = computed(() =>
  status.value?.upstream?.url || 'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases',
)

const YTDLP_UPGRADE_COMMANDS = {
  brew: 'brew upgrade yt-dlp',
  pip: 'pip install -U --pre "yt-dlp[default]"',
} as const

type UpgradeCommandKind = keyof typeof YTDLP_UPGRADE_COMMANDS

const upgradeKind = ref<UpgradeCommandKind>('brew')
const commandCopied = ref(false)
let commandCopiedTimer: ReturnType<typeof setTimeout> | null = null

const upgradeCommand = computed(() => YTDLP_UPGRADE_COMMANDS[upgradeKind.value])
const copyCommandLabel = computed(() => (commandCopied.value ? 'Copied' : 'Copy command'))

function clearCommandCopiedTimer() {
  if (commandCopiedTimer) {
    clearTimeout(commandCopiedTimer)
    commandCopiedTimer = null
  }
}

async function copyUpgradeCommand() {
  if (props.disabled) return
  playEvent('select')
  const text = upgradeCommand.value
  try {
    await navigator.clipboard.writeText(text)
  }
  catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  clearCommandCopiedTimer()
  commandCopied.value = true
  commandCopiedTimer = setTimeout(() => {
    commandCopied.value = false
    commandCopiedTimer = null
  }, 1400)
}

watch(upgradeKind, () => {
  commandCopied.value = false
  clearCommandCopiedTimer()
})

onMounted(() => {
  if (!/Mac|iPhone|iPad/i.test(navigator.userAgent)) upgradeKind.value = 'pip'
})

onUnmounted(() => {
  clearCommandCopiedTimer()
})

watch(
  () => props.disabled,
  (disabled) => {
    if (!disabled && !status.value) void loadStatus(false)
  },
  { immediate: true },
)
</script>

<template>
  <div class="prefs-projector__section">
    <p class="prefs-projector__section-title">
      Download tools
    </p>
    <p class="prefs-projector__hint">
      YouTube extractors go stale between Louis releases. Check for a newer yt-dlp nightly. ffmpeg updates with the Louis image or desktop installer.
    </p>

    <table class="prefs-projector__table">
      <thead>
        <tr>
          <th
            scope="col"
            class="type-label font-maru-bold"
          >Tool</th>
          <th
            scope="col"
            class="type-label font-maru-bold"
          >Version</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th
            scope="row"
            class="type-label font-maru-bold"
          >yt-dlp</th>
          <td class="type-meta">
            {{ ytdlpVersion }}<template v-if="ytdlpManaged"> · in app data</template>
          </td>
        </tr>
        <tr>
          <th
            scope="row"
            class="type-label font-maru-bold"
          >ffmpeg</th>
          <td class="type-meta">{{ ffmpegVersion }}</td>
        </tr>
      </tbody>
    </table>

    <div class="prefs-projector__file-row">
      <button
        type="button"
        class="prefs-projector__browse maru-button maru-button--sm bg-maru-white text-maru-black"
        :disabled="disabled || busy"
        @click="onCheck"
      >
        <span class="maru-button__label">{{ checking ? 'Checking…' : 'Check for updates' }}</span>
      </button>
      <button
        v-if="showUpdate"
        type="button"
        class="prefs-projector__browse maru-button maru-button--sm bg-maru-blue text-maru-white"
        :disabled="disabled || busy || !status?.upstream?.newer"
        @click="onUpdate"
      >
        <span class="maru-button__label">{{ updating ? 'Updating…' : 'Update yt-dlp' }}</span>
      </button>
    </div>

    <p
      v-if="message"
      class="prefs-projector__hint"
    >
      {{ message }}
      <a
        v-if="status?.upstream?.newer && status.upstream.url"
        class="prefs-projector__hint-link"
        :href="status.upstream.url"
        target="_blank"
        rel="noopener noreferrer"
      >Release notes</a>
    </p>
    <div
      v-if="showCheckOnlyHelp"
      class="prefs-projector__field"
    >
      <p class="prefs-projector__hint">
        In-app Update is for Docker and the Louis desktop app. This checkout uses yt-dlp on PATH, so Louis will not replace it.
        When Check finds a newer
        <a
          class="prefs-projector__hint-link"
          :href="nightlyNotesUrl"
          target="_blank"
          rel="noopener noreferrer"
        >nightly</a>,
        upgrade it yourself, then restart <span class="font-maru-mono">npm run dev</span>.
      </p>
      <div class="prefs-projector__file-row">
        <input
          :value="upgradeCommand"
          class="prefs-projector__input font-maru-mono"
          type="text"
          readonly
          spellcheck="false"
          aria-label="yt-dlp upgrade command"
        >
        <select
          v-model="upgradeKind"
          class="prefs-projector__select"
          :disabled="disabled"
          aria-label="Package manager"
        >
          <option value="brew">
            brew
          </option>
          <option value="pip">
            pip
          </option>
        </select>
        <button
          type="button"
          class="prefs-projector__browse prefs-projector__copy prefs-projector__copy--wide maru-button"
          :disabled="disabled"
          :aria-label="commandCopied ? 'Command copied' : 'Copy command'"
          @click="copyUpgradeCommand"
        >
          <Transition
            name="prefs-copy-label"
            mode="out-in"
          >
            <span
              :key="copyCommandLabel"
              class="maru-button__label prefs-projector__copy-label"
            >{{ copyCommandLabel }}</span>
          </Transition>
        </button>
      </div>
    </div>
    <p
      v-if="error"
      class="prefs-projector__error"
    >
      {{ error }}
    </p>
  </div>
</template>
