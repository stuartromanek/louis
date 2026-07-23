# Roadmap

Ideas and planned work for **Louis**. Order is not a commitment; priorities may shift.

## Planned

### [Yoto Icons](https://yotoicons.com/) integration

Browse and apply community 16×16 pixel icons from [yotoicons.com](https://yotoicons.com/) when editing MYO cards / tracks (Yoto `display.icon16x16`).

Possible shape: search/browse in-app, pick an icon, attach it to a chapter or track before save.

### Pixel art editor

In-app 16×16 editor for custom Yoto display icons — draw or tweak pixel art, then save as the track/chapter icon alongside the playlist.

Pairs naturally with Yoto Icons (edit a community icon or start from scratch).

### Auto long-track split

When a YouTube source exceeds Yoto’s per-track duration cap (~1 hour), automatically split it into sequential MYO tracks (e.g. Part 1 / Part 2) on extract/save so long podcasts and albums still fit.

### Home Assistant add-on

Package Louis as a [Home Assistant](https://www.home-assistant.io/) add-on so users can install and run it from their HA instance (config via add-on options, data volume for the audio work dir).

### Docker Hub (and image registries)

Publish official images beyond GHCR — e.g. Docker Hub — so `docker pull` / compose examples work from the registries people already use. Confirm whether GHCR alone is enough or multi-registry release is worth the maintenance.

### Other hosting / “one-click” images

Explore pre-canned deploy targets that consume container images (Railway templates, Coolify, CasaOS / Umbrel-style app stores, etc.) so self-hosters can spin Louis up without hand-rolling compose.

### Horizontal My Cards scrolling

Investigate and fix horizontal scrolling issues in the My Cards panel (overflow, scroll snap, touch/trackpad behavior, layout width).

## Done / shipped

Tracked in git history and the README feature list rather than here.
