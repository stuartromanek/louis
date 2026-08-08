#!/usr/bin/env node
/**
 * Keep desktop/package.json version in sync with the repo root package.json
 * (electron-builder reads directories.app = desktop).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const rootPkgPath = path.join(root, 'package.json')
const desktopPkgPath = path.join(root, 'desktop', 'package.json')

const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'))
const desktopPkg = JSON.parse(readFileSync(desktopPkgPath, 'utf8'))

if (desktopPkg.version === rootPkg.version) {
  console.log(`[sync-version] desktop already ${rootPkg.version}`)
  process.exit(0)
}

desktopPkg.version = rootPkg.version
writeFileSync(desktopPkgPath, `${JSON.stringify(desktopPkg, null, 2)}\n`)
console.log(`[sync-version] desktop → ${rootPkg.version}`)
