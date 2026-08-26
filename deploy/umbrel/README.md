# Umbrel community app store bundle

Ready-to-copy files for an [Umbrel Community App Store](https://github.com/getumbrel/umbrel-community-app-store).

## Publish (maintainer)

1. Fork [getumbrel/umbrel-community-app-store](https://github.com/getumbrel/umbrel-community-app-store) (Use this template).
2. Copy into the fork root:
   - `umbrel-app-store.yml` → set your store `id` / `name` if not using `louis`.
   - `louis-louis/` directory (app id must be `{store-id}-louis`).
3. Push to your fork.
4. On Umbrel: **App Store → Community app stores → Add** → paste your fork’s GitHub URL.

Users install **Louis** from your community store; the app pulls `stuartromanek/louis:latest` from Docker Hub.

## Configure after install

- Set **LOUIS_YOTO_CLIENT_ID** in the app’s environment settings.
- Register redirect URI on [yoto.dev](https://yoto.dev/get-started/start-here/) matching how you open Louis (Umbrel hostname + port 4000).
- Optional **LOUIS_YOUTUBE_API_KEY** for faster search.

See [docs/HOSTING.md](../../docs/HOSTING.md) for the full checklist.
