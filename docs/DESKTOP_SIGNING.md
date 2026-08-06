# Desktop code signing & notarization

Local smoke does **not** require signing. Use:

```bash
npm run desktop:dir          # unpackaged .app / win-unpacked
npm run desktop:build:host   # host-arch DMG (mac) unsigned
```

`electron-builder.yml` sets `mac.identity: null` and scripts set `CSC_IDENTITY_AUTO_DISCOVERY=false` so a developer cert on the machine is not picked up accidentally (nested yt-dlp `Python.framework` previously broke codesign).

## CI / release (Phase 5+)

When attaching signed installers to GitHub Releases, set these secrets on the repo (names are conventional; wire them in the workflow):

### macOS

| Secret | Purpose |
|--------|---------|
| `CSC_LINK` | Base64 of `.p12` Developer ID Application certificate |
| `CSC_KEY_PASSWORD` | Password for that `.p12` |
| `APPLE_ID` | Apple ID for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Team ID |

Also set (or derive) in the job:

- `CSC_IDENTITY_AUTO_DISCOVERY=true` (or omit the false override)
- Remove / override `mac.identity: null` for the release job so electron-builder signs with Developer ID
- Notarization: electron-builder `notarize: true` (or `@electron/notarize`) after signing

Artifact names (already configured):

- `Louis-<version>-arm64.dmg`
- `Louis-<version>-x64.dmg`

### Windows

| Secret | Purpose |
|--------|---------|
| `CSC_LINK` | Base64 of `.pfx` code-signing cert (can share env name with mac in separate jobs) |
| `CSC_KEY_PASSWORD` | PFX password |

Unsigned NSIS is fine for internal smoke; SmartScreen will warn end users until signed.

Artifact name: `Louis-Setup-<version>.exe`

## Binary matrix before packaging

Full release builds must fetch bins for every shipped arch:

```bash
npm run desktop:fetch-binaries -- darwin-arm64 darwin-x64 win32-x64
```

Host-only smoke only needs the current platform (default `desktop:fetch-binaries`).
