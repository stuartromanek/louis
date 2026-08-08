#!/usr/bin/env node
/**
 * Build an unsigned host-arch macOS DMG for local smoke.
 * Full matrix: npm run desktop:build
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'

const steps = [
  ['npm', ['run', 'desktop:sync-version']],
  ['npm', ['run', 'desktop:fetch-binaries']],
  ['npm', ['run', 'build']],
  ['npx', ['electron-builder', '--mac', 'dmg', `--${arch}`, '--publish', 'never']],
]

for (const [cmd, args] of steps) {
  console.log(`[desktop:build:host] ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log(`[desktop:build:host] done — see desktop/out/Louis-*-${arch}.dmg`)
