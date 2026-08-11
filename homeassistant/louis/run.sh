#!/usr/bin/env bash
# Map Home Assistant Supervisor /data/options.json → LOUIS_* env, then start Nitro.
set -euo pipefail

export OPTIONS_FILE="${OPTIONS_FILE:-/data/options.json}"

if [[ -f "$OPTIONS_FILE" ]]; then
  # Parse with Node (base image has it; avoids depending on jq).
  eval "$(node --input-type=commonjs <<'NODE'
const fs = require('fs')
const path = process.env.OPTIONS_FILE || '/data/options.json'
const o = JSON.parse(fs.readFileSync(path, 'utf8'))

function shellExport(key, value) {
  if (value === undefined || value === null) return
  const s = String(value)
  if (s === '') return
  // Safe single-quoted shell string
  const quoted = "'" + s.replace(/'/g, `'\\''`) + "'"
  process.stdout.write('export ' + key + '=' + quoted + '\n')
}

shellExport('LOUIS_YOTO_CLIENT_ID', o.yoto_client_id)
shellExport('LOUIS_YOUTUBE_API_KEY', o.youtube_api_key)
shellExport('LOUIS_YOTO_REDIRECT_URI', o.yoto_redirect_uri)
shellExport('LOUIS_YTDLP_COOKIES_FILE', o.ytdlp_cookies_file)
shellExport('LOUIS_AUDIO_CACHE_MAX_AGE_MS', o.audio_cache_max_age_ms)
shellExport('LOUIS_AUDIO_CACHE_MAX_BYTES', o.audio_cache_max_bytes)

const secure = o.cookie_secure === true || o.cookie_secure === 'true'
process.stdout.write("export LOUIS_COOKIE_SECURE='" + (secure ? 'true' : 'false') + "'\n")
NODE
)"
fi

mkdir -p /data/audio
export LOUIS_AUDIO_WORK_DIR="${LOUIS_AUDIO_WORK_DIR:-/data/audio}"
export NUXT_AUDIO_WORK_DIR="${NUXT_AUDIO_WORK_DIR:-$LOUIS_AUDIO_WORK_DIR}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-4000}"
export NODE_ENV="${NODE_ENV:-production}"

cd /app
exec node .output/server/index.mjs
