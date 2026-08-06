# Desktop code signing & notarization

Local smoke does **not** require signing. Use:

```bash
npm run desktop:dir          # unpackaged .app / win-unpacked
npm run desktop:build:host   # host-arch DMG (mac) unsigned
```

`electron-builder.yml` sets `mac.identity: null` and scripts set `CSC_IDENTITY_AUTO_DISCOVERY=false` so a developer cert on the machine is not picked up accidentally (nested yt-dlp `Python.framework` previously broke codesign).

## CI / release (Phase 5)

[`.github/workflows/release.yml`](../.github/workflows/release.yml) on `v*` tags:

1. GHCR Docker image (`:latest` + `:{tag}`)
2. macOS DMGs + Windows NSIS (currently **unsigned**)
3. Upload to the GitHub Release for that tag

Local smoke does **not** require signing:

```bash
npm run desktop:dir          # unpackaged .app / win-unpacked
npm run desktop:build:host   # host-arch DMG (mac) unsigned
npm run desktop:build:mac    # both mac DMGs
npm run desktop:build:win    # NSIS
```

`electron-builder.yml` sets `mac.identity: null` and CI sets `CSC_IDENTITY_AUTO_DISCOVERY=false` so a developer cert on the machine is not picked up accidentally (nested yt-dlp `Python.framework` previously broke codesign).

## Signing secrets (optional, post–Phase 5)

When you are ready for signed installers, set these secrets and update the workflow / builder config to stop forcing `identity: null` / `CSC_IDENTITY_AUTO_DISCOVERY=false`:

### macOS

| Secret | Purpose |
|--------|---------|
| `CSC_LINK` | Base64 of `.p12` Developer ID Application certificate |
| `CSC_KEY_PASSWORD` | Password for that `.p12` |
| `APPLE_ID` | Apple ID for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Team ID |

Also set (or derive) in the job:

- Drop `CSC_IDENTITY_AUTO_DISCOVERY=false` override when secrets are present
- Override `mac.identity: null` for the release job so electron-builder signs with Developer ID
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
