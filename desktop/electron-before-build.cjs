'use strict'

/**
 * Electron main uses only Node builtins + Electron APIs.
 * Nitro ships via extraResources/.output.
 * Returning false skips install/rebuild AND packing production node_modules
 * (see app-builder-lib Packager / areNodeModulesHandledExternally).
 *
 * Do not set npmRebuild:false alongside this — that returns before beforeBuild runs.
 */
module.exports = async function beforeBuild() {
  return false
}
